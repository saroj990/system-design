# Case Study 13 — Search Autocomplete (Typeahead)

Design a **search autocomplete / typeahead** system like Google Search suggestions or Amazon product search — as the user types, return relevant completions in milliseconds.

## 1. Problem

On each keystroke (or every few characters), the client sends a prefix query like `"sys"` and expects top-K suggestions (`"system design"`, `"system of a down"`, …) ranked by popularity and relevance, with latency low enough that the UI feels instant.

## 2. Requirements

### Functional (MVP)

- Return top **K** suggestions (e.g., 10) for a query prefix  
- Rank by **popularity** (search frequency) and basic relevance  
- Support **personalization** optionally (user's recent searches) — phase 2  
- Handle prefixes of 1–50 characters  
- Update suggestions as new trending queries emerge (near real-time or daily)  
- Multi-language / locale-aware results  

### Out of scope (initially)

- Full web search results page  
- Spell correction across entire index ("did you mean") — can add fuzzy layer later  
- Rich snippets (images, prices) in dropdown  
- Voice input processing  

### Non-functional

- **Ultra-low latency**: p99 < 50 ms (often < 20 ms)  
- **High read QPS**: every keystroke = 1 request (with debouncing on client)  
- **High availability** — autocomplete is on critical search path  
- Eventually consistent with trending updates (minutes delay OK)  
- Cost-efficient at billions of unique queries stored  

## 3. Back-of-the-envelope estimates

Assumptions:

- 500M daily active search users  
- Average 8 keystrokes per search box interaction → 8 autocomplete calls (before debounce)  
- Client debounce 150 ms → ~3 effective calls per search  
- 500M searches/day × 3 ≈ **1.5B autocomplete requests/day**  

```text
Average QPS ≈ 1.5B / 86400 ≈ 17,000/s
Peak QPS ≈ 5× avg ≈ 85,000/s (regional peaks higher)

Unique query strings in index: ~500M (long tail)
Popular prefixes hot in cache: top 1M prefixes serve 80% traffic

Storage (trie / sorted index):
  500M queries × ~30B avg ≈ 15 GB raw terms
  + popularity scores, indexes → 50–100 GB in memory (sharded)

Update rate:
  Aggregate search logs → top queries refresh every 1–5 min
  Write QPS to index low; batch updates
```

Insight: This is a **read-heavy, latency-critical** problem. Precompute prefix → top-K offline; serve from memory/cache at request time.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  U[User / Browser] --> CDN[CDN / Edge]
  U --> LB[Load Balancer]
  LB --> AS[Autocomplete Service]
  AS --> Cache[(Local + Redis Cache)]
  AS --> Trie[(Prefix Index - in-memory shards)]
  Agg[Log Aggregator] --> Kafka[Stream - search logs]
  Kafka --> Counter[Popularity Counter]
  Counter --> Builder[Index Builder]
  Builder --> Trie
  Builder --> Obj[(Snapshot Store - S3)]
  AS --> Obj
  Admin[Data Pipeline] --> Builder
```

### Components

| Component | Role |
|-----------|------|
| Autocomplete Service | Stateless API; lookup prefix → top-K |
| Prefix Index | Trie or sorted array + binary search per shard |
| Popularity Counter | Count query frequencies from search logs (Flink/Spark) |
| Index Builder | Merges counts, builds new index snapshot periodically |
| Snapshot Store | Versioned index files for rolling reload |
| Cache | Hot prefix results (Redis + in-process LRU) |
| Log pipeline | Ingest raw searches → aggregate top queries |

### Flows

**Query path (read)**

1. User types `"sys"` → client debounces → `GET /suggest?q=sys&limit=10`  
2. Autocomplete Service normalizes query (lowercase, trim)  
3. Check local LRU cache → Redis → in-memory trie shard  
4. Return JSON list in ~5–20 ms  

**Index update path (write, async)**

1. Search logs stream to Kafka  
2. Counter job aggregates `(query, count)` windows  
3. Every N minutes, Builder merges with historical totals  
4. Builds new trie snapshot → uploads to S3  
5. Autocomplete pods reload snapshot with zero-downtime swap  

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Trie in memory | Fast prefix walk O(prefix len) | Memory heavy; rebuild complexity |
| Elasticsearch completion suggester | Less custom code | Harder to hit <10ms p99 at huge scale |
| DB `LIKE 'prefix%'` | Simple | Too slow at billions of rows |
| Client debounce 150–300 ms | Cuts QPS 3–5× | Slightly less "live" feel |
| Global vs per-locale index | Better relevance | More shards to maintain |

**Interview answer:** Precomputed **trie + top-K heap per node**, sharded by first character or hash prefix.

## 5. Low-Level Design (LLD)

### APIs

```text
GET /api/v1/suggest?q=system&limit=10&locale=en-US
→ 200 {
  "query": "system",
  "suggestions": [
    { "text": "system design interview", "score": 98234 },
    { "text": "system of a down", "score": 45100 },
    ...
  ],
  "latencyMs": 4
}

GET /api/v1/suggest/health
→ 200 { "indexVersion": "20260720-1430", "shardStatus": "OK" }
```

Optional: `POST /internal/index/reload` for controlled rollout.

### Schema (metadata & analytics — not the hot path)

```text
query_stats (
  query_text     TEXT,
  locale         VARCHAR(10),
  daily_count    BIGINT,
  total_count    BIGINT,
  last_seen      TIMESTAMPTZ,
  PRIMARY KEY (locale, query_text)
)

index_snapshots (
  version        VARCHAR(30) PRIMARY KEY,
  locale         VARCHAR(10),
  blob_path      TEXT,
  record_count   BIGINT,
  created_at     TIMESTAMPTZ,
  is_active      BOOLEAN
)

-- Personalization (phase 2)
user_recent_searches (
  user_id        UUID,
  query_text     TEXT,
  searched_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, query_text)
)
```

The **hot index** lives in memory (trie files), not queried from Postgres per request.

### Modules

```text
SuggestController / SuggestService
PrefixIndex / TrieNode / TopKHeap
IndexLoader / SnapshotManager
QueryNormalizer / LocaleRouter
PopularityAggregator / IndexBuilderJob
SuggestCache (L1 LRU + L2 Redis)
```

### Data structure — trie with top-K at each node

Each trie node stores:

- `children`: map char → node  
- `topK`: fixed-size max-heap or sorted array of `{ phrase, score }` for **full queries** passing through this prefix  

```text
class TrieNode:
  children: Map<char, TrieNode>
  topK: List<Suggestion>  # size ≤ K, sorted by score desc

function insert(phrase, score):
  node = root
  for ch in phrase:
    node = node.child(ch)
    node.topK.addOrUpdate(phrase, score)  # keep only best K
```

Query `"sys"` → walk `s → y → s` → return `node.topK`.

### Key algorithm — suggest

```text
function suggest(rawQuery, limit, locale):
  q = normalize(rawQuery, locale)   # lowercase, NFC unicode, trim
  if len(q) == 0: return trending(locale)  # optional: show trending when empty
  if len(q) > MAX_PREFIX: q = q[0:MAX_PREFIX]

  cached = cache.get(locale, q)
  if cached: return cached

  shard = shardFor(q, locale)       # e.g., first char 's' → shard 18
  node = shardIndex[shard].walk(q)
  if node is null: return []

  results = node.topK.take(limit)
  cache.set(locale, q, results, ttl=60s)
  return results
```

### Key algorithm — build index from logs

```text
function buildIndexSnapshot(locale, windowHours=24):
  counts = aggregateSearchLogs(locale, windowHours)
  # Merge with historical decay: score = 0.7*today + 0.3*yesterday
  merged = mergeWithDecay(counts, historicalStats)

  trie = new Trie()
  for (phrase, score) in merged.sortedByScore():
    if isBlocked(phrase): continue   # profanity, spam
    trie.insert(phrase, score)

  snapshot = serialize(trie)
  uploadToS3(version, locale, snapshot)
  markSnapshotReady(version)
```

### Key algorithm — zero-downtime reload

```text
function reloadIndex():
  meta = snapshotStore.latestActive(locale)
  newTrie = deserialize(download(meta.blob_path))
  atomicSwap(shardIndexes[locale], newTrie)  # pointer swap in memory
  localCache.clear()
```

Use double-buffering: readers always hold ref to current trie; writers build new trie then swap pointer atomically.

### Client-side optimizations (mention in interview)

```text
# Debounce: wait 150ms after last keystroke before API call
# AbortController: cancel in-flight request when user types next char
# Minimum prefix length 2 before calling API
# Cache recent prefixes client-side (sessionStorage)
```

### Concurrency & correctness

| Concern | Approach |
|---------|----------|
| Stale suggestions after reload | Version header in response; client can ignore stale |
| Thundering herd on deploy | Pre-warm cache; gradual pod rollout |
| Unicode normalization | NFC + locale-specific lowercasing (Turkish `I/i`) |
| Spam queries polluting index | Min count threshold; blocklist; rate limit writes to stats |
| Shard imbalance (`a*` hotter than `z*`) | Shard by hash prefix, not only first char |

**Fuzzy matching (bonus):** For typo tolerance, maintain separate n-gram index or use Levenshtein on top-1000 popular queries only — full fuzzy on billions is too slow for p99.

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single trie in memory, nightly batch rebuild, one region |
| 10k QPS | Redis cache, horizontal API replicas, debounced clients |
| 100k QPS | Sharded tries by prefix hash; edge CDN caching for top prefixes |
| Global | Per-locale indexes; geo-routed replicas |
| Personalization | Blend global top-K with user's recent searches (weighted merge) |

## 7. Recap

- Autocomplete is **precomputation + cache**, not ad-hoc DB search at request time  
- Store **top-K at each trie node** for O(prefix length) lookups  
- Cut QPS with **client debounce** and **request cancellation**  
- Update index **async** from search logs; swap snapshots without downtime  

**Practice:** Explain trie vs Elasticsearch for this use case. Write `suggest()` pseudocode including cache and shard routing.
