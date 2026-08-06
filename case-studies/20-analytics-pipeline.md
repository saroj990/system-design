# Case Study 20 — Analytics / Metrics Event Pipeline

Design a pipeline that collects **billions of product analytics events** (page views, clicks, purchases), processes them reliably, and serves dashboards and ad-hoc queries.

## 1. Problem

Product teams need answers like "how many signups per country yesterday?" and "funnel from landing → signup → purchase." Events fire constantly from web and mobile apps. You must ingest high-volume fire-and-forget traffic, never lose critical data, and query aggregates efficiently.

## 2. Requirements

### Functional (MVP)

- Client SDK sends events: `{ eventName, userId, timestamp, properties }`  
- Ingestion API accepts batch events (JSON)  
- Stream processing: dedupe, validate schema, enrich (geo from IP)  
- Store raw events for replay (short retention)  
- Aggregate metrics: counts per event per hour, DAU, simple funnels  
- Query API or SQL interface for dashboards (last 7 days)  

### Out of scope (initially)

- Sub-second real-time alerting (near-real-time OK)  
- ML feature store, session replay, heatmaps  
- Petabyte-scale multi-year retention on hot tier  
- Exactly-once billing-grade accounting (at-least-once + idempotent agg is MVP)  

### Non-functional

- Ingestion: 100k+ events/sec peak, p99 ack < 100 ms  
- Durability: survive broker/node failure (replicated log)  
- Processing lag: minutes acceptable for dashboards  
- Query: interactive for pre-aggregated rollups (< 5 s)  
- Cost-aware tiering: hot vs cold storage  

## 3. Back-of-the-envelope estimates

These numbers are **rough order-of-magnitude math** — not a capacity plan. In interviews, the goal is to show you know *what to count* and *which resource breaks first*. A useful shortcut: **1 QPS sustained ≈ 86,400 events/day**. Analytics pipelines ingest **fire-and-forget** traffic — peak **2–5×** average during product launches or viral moments.

### Why we estimate

Event pipelines decouple **fast ingestion** from **slow analytics**. Estimates tell us:

- Why you cannot write **1B events/day** directly to a dashboard database  
- Kafka (or similar) **absorbs spikes** while processors lag safely  
- **Raw storage** (TB/day) vs **rollup storage** (MB/day) drives tiering strategy  
- **At-least-once** + `eventId` dedup beats chasing exactly-once everywhere  

### Assumptions

| Assumption | Value | Why it matters |
|------------|-------|----------------|
| Daily active users (DAU) | 50M | Event volume base |
| Events per user per day | 20 | Page views, clicks, purchases |
| Average event JSON size | 500 B | Kafka + lake sizing |
| Peak multiplier | 3× average | Launch / viral traffic |
| Compression ratio (Parquet) | ~5× | Cold storage |
| Rollup granularity | Hourly | Dashboard query speed |
| Raw retention (hot) | 7–90 days | Replay vs cost |

### Step A — Traffic (QPS) with labeled arithmetic

**Daily event volume:**

```text
DAU                   = 50,000,000
Events per user/day   = 20

Daily events          = 50M × 20 = 1,000,000,000 events/day (1 billion)
```

**Average ingestion QPS:**

```text
Average ingest QPS    = 1,000,000,000 ÷ 86,400
                      ≈ 11,574 events/second
                      ≈ 11,600/s (round)
```

**Peak ingestion QPS (3× average):**

```text
Peak ingest QPS       = 11,600 × 3 ≈ 34,800/s
                      ≈ 35,000/s (round)
```

**Ingestion API batches (if clients send 10 events per POST):**

```text
Peak HTTP requests    = 35,000 ÷ 10 ≈ 3,500 POST/s to ingestion API
(still must ack in < 100 ms p99 — produce to Kafka, don't process inline)
```

**Stream processor throughput:**

Must sustain **≥ peak ingest** on consumer side; lag of minutes is OK for dashboards but not hours.

### Step B — Storage

**Raw events per day (uncompressed):**

```text
Events/day          = 1 billion
Event size          = 500 B

Daily raw volume    = 1B × 500 B = 500 GB/day
Monthly raw         = 500 GB × 30 ≈ 15 TB/month (uncompressed)
```

**After Parquet compression (~5×):**

```text
Monthly in object lake ≈ 15 TB ÷ 5 ≈ 3 TB/month in S3
Annual (if kept)       ≈ 36 TB compressed (tier older partitions to Glacier)
```

**Pre-aggregated rollups (OLAP):**

```text
Assume 1M unique (metric, dimension, hour) rows/day
Row size            ≈ 200 B

Rollup storage/day  = 1M × 200 B = 200 MB/day
Yearly rollups      ≈ 73 GB — fits easily in ClickHouse/BigQuery hot tier
```

**Kafka retention (7 days buffer):**

```text
7 × 500 GB = 3.5 TB in Kafka (plan partition count + retention accordingly)
```

### Step C — Bandwidth

**Ingestion ingress at peak:**

```text
Peak events         = 35,000/s
Event size          = 500 B

Ingress bandwidth   = 35,000 × 500 B = 17.5 MB/s
                    (modest — network rarely the bottleneck; disk write speed to lake matters)
```

**Kafka → S3 lake write (batch flush):**

```text
Processors batch events into ~128 MB Parquet files
Write throughput must keep up with 500 GB/day ≈ 5.8 MB/s average sustained
```

**Dashboard query egress:**

```text
Pre-aggregated queries return KB–MB JSON — negligible vs ingest
```

### Step D — Read:write ratio table

| Operation | Type | Rate | Notes |
|-----------|------|------|-------|
| Client → Ingestion API | Write | ~11.6k/s avg; ~35k/s peak | Fast 202 ack |
| Kafka produce | Write | ~35k/s peak | Durable log |
| Stream processor consume | Read | ~35k/s peak | Enrich + fork |
| Parquet write to S3 | Write | ~5.8 MB/s avg | Batch sink |
| OLAP rollup insert | Write | ~1M rows/day | Hourly windows |
| Dashboard query | Read | Low QPS | Scans rollups, not raw |
| Backfill replay | Read | Batch | Re-reads S3 Parquet |

**Ratio on hot path:** **write-heavy** (ingest >> query). Analytics **reads** hit pre-aggregated tables, not 1B raw rows.

### What the numbers tell us

- **Ingestion API is stateless** — validate, assign `eventId`, produce to Kafka, return 202 in < 100 ms  
- **Kafka decouples** 35k/s spikes from slow Flink/Spark processors  
- **500 GB/day raw** → S3 data lake (Parquet), not OLTP database  
- **Dashboards query rollups** (200 MB/day growth) — never full-scan 1B daily rows  
- **At-least-once delivery** + **`eventId` dedup** in processor handles retries without double-counting  
- **Partition by `hash(userId)`** for user-scoped ordering; salt hot keys to avoid celebrity skew  
- **7-day Kafka + 90-day hot lake + Glacier** = sensible cost tiering  
- Processing lag of **minutes** is acceptable for MVP dashboards  

### Common mistake for this problem

Writing events **directly into Postgres** or serving dashboards with **`SELECT COUNT(*) FROM events`** on the raw table. At 1B rows/day, that collapses in days. Correct pattern: **ingest → queue → process → lake + OLAP rollups**. Another mistake: insisting on **exactly-once end-to-end** — **at-least-once + idempotent `eventId`** is simpler and sufficient for product analytics.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  Apps[Web / Mobile Apps] --> Ingest[Ingestion API]
  Ingest --> Stream[(Kafka / Pulsar)]
  Stream --> Proc[Stream Processors]
  Stream --> Raw[Raw Event Lake — S3]
  Proc --> OLAP[(ClickHouse / BigQuery)]
  Proc --> RT[(Redis — real-time counters)]
  OLAP --> Dash[Dashboard / Query API]
  RT --> Dash
  Meta[Schema Registry] --> Ingest
  Meta --> Proc
```

End-to-end path in words:

```text
Ingestion → Queue/Stream → Processing → Warehouse/OLAP (+ optional real-time layer)
```

### Components

| Component | Role |
|-----------|------|
| Ingestion API | Stateless, validates, assigns `eventId`, produces to Kafka |
| Kafka (or Pulsar) | Durable, partitioned log; buffers spikes |
| Schema Registry | Avro/JSON schema versions; reject bad events |
| Stream processors | Flink / Spark Streaming / Kafka Streams — enrich, aggregate |
| Raw event lake | S3 + Parquet partitioned by `date/hour` |
| OLAP warehouse | ClickHouse, BigQuery, or Redshift for analytics SQL |
| Real-time counters | Redis / Druid for last-hour metrics (optional) |
| Query API | Serves dashboard tiles from OLAP + Redis |
| Orchestrator | Airflow / Dagster for batch backfill jobs |

### Flows

**Event ingestion**

1. Client batches 10 events, `POST /v1/events` with API key  
2. Ingestion validates schema, adds `receivedAt`, `eventId` (UUID)  
3. Partition key = `hash(userId)` for user-scoped ordering  
4. Produce to topic `events.raw`, return 202 Accepted quickly  

**Stream processing**

1. Consumer reads `events.raw`  
2. Filter bots, drop invalid fields  
3. Enrich: IP → country, `userId` → account tier from cache  
4. Fork: (a) write Parquet to S3, (b) increment hourly rollups in OLAP  

**Dashboard query**

1. UI requests "signups by country, last 7 days"  
2. Query API hits pre-aggregated table `metrics.signups_hourly` in OLAP  
3. Return JSON series — no full scan of 1B raw rows  

**Backfill / replay**

1. New metric defined → batch job scans S3 Parquet for last 90 days  
2. Populate new rollup table without re-instrumenting clients  

### Trade-offs

| Choice | Pros | Cons |
|--------|------|------|
| Kafka vs direct to DB | Absorbs spikes, replay | Ops complexity |
| At-least-once vs exactly-once | Simpler, faster | Duplicate events — need idempotent agg |
| Lambda (stream) + batch | Real-time + cheap historical | Two code paths unless unified (Flink) |
| ClickHouse vs BigQuery | Fast, self-host option | Managed BQ less ops |
| Pre-aggregate vs scan raw | Fast dashboards | Must know metrics upfront |
| 7-day hot + cold archive | Cost | Old ad-hoc queries slower |

## 5. Low-Level Design (LLD)

### APIs

```text
POST /v1/events
Headers: X-Api-Key, Content-Type: application/json
Body: {
  "events": [
    {
      "eventName": "page_view",
      "userId": "u_123",
      "timestamp": "2026-07-20T10:00:00Z",
      "properties": { "path": "/pricing", "referrer": "google" }
    }
  ]
}
→ 202 { "accepted": 10, "batchId": "b_991" }

GET /v1/metrics/signups?from=2026-07-13&to=2026-07-20&groupBy=country
→ { "series": [{ "country": "IN", "count": 12000 }, ...] }

GET /v1/metrics/funnel?steps=landing,signup,purchase&from=...&to=...
→ { "steps": [{ "name": "landing", "users": 100000 }, ...] }
```

### Event schema (registered)

```text
Event {
  eventId: string (UUID, server-generated if missing)
  eventName: string (enum or pattern)
  userId: string | null
  anonymousId: string | null
  timestamp: ISO8601 (client clock; server adds receivedAt)
  properties: map<string, string | number | boolean>
  context: {
    ip: string (hashed after geo lookup)
    userAgent: string
    appVersion: string
  }
  receivedAt: ISO8601 (server)
  schemaVersion: int
}
```

### Kafka topics

```text
events.raw          — partitions: 64, key: userId, retention: 7 days
events.enriched     — optional intermediate
metrics.rollup      — compacted or changelog for materialized agg
```

### OLAP tables (ClickHouse-style)

```text
-- Raw (optional in OLAP for recent window)
events_raw (
  event_date Date,
  event_time DateTime,
  event_name LowCardinality(String),
  user_id String,
  country FixedString(2),
  properties JSON
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_name, event_date, user_id)

-- Pre-aggregated hourly
signups_hourly (
  hour DateTime,
  country FixedString(2),
  signup_count AggregateFunction(count)
)
ENGINE = AggregatingMergeTree()
ORDER BY (hour, country)
```

### S3 lake layout

```text
s3://analytics-lake/events/
  year=2026/month=07/day=20/hour=10/
    part-0000.parquet
    part-0001.parquet
```

### Modules

```text
IngestionController / EventValidator / KafkaProducer
SchemaRegistryClient
EnrichmentProcessor (GeoIP, user cache)
AggregationJob (hourly rollups)
LakeWriter (Parquet batch sink)
MetricsQueryService / FunnelCalculator
BackfillOrchestrator
```

### Algorithm — ingestion (fast ack)

```text
function ingestBatch(apiKey, events):
  tenant = auth(apiKey)
  accepted = []
  for e in events:
    if not schemaValid(e): continue
    e.eventId = e.eventId or uuid()
    e.receivedAt = now()
    e.schemaVersion = CURRENT_SCHEMA
    kafka.produce(
      topic = "events.raw",
      key = e.userId or e.anonymousId,
      value = serialize(e)
    )
    accepted.append(e.eventId)
  return 202, { accepted: len(accepted) }
```

### Algorithm — hourly rollup (stream processor)

```text
function processEvent(e):
  country = geoIp.lookup(e.context.ip)
  e2 = enrich(e, country)

  lakeBuffer.add(e2)
  if e2.eventName == "signup":
    key = (hourBucket(e2.timestamp), country)
    state.increment(key, uniqueUser=e2.userId)   // HyperLogLog or set per hour shard

function onWindowClose(hour):
  for key, count in state.flush(hour):
    olap.insert("signups_hourly", key, count)
  lakeBuffer.flushToS3(hour)   // Parquet files
```

### Algorithm — funnel (batch or OLAP query)

```text
-- Simplified SQL idea: distinct users per step in order
WITH step1 AS (
  SELECT DISTINCT user_id FROM events_raw
  WHERE event_name = 'landing' AND event_date BETWEEN ...
),
step2 AS (
  SELECT DISTINCT e.user_id FROM events_raw e
  INNER JOIN step1 s ON e.user_id = s.user_id
  WHERE e.event_name = 'signup' AND e.timestamp >= ...
)
SELECT count(*) FROM step2;
```

### Algorithm — dedupe (at-least-once)

```text
function aggregateWithDedup(event):
  if dedupStore.seen(event.eventId): return   // Redis SET with 48h TTL
  dedupStore.mark(event.eventId)
  applyAggregation(event)
```

### Concurrency notes

- Ingestion servers are **stateless** — scale horizontally  
- Kafka partition count bounds parallel consumers per topic  
- **Idempotent producers** + `eventId` dedup prevents double-count from retries  
- Client clocks skew: trust `receivedAt` for ordering; store client `timestamp` separately  
- Hot partition risk: celebrity user / load test — salt key or use round-robin for anonymous traffic  

## 6. Scale evolution

| Stage | Volume | Changes |
|-------|--------|---------|
| MVP | 1k events/s | POST → single Kafka → Flink → Postgres daily rollup |
| Growth | 10k events/s | More partitions, ClickHouse, S3 lake, schema registry |
| Peak | 100k+ events/s | Dedicated ingest cluster, async produce acks, rate limit per API key |
| Query | Slow ad-hoc | Pre-aggregate top 50 metrics; raw lake for analyst SQL (Trino/Athena) |
| Retention | Years of data | Tier S3 → Glacier; rollup tables kept hot |
| Multi-tenant | SaaS analytics | Namespace topics/tables by `tenantId`; fair scheduling on shared Flink |

## 7. Recap

- Pipeline shape: **ingestion → queue/stream → processing → warehouse/OLAP**  
- Kafka (or similar) **decouples** producers from processors and enables replay  
- Use **at-least-once + idempotent `eventId`** rather than chasing exactly-once everywhere  
- **Pre-aggregate** for dashboards; **data lake** for exploration and backfill  
- Separate **real-time counters** (optional) from **authoritative batch rollups**  

**Practice:** draw the pipeline from memory, then explain what breaks if the stream processor restarts mid-batch and how `eventId` dedup helps.
