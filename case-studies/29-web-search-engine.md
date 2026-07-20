# Case Study 29 — Web Search Engine (Simplified)

Design a simplified **Google-like web search**: crawl the web, build an index, and return ranked results for a query in milliseconds.

## 1. Problem

Given a search query like `"distributed systems cap theorem"`, return the most relevant web pages from billions of documents — **fast** ( < 300 ms) and **fresh** (recent pages indexed within days).

This case study covers a **minimal but realistic** pipeline: crawler → indexer → inverted index → ranking → query service.

## 2. Requirements

### Functional (MVP)

- Crawl known seed URLs; discover new links  
- Parse HTML; extract text, title, links  
- Build inverted index: `term → list of docIds`  
- Query: return top 10 URLs with titles and snippets  
- Basic ranking: term frequency + PageRank-style authority  
- Avoid duplicate content (URL normalization, simhash)  

### Out of scope (initially)

- Image/video/news verticals  
- Personalized ranking (search history)  
- Full natural-language understanding (BERT reranking)  
- Ads auction  
- Real-time index (minutes-level freshness for all web)  

### Non-functional

- Index billions of documents (web scale simplified to 100M–1B docs)  
- Query latency p99 < 300 ms  
- Crawl politeness (rate limits per domain)  
- Fault tolerance — crawler and indexer are distributed  
- Storage efficiency — compression, sharding  

## 3. Back-of-the-envelope

Assumptions (simplified Google-scale down):

- 500M indexed pages  
- Average page: 20 KB HTML, 5 KB extracted text  
- Vocabulary: 10M unique terms after stemming  
- 5B searches/day  

```text
Raw text storage ≈ 500M × 5KB ≈ 2.5 TB (compressed ~750 GB)

Inverted index (rough):
  10M terms × avg 50 KB postings each ≈ 500 GB (highly compressible with delta encoding)

Query QPS ≈ 5B / 86400 ≈ 58,000/s avg, peak ~200,000/s

Crawl rate:
  To refresh 500M pages every 30 days → 500M / 30 / 86400 ≈ 190 pages/s minimum
  Discovery + deep web → target ~1,000–10,000 pages/s cluster-wide
```

Insight: **query path must hit in-memory index shards** — disk is for crawl store and backups, not hot search.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  subgraph offline [Offline Pipeline]
    F[URL Frontier] --> CR[Crawlers]
    CR --> RS[Raw Store]
    RS --> PA[Parser / Extractor]
    PA --> IX[Index Builder]
    IX --> IS[(Index Shards)]
    PA --> LK[Link Graph]
    LK --> PR[PageRank Job]
    PR --> IS
  end

  subgraph online [Online Query]
    U[User] --> QAPI[Query Service]
    QAPI --> QP[Query Parser]
    QAPI --> IDX[Index Servers]
    QAPI --> DOC[Doc Server / Snippets]
    IDX --> QAPI
    DOC --> QAPI
    QAPI --> U
  end

  CR --> F
```

```mermaid
flowchart LR
  Q["query: cap theorem"] --> T[Tokenize + stem]
  T --> P[Postings lookup]
  P --> I[Intersect doc lists]
  I --> R[Rank top N]
  R --> S[Fetch snippets]
  S --> OUT[Top 10 results]
```

### Components

| Component | Role |
|-----------|------|
| URL Frontier | Priority queue of URLs to crawl (BFS-ish with politeness) |
| Crawlers | Fetch HTTP pages; respect robots.txt |
| Raw Store | Blob storage for HTML (S3/HDFS) |
| Parser | Extract text, title, outbound links, metadata |
| Index Builder | Builds inverted index + forward index |
| Index Shards | Partitioned by term range or document ID |
| PageRank Job | Offline compute authority scores |
| Query Service | Parse query, merge shard results, return ranked list |
| Doc Server | Map docId → URL, title, snippet text |

### Flows

**Crawl loop**

1. Frontier dequeues URL for domain D (respect per-domain rate limit)  
2. Crawler fetches page → store raw HTML  
3. Parser extracts text + links  
4. New links enqueued to frontier (dedupe by normalized URL)  
5. Index builder consumes parsed doc → update inverted index  

**Query**

1. Tokenize query → stem → remove stop words  
2. Lookup postings for each term on index shards  
3. Intersect / merge posting lists (AND for multi-term)  
4. Score candidates (TF-IDF + PageRank)  
5. Fetch top N doc metadata for snippets  
6. Return JSON results  

### Trade-offs

- **Freshness vs crawl cost** — prioritize popular/changing pages  
- **Index sharding by term vs doc** — term shard: single-term lookup easy; multi-term needs merge. Doc shard: update easy; query hits all shards  
- **Exact PageRank vs approximation** — offline batch OK for MVP  
- **Snippets precomputed vs at query time** — precompute first 160 chars per doc  

## 5. Low-Level Design (LLD)

### APIs

```text
GET /api/v1/search?q=cap+theorem+distributed&limit=10
→ {
     "query": "cap theorem distributed",
     "tookMs": 42,
     "results": [
       {
         "url": "https://example.com/cap",
         "title": "CAP Theorem Explained",
         "snippet": "...Consistency, Availability, Partition tolerance...",
         "score": 0.92
       }
     ],
     "totalEstimate": 1250000
   }

POST /internal/v1/crawl/enqueue
Body: { "urls": ["https://example.com/"] }
→ 202 Accepted

GET /internal/v1/doc/:docId
→ { "docId": "d_991", "url": "...", "title": "...", "text": "..." }
```

### Schema

```text
documents (
  doc_id       BIGINT PRIMARY KEY,
  url          TEXT NOT NULL UNIQUE,
  url_hash     BIGINT NOT NULL,
  title        TEXT,
  text_blob_id TEXT,              -- pointer to object storage
  pagerank     FLOAT DEFAULT 0,
  indexed_at   TIMESTAMPTZ NOT NULL,
  content_hash VARCHAR(64)        -- simhash for dedup
)

-- Forward index (metadata by doc)
-- Inverted index is mostly custom binary on index servers, not row-per-posting in SQL

url_frontier (
  url          TEXT PRIMARY KEY,
  domain       VARCHAR(256) NOT NULL,
  priority     INT DEFAULT 0,
  last_crawled TIMESTAMPTZ NULL,
  crawl_delay_ms INT DEFAULT 1000
)

links (
  from_doc_id  BIGINT,
  to_doc_id    BIGINT,
  anchor_text  TEXT,
  PRIMARY KEY (from_doc_id, to_doc_id)
)
```

Inverted index file format (per shard):

```text
term → [docFreq, [docId, tf, positions...], [docId, tf, positions...], ...]
       postings sorted by docId with delta + varint compression
```

### Modules

```text
SearchController
QueryParser               (tokenize, stem, stop words)
IndexShardClient            (fan-out to shards)
PostingsMerger              (intersect / union)
RankingService              (BM25 + PageRank blend)
SnippetGenerator
CrawlScheduler
RobotsTxtCache
DocumentRepository
```

### Algorithm — build inverted index

```text
function indexDocument(docId, terms[], positions[]):
  for each term in terms:
    shard = shardForTerm(term)           // e.g., hash(term) mod numShards
    shard.appendPosting(term, docId, tf, positions)

function shardForTerm(term):
  return hash(term) % NUM_TERM_SHARDS
```

### Algorithm — query execution (multi-term AND)

```text
function search(query):
  terms = stem(tokenize(query)) - stopWords
  if terms.isEmpty(): return []

  lists = []
  for term in terms:
    lists.append(indexShard.lookup(term))   // parallel fan-out

  candidates = intersectSortedPostings(lists)   // merge join on docId

  scored = []
  for doc in candidates:
    score = bm25(doc, terms) + alpha * doc.pagerank
    scored.append((doc.id, score))

  top = partialSort(scored, k=100)
  return fetchSnippets(top, k=10)

function intersectSortedPostings(lists):
  // Simultaneous scan — doc must appear in ALL lists
  pointers = [0] * len(lists)
  results = []
  while all pointers valid:
    maxDoc = max(lists[i][pointers[i]].docId for i)
    if all lists[i][pointers[i]].docId == maxDoc:
      results.append(combine(lists, pointers))
      advance all pointers
    else:
      advance pointers where docId < maxDoc
  return results
```

### Algorithm — BM25 scoring (simplified)

```text
function bm25(doc, queryTerms):
  score = 0
  for term in queryTerms:
    tf = termFrequency(doc, term)
    df = documentFrequency(term)
    idf = log((N - df + 0.5) / (df + 0.5))
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc.length / avgDocLength))
  return score
```

### Algorithm — crawler politeness

```text
function crawlNext():
  url = frontier.dequeueHighestPriority()
  domain = extractDomain(url)
  if not robotsAllowed(domain, url): return skip
  if timeSinceLastFetch(domain) < crawlDelay(domain): requeue(url); return
  html = httpGet(url)
  storeRaw(url, html)
  enqueueOutlinks(parseLinks(html))
  markCrawled(url, now())
```

### Concurrency & correctness

- URL normalization before dedup (`http/https`, trailing slash, lowercase host)  
- Simhash near-duplicate detection avoids indexing same content twice  
- Index updates are **segment-based** — new segments built offline, swapped atomically  
- Crawl idempotency by URL hash in frontier  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single-machine index; crawl 1M pages; BM25 only |
| Sharding | Term-based index shards; query fan-out + merge |
| Freshness | Tiered crawl priorities; delta index for recent docs |
| Ranking | Offline PageRank; optional ML reranker on top 100 |
| Global | Geo-distributed index replicas; CDN for static assets only |
| Scale query | Result caching for head queries; autocomplete separate index |

## 7. Recap

- Search = **offline indexing** + **online postings lookup**  
- **Inverted index** maps term → documents; compressed postings lists are core  
- Multi-term queries = **intersect sorted postings** across shards  
- **Crawler politeness** and URL frontier prevent overload and bans  
- Ranking blends **relevance (BM25)** and **authority (PageRank)**  

**Practice:** draw the offline/online split diagram from memory, then write pseudocode for `intersectSortedPostings` without looking.
