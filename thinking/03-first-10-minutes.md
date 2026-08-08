# 03. First 10 Minutes (Narrated)

> **Goal:** Hear how a strong candidate *talks* before the polished diagram exists.

Each walkthrough is a **script**, not the final architecture. Pause after each block and try saying it in your own words. Then open the linked case study and compare.

Timer suggestion: **10 minutes talking**, then 5 minutes reading the case study.

---

## How to practice these scripts

1. Cover the “Compare later” link.  
2. Read only the **Prompt**.  
3. Speak for ~10 minutes (or write bullets).  
4. Uncover the narration and score yourself with the checklist at the bottom.  
5. Only then open the full case study.

---

## Shared skeleton (use every time)

```text
0:00  Clarify scope + assumptions
2:00  Core verb + hot path
3:00  Rough estimates (shape, not precision)
5:00  APIs (2–4 endpoints)
6:00  Layer A diagram (Client → LB → API → DB)
7:00  Add 1–2 components for the bottleneck
8:30  Walk one write + one read
9:30  Failures + trade-offs + 10× next step
```

---

## Walkthrough A — URL Shortener

### Prompt

Design a URL shortener (bit.ly style): create short links, redirect, basic click stats.

### Narration (example)

**Clarify**  
“I’ll assume custom aliases are out of scope for v1, links don’t expire by default, and we need redirect latency well under 100ms. Analytics can be slightly delayed. Sound OK?”

**Core verb + hot path**  
“Core verb is **redirect**. Hot path is `GET` short code → 302 to long URL. Creating links and viewing stats are secondary.”

**Estimates (shape)**  
“Suppose 100M new links/month and read:write about 100:1. That means create QPS is tens per second average, but redirects are thousands to tens of thousands at peak. So I optimize reads first. Storage is hundreds of GB/year — one DB is fine initially.”

**APIs**  
“`POST /urls` → `{ shortCode, longUrl }`, `GET /r/:code` → redirect, `GET /urls/:code/stats` for counts.”

**Layer A**  
“Start simple: Client → LB → URL Service → Postgres storing `code → long_url`.”

**Bottleneck fix**  
“Redirects will crush the DB. Add Redis cache for `code → url` on the hot path. On create, write DB then cache. On redirect, cache-aside. Click counting goes to a queue so redirects don’t wait on analytics writes.”

**Walk flows**  
“Write: validate URL → generate code → insert → optionally warm cache → return. Read: cache hit → 302; miss → DB → fill cache → 302; enqueue click event.”

**Failures / trade-offs**  
“If Redis is down, fall back to DB with higher latency — or fail open carefully. Cache stampede on hot codes: use singleflight or short TTL plus warm on create. At 10× I’d shard by hash of code and push more traffic to edge/CDN for popular redirects if needed.”

### Compare later

[Case Study 01 — URL Shortener](../case-studies/01-url-shortener.md)

---

## Walkthrough B — Chat / Messaging

### Prompt

Design 1:1 messaging: send messages, online delivery, message history.

### Narration (example)

**Clarify**  
“I’ll focus on 1:1 first, not group chat or voice. We need low-latency delivery when both online, and durable history. Exactly-once across devices is hard — I’ll aim for at-least-once with idempotent message IDs.”

**Core verb + hot path**  
“Core verb is **deliver message A→B**. Hot path is online push path. History read is important but can tolerate slightly more latency.”

**Estimates**  
“If 50M DAU and ~50 messages/user/day, that’s billions of messages/day — thousands to hundreds of thousands of writes/sec peak depending on assumptions. Connections: millions of concurrent sockets if many stay online — that’s a gateway problem, not a single server.”

**APIs / protocol**  
“REST or RPC for history and auth; **WebSocket** (or similar) for live send/receive. Message payload: `messageId`, `from`, `to`, `ts`, `body`.”

**Layer A**  
“Clients → LB → Chat/API service → Messages DB. Too naïve for online delivery.”

**Bottleneck fix**  
“Add a **connection gateway** tier (shard users by userId consistent hash) + **Redis** for presence/routing (‘user B connected on gateway 7’). Persist message first (or dual-write carefully), then push to B’s gateway. Offline: store and notify via push channel.”

**Walk flows**  
“Send: auth → persist message → lookup B’s connection → push if online → ACK to A. History: query messages table by conversation id, paginated.”

**Failures / trade-offs**  
“Gateway dies: clients reconnect, consistent hash moves them. DB is source of truth so messages aren’t lost. Ordering: per-conversation sequence numbers. Group chat later needs fan-out — I won’t overdesign that now. Trade-off: sticky sessions vs external presence store — I prefer presence in Redis so gateways stay replaceable.”

### Compare later

[Case Study 07 — Chat / Messaging](../case-studies/07-chat-messaging.md)

---

## Walkthrough C — News Feed

### Prompt

Design a Twitter/Instagram-like home feed: follow users, post, see posts from people you follow.

### Narration (example)

**Clarify**  
“Home feed of followed users, ranked roughly reverse-chronological for v1. Ranking ML can be phase 2. Media via object storage.”

**Core verb + hot path**  
“Core verb is **assemble feed for viewer**. Hot path is feed read. Posts are writes that may fan out.”

**Estimates**  
“Read-heavy. If many users open the feed often, feed QPS dominates. Naïve fan-out-on-write to all followers can explode when someone has millions of followers.”

**APIs**  
“`POST /posts`, `GET /feed`, `POST /follow`.”

**Layer A**  
“API → Posts DB + Follow graph. Feed = query posts from followees at read time.”

**Bottleneck fix**  
“For average users, **fan-out on write** into a cached timeline (Redis lists). For celebrities, **fan-out on read** (pull their posts when viewer loads feed). Hybrid avoids write amplification.”

**Walk flows**  
“Post by normal user: write post → enqueue fan-out → workers push post id into followers’ timeline caches. Feed read: read timeline ids → hydrate post content from cache/DB.”

**Failures / trade-offs**  
“Fan-out lag means slightly stale feeds — usually OK. Celebrity posts: merge at read time. At 10×, shard timeline cache and posts DB by userId. Trade-off: precompute = fast reads + expensive writes; pull = cheap writes + heavier reads.”

### Compare later

[Case Study 06 — News Feed](../case-studies/06-news-feed.md)

---

## Walkthrough D — Ticket Booking

### Prompt

Design ticket booking for events: browse, select seats, pay, confirm.

### Narration (example)

**Clarify**  
“Hot on-sale events matter. Overbooking is unacceptable. Payment via external provider. Hold seats briefly during checkout.”

**Core verb + hot path**  
“Core verb is **reserve scarce inventory**, then **confirm after pay**. Hot path is hold/confirm under contention — not the marketing page.”

**Estimates**  
“Browse can be cached. During on-sale, hold attempts spike. Confirmed bookings are lower QPS than failed clicks. Optimize for contention on popular seats.”

**APIs**  
“`GET /events/:id/seats`, `POST /holds`, `POST /checkout` (payment + confirm), `GET /orders/:id`.”

**Layer A**  
“API → Inventory DB with row-level locks on seats. Risky under stampede.”

**Bottleneck fix**  
“Use a **short TTL hold** in Redis (or locked state in DB) with seat ids; only on successful payment flip to booked in the system of record. Idempotency keys on payment callbacks. Queue ticket email/PDF generation.”

**Walk flows**  
“Hold: check available → set hold with expiry → return holdId. Checkout: verify hold → charge payment idempotently → commit booking → release/convert hold → async ticket delivery.”

**Failures / trade-offs**  
“Two users race one seat: only one hold wins. Payment succeeds but confirm crashes: reconciliation job using payment intent id. Don’t put payment provider latency inside a long DB transaction. Trade-off: Redis holds are fast but must agree with DB truth on confirm.”

### Compare later

[Case Study 11 — Ticket Booking](../case-studies/11-ticket-booking.md)

---

## Walkthrough E — Video Streaming

### Prompt

Design a YouTube-like service: upload video, process, watch with adaptive quality.

### Narration (example)

**Clarify**  
“Upload, process into multiple bitrates, playback via adaptive streaming. Comments/social can wait. Global viewers implied → CDN matters.”

**Core verb + hot path**  
“Two verbs: **ingest/process** (creator) and **serve segments** (viewer). Viewer hot path is CDN fetch, not the origin API.”

**Estimates**  
“Uploads are fewer but huge bandwidth. Watch traffic is enormous egress — CDN is mandatory. Transcoding is CPU-heavy → workers, not request path.”

**APIs**  
“`POST /videos` (metadata + upload URL), upload to object storage, `GET /videos/:id` (manifest URL), playback hits CDN.”

**Layer A**  
“API → metadata DB; files on object storage. Missing: processing + edge delivery.”

**Bottleneck fix**  
“Presigned upload to S3 → queue transcode jobs → workers emit HLS/DASH renditions → store segments → CDN in front. Metadata tracks processing state.”

**Walk flows**  
“Upload complete → message on queue → worker produces 360p/720p/1080p → update status ready → client fetches manifest → player pulls segments from CDN.”

**Failures / trade-offs**  
“Transcode failures retry; poison messages quarantined. Hot video: CDN hit ratio saves origin. Cost trade-off: more renditions = better UX + more storage. At 10×, scale worker fleets and partition queues by priority (premium creators first optional).”

### Compare later

[Case Study 09 — Video Streaming](../case-studies/09-video-streaming.md)

---

## Self-score checklist (after each walkthrough)

Give yourself 1 point each:

| # | Did you…? |
|---|-----------|
| 1 | Ask / state scope assumptions |
| 2 | Name a core verb |
| 3 | Separate hot path vs async |
| 4 | Give order-of-magnitude traffic shape |
| 5 | Start with a simple core diagram |
| 6 | Add components *because of* a bottleneck |
| 7 | Walk one read and one write |
| 8 | Mention a failure mode + a trade-off |

**6–8:** interview-ready structure.  
**3–5:** good instincts — tighten estimates + failures.  
**0–2:** redo with the [Thinking Loop](01-the-thinking-loop.md) beside you.

---

## Common ways these narrations go wrong

| Mistake | Fix |
|---------|-----|
| Jumping to Kafka in minute one | Name the verb and hot path first |
| Perfect schema before QPS shape | Estimates before LLD |
| 15 microservices for a shortener | Layer A monolith/service + DB first |
| No failure talk | Always: cache down, race, retry |
| Copying a blog diagram silently | Explain *why* each box earned its place |

---

## Check your understanding

1. Why clarify analytics as “delayed OK” in the URL shortener narration?  
2. In booking, why is hold TTL important?  
3. Why does video put CDN on the viewer hot path instead of the API server?

<details>
<summary>Answers</summary>

1. So you don’t put counter writes on the redirect hot path — keeps latency low and design honest.  
2. Abandoned checkouts must release seats; otherwise inventory leaks and looks sold out.  
3. Watch traffic is bulk byte delivery; API servers can’t economically stream every viewer — edge caches can.

</details>

---

**Next:** [Practice without spoilers](04-practice-without-spoilers.md) — how to use the 41 case studies as drills.
