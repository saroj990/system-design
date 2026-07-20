# Case Study 40 — Email at Scale (Gmail-Class)

Design a **planet-scale email platform** like Gmail: ingest mail via **SMTP**, store billions of messages, **index for search**, build **conversation threads**, filter **spam/phishing** at high accuracy, and serve **sub-second inbox loads** for hundreds of millions of users.

## 1. Problem

Email is deceptively simple (send text A → B) but operationally brutal:

1. **SMTP ingestion** from arbitrary Internet hosts — malformed messages, backscatter, greylisting  
2. **Storage** of petabytes with per-user mailbox semantics and quotas  
3. **Search** full-text across entire mailbox history in milliseconds  
4. **Threading** messages into conversations despite broken clients (missing headers)  
5. **Spam/abuse** — adaptive adversaries; false positives destroy trust  

The hard part is not delivering one email — it is **reliable pipeline orchestration + inverted indexes at billion-user scale** with strong abuse resistance.

## 2. Requirements

### Functional (MVP)

- **Send/receive** via SMTP (inbound MX, outbound MTA) and REST/IMAP-like API for clients  
- **Mailbox folders**: Inbox, Sent, Drafts, Trash, Spam, user labels  
- **Threading**: group by `Message-ID`, `In-Reply-To`, `References`, subject fallback  
- **Full-text search** subject/body/attachments metadata; filters (from:, has:attachment)  
- **Spam classification** + user report/override; phishing link detection  
- **Attachments** stored in object storage; virus scan  
- **Read/unread**, stars, archive; **undo send** (5 s window)  

### Out of scope (initially)

- End-to-end encryption (PGP) as default  
- Full Exchange ActiveSync compatibility layer  
- Calendar/contacts (separate services)  
- Legal e-discovery UI (enterprise add-on)  

### Non-functional

- **Inbox load p99 < 500 ms** (first page, 50 threads)  
- **Search p99 < 300 ms** for typical queries  
- **SMTP ingest**: process **1M+ messages/sec** globally (aggregate)  
- **Durability**: zero accepted inbound mail loss after 250 OK  
- **Spam precision**: **< 0.05%** false positive on ham; **> 99%** spam recall  
- **Scale**: **1.5B users**, **300B+ stored messages**, **50 PB** mail storage  
- **Availability 99.99%** for read path  

## 3. Back-of-the-envelope

Assumptions:

- 1.5B active mailboxes; **50 emails/user/day** received (incl. spam filtered)  
- Average stored message **50 KB** (body + headers; attachments extra in blob store)  
- 30% messages have **500 KB** attachment → blended avg **200 KB** stored per message  

```text
Inbound SMTP ≈ 1.5B × 50 / 86,400 ≈ 870,000 msg/s (before spam drop)
  Peak ~3M msg/s

Storage growth ≈ 870k × 200 KB × 86,400 ≈ 15 PB/day raw
  With dedupe/compression/index overhead ×1.5 ≈ 22 PB/day (tiered; not all hot)

Hot index for search:
  300B messages × 200 B doc id/terms pointer ≈ 60 TB inverted index shards (compressed)

Inbox read:
  1.5B users × 3 inbox opens/day ≈ 4.5B reads/day ≈ 52,000 QPS avg, peak 250k QPS

Thread metadata per user:
  avg 500 active threads × 200 B ≈ 100 KB/user hot cache → 150 TB if all resident (use LRU)

Spam model inference:
  3M/s × 2 ms GPU batch ≈ need large CPU/GPU fleet or heavy feature caching
```

**Insight:** **Separate the mail pipeline (async) from the read path (cached views)**. Search is an **inverted index problem**; inbox is a **precomputed thread list + snippet cache**.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  subgraph Internet
    EXT[External MTAs]
  end

  subgraph Inbound["Inbound Pipeline"]
    MX[MX Servers — SMTP]
    GREY[Greylist / RBL / SPF-DKIM-DMARC]
    QUEUE[(Inbound Queue — Kafka)]
    PIPE[Mail Processing Workers]
    SPAM[Spam / Phishing Classifier]
    VSCAN[Virus Scan]
    STORE[Mail Storage Writer]
  end

  subgraph Storage["Storage & Index"]
    META[(Mailbox Metadata — Bigtable)]
    BLOB[(Attachment Blob — Object Store)]
    SEARCH[(Search Index — Sharded Inverted)]
    THREAD[Threading Service]
  end

  subgraph Outbound
    OUTMTA[Outbound MTA]
    DLP[DLP / Rate Limits]
  end

  subgraph Read["Read Path"]
    API[Mail API / IMAP Gateway]
    INBOX[(Inbox Cache — Redis)]
    SNIP[Snippet / Preview Cache]
  end

  subgraph Clients
    WEB[Web Client]
    MOB[Mobile App]
  end

  EXT --> MX --> GREY --> QUEUE --> PIPE
  PIPE --> SPAM
  SPAM -->|ham| VSCAN --> STORE
  SPAM -->|spam| META
  STORE --> META
  STORE --> BLOB
  STORE --> THREAD
  THREAD --> META
  STORE --> SEARCH
  WEB --> API
  MOB --> API
  API --> INBOX
  API --> META
  API --> SEARCH
  API --> SNIP
  API --> OUTMTA
  OUTMTA --> DLP --> EXT
```

### Inbound SMTP sequence

```mermaid
sequenceDiagram
  participant S as Sender MTA
  participant M as MX Server
  participant Q as Inbound Queue
  participant W as Processor
  participant C as Spam Classifier
  participant D as Metadata Store
  participant I as Search Indexer

  S->>M: EHLO / MAIL FROM / RCPT TO / DATA
  M->>M: SPF, DKIM, DMARC, RBL
  M->>Q: enqueue raw MIME (after 250 OK)
  M-->>S: 250 OK
  Q->>W: deliver job
  W->>C: classify(features)
  alt ham
    W->>D: write message + update mailbox
    W->>I: index async
    W->>W: push notification
  else spam
    W->>D: write to Spam folder only
  end
```

### Components

| Component | Role |
|-----------|------|
| MX / SMTP gateway | TLS, recipient validation, backpressure, 250 OK only after durable enqueue |
| Auth checks | SPF, DKIM, DMARC alignment; reject/warn/quarantine policy |
| Processing workers | MIME parse, extract bodies, normalize charset, strip dangerous HTML |
| Spam classifier | Ensemble: rules + ML (logistic/GBDT) + URL reputation + user signals |
| Mail storage | Immutable message blobs; mailbox pointers per user |
| Threading service | Build conversation graph; update thread summary |
| Search index | Sharded inverted index; per-user ACL filter |
| Inbox cache | Materialized thread list sorted by last activity |
| Outbound MTA | Queue, retry, bounce generation, IP reputation pools |

### Threading model

```text
Primary: Message-ID graph
  In-Reply-To → parent Message-ID
  References → chain of Message-IDs

Fallback (broken clients):
  normalized_subject + participant set hash within 7-day window

Thread record:
  thread_id, user_id, subject, participant_ids[], last_message_at, snippet, unread_count
```

### Trade-offs

| Choice | Pros | Cons |
|--------|------|------|
| Accept then async process | Fast SMTP handshake; no loss after OK | Spam hits storage before filter |
| Reject spam at SMTP | Saves storage | False reject is catastrophic |
| Per-user inverted index | Fast scoped search | 1.5B indexes impossible — shared shards with ACL |
| Global index + user filter | Fewer shards | Query must filter by user_id |
| Strong thread precompute | Fast inbox | Write amplification on new reply |
| Eventual thread consistency | Cheaper writes | Brief mis-order in UI OK |

## 5. Low-Level Design (LLD)

### Mail APIs (REST-style)

```text
GET /v1/users/me/threads?label=INBOX&maxResults=50&pageToken=
→ {
     "threads": [
       { "threadId": "t_991", "snippet": "...", "unread": true, "participants": ["a@x.com"],
         "lastMessageAt": "2024-07-20T10:00:00Z", "messageCount": 4 }
     ],
     "nextPageToken": "..."
   }

GET /v1/users/me/threads/t_991/messages
→ { "messages": [ { "messageId", "from", "to", "subject", "bodyHtml", "attachments": [] } ] }

POST /v1/users/me/messages/send
Body: { "to": [], "subject", "body", "threadId": optional, "attachments": [] }
→ { "messageId", "threadId" }

GET /v1/users/me/search?q=from:boss subject:review after:2024/07/01
→ { "messageIds": ["m_1", "m_2"], "estimateTotal": 42 }

POST /v1/users/me/messages/m_991/modify
Body: { "addLabels": ["STARRED"], "removeLabels": ["UNREAD"] }

POST /v1/users/me/spam/report
Body: { "messageId": "m_991" }
```

### SMTP (inbound — simplified dialog)

```text
S: EHLO mx.example.com
M: 250-STARTTLS
S: STARTTLS
S: MAIL FROM:<sender@external.com>
M: 250 OK
S: RCPT TO:<user@gmail.com>
M: 250 OK
S: DATA
M: 354 Go ahead
S: [RFC 5322 MIME message]
S: .
M: 250 queued abc123   // only after durable write to Kafka/S3
```

### Schema

**Message store (immutable — object storage + pointer)**

```text
messages (
  message_id       TEXT PRIMARY KEY,
  raw_mime_key     TEXT,          -- S3 path
  size_bytes       BIGINT,
  internal_date    TIMESTAMP,
  parsed_headers   JSONB,
  body_text_key    TEXT,
  body_html_key    TEXT,
  checksum         TEXT
)
```

**Mailbox metadata (Bigtable / Cassandra — partitioned by user)**

```text
user_messages (
  user_id          BIGINT,
  mailbox_key      TEXT,          -- folder_label + sort_key
  message_id       TEXT,
  thread_id        TEXT,
  labels           SET<TEXT>,
  is_read          BOOLEAN,
  is_starred       BOOLEAN,
  received_at      TIMESTAMP,
  PRIMARY KEY ((user_id), mailbox_key, received_at, message_id)
)

threads (
  user_id          BIGINT,
  thread_id        TEXT,
  subject_norm     TEXT,
  participant_hash TEXT,
  last_msg_at      TIMESTAMP,
  snippet          TEXT,
  unread_count     INT,
  message_ids      LIST<TEXT>,
  PRIMARY KEY ((user_id), thread_id)
)
```

**Search index shard (Elasticsearch-like concept)**

```text
// Document ID = message_id; sharded by hash(message_id)
search_doc {
  message_id,
  user_id,              // ACL filter field
  thread_id,
  from_addr,
  to_addrs[],
  subject,
  body_tokens[],        // stemmed terms
  received_at,
  has_attachment,
  labels[]
}
```

**Spam training store**

```text
spam_features (
  message_id       TEXT,
  feature_vector   BLOB,
  label            ENUM('ham','spam','phishing'),
  user_override    BOOLEAN,
  model_version    TEXT
)
```

**Outbound queue**

```text
outbound_queue (
  job_id           UUID PRIMARY KEY,
  from_addr        TEXT,
  to_addrs         TEXT[],
  mime_key         TEXT,
  attempts         INT,
  next_retry_at    TIMESTAMP,
  status           ENUM('pending','sent','bounced')
)
```

### Modules

```text
SmtpSessionHandler
InboundAuthValidator (SPF/DKIM/DMARC)
MimeParser
MailPipelineWorker
SpamClassifier
  ├── RuleEngine (RBL, bulk score)
  ├── MLInferenceService
  └── UrlReputationClient
ThreadingEngine
MailboxWriter
SearchIndexer (async)
InboxMaterializer
MailApiController
OutboundMtaScheduler
AttachmentStore
VirusScannerAdapter
```

### Algorithm — inbound processing pipeline

```text
function processInbound(rawMime, rcptUser):
  msg = mimeParser.parse(rawMime)
  auth = validateSpfDkimDmarc(msg)
  if auth.failHardPolicy: return quarantineOrDrop()

  features = extractSpamFeatures(msg, auth, rcptUser)
  spamScore = classifier.predict(features)

  messageId = msg.headers.messageId or generate()
  storage.writeImmutable(msg)

  threadId = threadingEngine.resolve(rcptUser, msg)

  if spamScore > SPAM_THRESHOLD:
    mailbox.addMessage(rcptUser, messageId, labels=[SPAM], threadId)
  else:
    mailbox.addMessage(rcptUser, messageId, labels=[INBOX], threadId)
    inboxCache.invalidate(rcptUser)
    searchIndexer.enqueue(messageId, rcptUser)
    pushNotifier.notify(rcptUser, threadId, snippet)
```

### Algorithm — threading

```text
function resolveThread(userId, msg):
  if msg.inReplyTo:
    parent = mailbox.findByMessageId(userId, msg.inReplyTo)
    if parent: return parent.threadId

  if msg.references:
    for ref in reverse(msg.references):
      parent = mailbox.findByMessageId(userId, ref)
      if parent: return parent.threadId

  // fallback heuristic
  key = hash(normalizeSubject(msg.subject) + sortedParticipants(msg))
  candidate = threadIndex.lookup(userId, key, window=7days)
  if candidate: return candidate.threadId

  return createNewThread(userId, msg)
```

### Algorithm — inbox materialized view

```text
function getInbox(userId, pageToken, limit):
  cached = redis.get("inbox:" + userId)
  if cached and not stale(pageToken):
    return paginate(cached, pageToken, limit)

  rows = db.query(
    "SELECT * FROM threads WHERE user_id=? AND has_label INBOX ORDER BY last_msg_at DESC LIMIT ?",
    userId, limit + 1
  )
  redis.set("inbox:" + userId, rows, ttl=300)
  return paginate(rows, pageToken, limit)

function onNewMessage(userId, threadId):
  inboxCache.invalidate(userId)
  // or incremental: prepend thread if INBOX label
```

### Algorithm — search query

```text
function search(userId, queryAst):
  // Parse: from:boss subject:review → structured filters + free text
  shardQueries = routeToAllSearchShards(queryAst.freeText)
  results = []
  for shard in shardQueries:
    hits = shard.search(
      must=[{ term: user_id = userId }],   // mandatory ACL
      filter=queryAst.filters,
      text=queryAst.freeText,
      limit=100
    )
    results.merge(hits)
  return rankByRecency(results).take(50)
```

User_id filter **must** be first-class — never leak cross-tenant results.

### Algorithm — spam classification (ensemble)

```text
function predict(features):
  ruleScore = 0
  if features.senderInRbl: ruleScore += 50
  if features.dmarcFail: ruleScore += 30
  if features.urlReputationMax > 0.8: ruleScore += 40

  mlScore = gbdtModel.predict(features.toVector())  // 0..1

  final = max(ruleScore / 100, mlScore)
  if userHasSenderInContacts(features.from): final *= 0.3
  if userReportedSpamSender(features.from): final = max(final, 0.95)
  return final
```

### Algorithm — outbound send with undo window

```text
function sendMessage(userId, draft):
  jobId = outboundQueue.schedule(draft, deliverAfter=now+5s)
  redis.set("undo:" + jobId, draft, ttl=5)
  return { messageId, undoToken: jobId }

function undoSend(userId, undoToken):
  if outboundQueue.cancel(undoToken):
    return OK
  return TOO_LATE

function outboundWorker(job):
  mta.deliver(job.mime)
  mailbox.addSent(userId, job.messageId)
  onFailure: exponentialBackoff; generate DSN bounce after N tries
```

### Concurrency & correctness

- **250 OK only after enqueue durable** — Kafka acks=all or write to replicated storage  
- **Exactly-once mailbox writes**: idempotent on `message_id` — SMTP retries must not duplicate  
- **Label changes**: optimistic concurrency on thread row version  
- **Search eventual lag**: typically < 30 s; UI may show "indexing" state  
- **Quota enforcement**: check cumulative bytes before accept DATA; reject 552 if over limit  

## 6. Scale evolution

| Stage | Scale | Architecture |
|-------|-------|--------------|
| MVP | 1M users | Single region; Postfix + MySQL; Elasticsearch; rules-only spam |
| Growth | 100M users | Sharded metadata; Kafka pipeline; ML spam; object storage attachments |
| Large | 1B users | Bigtable mailbox; global MX anycast; regional search shards |
| Gmail-class | 1.5B+ | Custom storage (Colossus-like); per-DC pipelines; GPU spam retrain daily |
| Search pressure | long-tail queries | Query caching; popular terms CDN; cap deep pagination |
| Hot user | viral thread | Dedicated cache slice; rate limit notifications |

## 7. Recap

- **SMTP is async by nature**: OK fast, process in pipeline — durability at enqueue, not at classify  
- **Mailbox ≠ message blob**: immutable messages + per-user labels/threads; enables dedupe and threading  
- **Threading** uses headers first, heuristics second — real-world clients break pure graph approaches  
- **Search requires user-scoped ACL** on every query — shard by message, filter by user_id  
- **Spam is adversarial ML** — ensemble rules + models + user feedback loop; optimize for low false positives  

**Practice:** trace one inbound message from **TCP connect to MX** through to **inbox notification**; identify three idempotency keys that prevent duplicates under SMTP retries.
