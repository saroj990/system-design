# 03. Back-of-the-Envelope Estimates

## Learning goals

By the end of this lesson you will be able to:

- Roughly estimate **QPS**, **storage**, and **bandwidth**  
- Use simple powers of 10 without a calculator panic  
- Spot which part of a system will hurt first (reads, writes, or disk)  
- Use numbers to justify cache, CDN, queues, or sharding  

---

## Why this lesson exists (in plain English)

Imagine someone says: *“Design Instagram.”*

Without numbers, you might draw 20 fancy boxes. With numbers, you might discover:

- Writes are few → one database is fine  
- Reads are huge → you need **cache**  
- Photos are huge → you need **S3 + CDN**, not Postgres BLOBs  

**Back-of-the-envelope estimates** = rough math on a napkin (or whiteboard) to find the real bottlenecks.

Interview tip: interviewers care more about **clear assumptions + order of magnitude** than exact answers. Saying “about 3,000 QPS” is better than silence.

---

## A simple way to think about it

Ask only three questions:

| Question | What you calculate | Why it matters |
|----------|--------------------|----------------|
| How busy is the API? | **QPS** (requests/sec) | Do we need more servers / cache? |
| How much data do we keep? | **Storage** (GB/TB) | Disk size, DB choice, backups |
| How much data moves on the wire? | **Bandwidth** (MB/s) | CDN, NICs, cost |

Everything else is a variation of these three.

---

## Cheat sheet — numbers to memorize

You do **not** need precision. Round freely.

### Time

| Thing | Approximate value | Easy memory trick |
|-------|-------------------|-------------------|
| Seconds in a day | **86,400 ≈ 10⁵** | “about 100,000” |
| Seconds in a month | **≈ 2.5 million** | 30 × 86,400 |
| Seconds in a year | **≈ 31 million ≈ 3×10⁷** | — |

### Size

| Unit | Approx bytes | Everyday feel |
|------|--------------|---------------|
| 1 KB | 10³ | a short paragraph / small JSON |
| 1 MB | 10⁶ | a photo thumbnail / short song clip |
| 1 GB | 10⁹ | a movie compressed a bit / big DB table |
| 1 TB | 10¹² | a large disk / serious data lake slice |
| 1 PB | 10¹⁵ | “company-scale” storage |

### Traffic shortcuts

```text
1 QPS   ≈ 86,000 requests/day   ≈ 2.5 million / month
10 QPS  ≈ 860,000 / day
100 QPS ≈ 8.6 million / day
1,000 QPS ≈ 86 million / day
```

### Latency intuition (bonus)

| Store | Typical latency |
|-------|-----------------|
| Memory / Redis | ~0.1–1 ms |
| SSD disk read | ~0.1–1 ms (local) to a few ms |
| Network inside DC | ~0.5–2 ms |
| Cross-region | tens–hundreds of ms |

You rarely compute latency in estimates, but it explains *why* cache helps.

---

## Step 1 — Estimating QPS (how busy?)

**QPS** = Queries Per Second = how many requests hit your servers each second.

### Formula

```text
Average QPS ≈ (DAU × actions per user per day) / 86,400

Peak QPS ≈ Average QPS × peak factor
```

**Peak factor** is usually **2× to 5×** (lunch, evenings, launches, cricket final).

### Worked example A — Twitter-like home feed

Assumptions (say them out loud in an interview):

- **200 million** daily active users (DAU)  
- Each user opens the app **5 times/day** and loads the feed once per open  

```text
Feed requests / day = 200M × 5 = 1 billion
Avg QPS = 1,000,000,000 / 86,400 ≈ 11,600 QPS
Peak (3×) ≈ 35,000 QPS
```

**What this tells you:** feed reads are a big deal → cache timelines, CDN for media, many read replicas.

### Worked example B — URL shortener redirects

Assumptions:

- **100 million** redirects/day  
- Creates are only **1 million**/day  

```text
Redirect avg QPS = 100M / 86,400 ≈ 1,160 QPS
Create avg QPS   = 1M / 86,400 ≈ 12 QPS
Peak redirects (4×) ≈ 4,600 QPS
```

**What this tells you:** system is **read-heavy** (~100:1). Optimize redirect path with Redis. Don’t over-engineer the create path.

### Worked example C — small startup chat app

Assumptions:

- **50,000** DAU  
- Each sends **20 messages**/day  
- Each also fetches inbox **10 times**/day  

```text
Message sends / day = 50k × 20 = 1M  → write QPS ≈ 12
Inbox loads / day   = 50k × 10 = 500k → read QPS ≈ 6
Peak writes (5× during evening) ≈ 60 QPS
```

**What this tells you:** one solid backend + Postgres is plenty for MVP. WebSockets matter more than sharding.

### Quick QPS practice table

Try filling the last column yourself, then check:

| Product vibe | DAU | Actions/user/day | Avg QPS (approx) |
|--------------|-----|------------------|------------------|
| Local cafe app | 2,000 | 3 | 2,000×3/86k ≈ **0.07** → basically idle |
| College portal | 20,000 | 10 | ≈ **2 QPS** |
| Mid-size SaaS | 500,000 | 20 | ≈ **115 QPS** |
| Big social | 100M | 10 | ≈ **11,600 QPS** |

---

## Step 2 — Estimating storage (how much disk?)

### Formula

```text
Storage ≈ number of new records × size per record × how long you keep them
```

Don’t forget: indexes, replicas, and backups often **2×–3×** the “raw” size.

### How big is one record? (useful guesses)

| Data | Rough size |
|------|------------|
| User profile row | 1–2 KB |
| Tweet / chat message text | 0.5–1 KB |
| URL mapping row | 0.5 KB |
| JSON event (analytics) | 0.5–2 KB |
| Compressed photo | 100 KB–2 MB |
| HD photo | 2–5 MB |
| Short video (1 min) | 5–50 MB |
| HD movie | 1–5 GB |

### Worked example D — WhatsApp-like text messages

Assumptions:

- **1 billion** messages/day  
- Average message **100 bytes** text + **400 bytes** metadata ≈ **500 bytes**  
- Keep **2 years** of history  

```text
Per day  = 1B × 500 B = 500 GB/day
Per year = 500 GB × 365 ≈ 180 TB/year
2 years  ≈ 360 TB raw
With replicas/indexes (~3×) ≈ 1 PB order of magnitude
```

**What this tells you:** messaging storage is serious → shard by conversation/user, cold storage for old messages, maybe separate media store.

### Worked example E — Instagram-like photos

Assumptions:

- **100 million** DAU  
- **10%** upload **1 photo**/day → **10M photos/day**  
- Average photo stored (after compression + variants) ≈ **500 KB** effective new bytes  
- Keep forever (5 years for estimate)  

```text
Per day = 10M × 500 KB = 5 TB/day
Per year ≈ 5 TB × 365 ≈ 1.8 PB/year
5 years ≈ 9 PB (before redundancy)
```

**What this tells you:** **never** put photos in MySQL. Use object storage (S3) + CDN. DB only stores metadata (`photo_id`, `s3_key`, `user_id`).

### Worked example F — URL shortener storage (small!)

Assumptions:

- **100M** new links/month  
- **500 bytes**/row  
- Keep **5 years**  

```text
Per month = 100M × 500 B = 50 GB
Per year  = 600 GB
5 years   = 3 TB raw → ~6 TB with indexes
```

**What this tells you:** storage is easy; **redirect QPS + cache** is the real topic.

---

## Step 3 — Estimating bandwidth (how fat is the pipe?)

### Formula

```text
Bandwidth ≈ QPS × average response size
```

(Also estimate upload bandwidth separately if users send big files.)

### Worked example G — feed API (JSON only)

Assumptions:

- Peak feed QPS = **35,000**  
- Each response ≈ **50 KB** JSON  

```text
35,000 × 50 KB = 1,750,000 KB/s ≈ 1.75 GB/s ≈ ~14 Gbps
```

**What this tells you:** many app servers + maybe response caching. Still lighter than shipping images through your API.

### Worked example H — serving images without CDN (bad idea)

Assumptions:

- **10,000** image views/sec at peak  
- Average image **200 KB**  

```text
10,000 × 200 KB = 2,000,000 KB/s ≈ 2 GB/s ≈ ~16 Gbps from origin
```

**What this tells you:** put a **CDN** in front. Origin should mostly see cache misses.

### Upload bandwidth example — video

Assumptions:

- **100,000** users upload a **50 MB** video each day  

```text
Daily ingest = 100k × 50 MB = 5 TB/day
Avg upload rate = 5 TB / 86,400 ≈ 58 MB/s ≈ ~0.5 Gbps average
Peaks can be many times higher → need direct-to-S3 uploads
```

---

## Putting it together — full mini case studies

### Case 1: Pastebin

| Assumption | Value |
|------------|-------|
| Creates | 5M / day |
| Reads | 50M / day |
| Avg paste size | 10 KB |
| Retention | 1 year |

```text
Write QPS ≈ 5M/86400 ≈ 58
Read QPS  ≈ 50M/86400 ≈ 580
Peak reads (4×) ≈ 2,300

Storage/year ≈ 5M × 365 × 10 KB ≈ 18 TB
```

**Design implication**

| Finding | Decision |
|---------|----------|
| Writes low | Simple API + DB fine |
| Reads higher | Cache hot pastes |
| Storage large | Body in S3, metadata in DB |

### Case 2: Ticket booking (flash sale)

| Assumption | Value |
|------------|-------|
| Tickets on sale | 50,000 |
| Interested users hammering | 2,000,000 in 10 minutes |
| Each user retries checkout ~5 times |

```text
Requests in 10 min ≈ 2M × 5 = 10M
Seconds = 600
Effective QPS ≈ 10M / 600 ≈ 17,000 QPS spike
```

**Design implication:** queue + rate limit + hold seats. Average daily QPS is irrelevant — **the spike** is the product.

### Case 3: Ride sharing location updates

| Assumption | Value |
|------------|-------|
| Concurrent drivers online | 100,000 |
| GPS update every | 4 seconds |

```text
Write QPS ≈ 100,000 / 4 = 25,000 location writes/sec
```

**Design implication:** don’t write every ping to Postgres as a row forever. Use Redis GEO / in-memory + sampled history.

### Case 4: YouTube-like watch traffic (simplified)

| Assumption | Value |
|------------|-------|
| DAU | 50M |
| Videos watched / user / day | 5 |
| Avg bytes streamed / watch (adaptive) | 80 MB |

```text
Watches/day = 50M × 5 = 250M
Bytes/day ≈ 250M × 80 MB = 20,000 TB = 20 PB/day egress 😱
```

**Design implication:** almost all bytes must come from **CDN**, not your origin. Your estimate just proved why Netflix/YouTube are CDN companies as much as app companies.

---

## Read vs write — always compute the ratio

```text
Read:Write ratio ≈ read QPS : write QPS
```

| Ratio | Typical system | Lean toward |
|-------|----------------|-------------|
| 100:1 | URL shortener, CDN origins | Cache, replicas |
| 10:1 | Social feed | Cache + async fanout |
| 1:1 | Chat send ≈ receive | Careful with both paths |
| 1:10 | Logging / metrics | Queues, append stores |

---

## When is one machine not enough?

Rough beginner guardrails (not laws):

| Resource | “Still OK on one strong box” | “Start planning scale-out” |
|----------|------------------------------|----------------------------|
| Simple API QPS | < a few thousand | > 10k sustained, or spiky |
| DB writes (single primary) | < a few hundred–~1k TPS | Multi-thousand writes/sec |
| DB size | < a few TB | Many TB + heavy indexes |
| Outbound bandwidth | < 1 Gbps comfortable | Multi-Gbps sustained |

If your napkin math crosses these lines, mention **replicas, cache, shard, queue, or CDN** in the HLD — with a reason tied to the number.

---

## A 5-minute interview recipe

Use this every time:

1. **Clarify DAU / actions** (guess if needed, say you’re guessing)  
2. **Compute avg QPS** → apply peak factor  
3. **Estimate record size × volume × retention** → storage  
4. **QPS × payload size** → bandwidth (especially media)  
5. **Read:write ratio** → pick cache / queue / shard story  
6. **Circle the bottleneck** in one sentence  

Example one-liner:

> “~4k peak redirect QPS and 100:1 reads → Redis cache in front of Postgres; storage is only a few TB so sharding can wait.”

---

## Common beginner mistakes

1. **Fake precision** — “QPS = 1,157.407” → just say ~1,200  
2. **Forgetting peaks** — averages hide Black Friday  
3. **Putting media size into the DB estimate** — metadata ≠ video bytes  
4. **Ignoring retention** — 1 day of logs ≠ 5 years of logs  
5. **Designing Kafka on day one for 5 QPS** — numbers should drive complexity  

---

## Practice problems

Try these before opening the answers.

### Practice 1

DAU = 5 million. Each user makes **8 API calls**/day. Peak factor = 3.  
What is peak QPS?

### Practice 2

A chat app stores **200 million** messages/day at **1 KB** each. Keep **90 days**.  
Approx raw storage for 90 days?

### Practice 3

An image CDN edge sees **20,000** requests/sec, **150 KB** average.  
Approx bandwidth?

### Practice 4

E-commerce: 100k orders/day, each order write hits DB once. Are writes the bottleneck?

<details>
<summary>Answers</summary>

**1.** Requests/day = 5M × 8 = 40M → avg QPS ≈ 40M/86400 ≈ 460 → peak ≈ **1,400 QPS**.

**2.** Per day = 200M × 1 KB = 200 GB → 90 days ≈ **18 TB** raw (plus indexes/replicas in real life).

**3.** 20,000 × 150 KB = 3,000,000 KB/s ≈ **3 GB/s ≈ ~24 Gbps**.

**4.** Write QPS ≈ 100k/86400 ≈ **1.2 QPS** — trivial. Catalog **reads** and payment latency matter more than order write volume.

</details>

---

## Check your understanding

1. Roughly how many requests/day is **1,000 QPS**?  
2. Why multiply by a peak factor?  
3. DAU = 1M, each uploads a **2 MB** photo once/day — daily ingest?  
4. Name one system that is storage-heavy but write-QPS-light.  

<details>
<summary>Answers</summary>

1. ≈ 1,000 × 86,400 ≈ **86 million**/day.  
2. Traffic is uneven; capacity must cover busy hours / events.  
3. 1M × 2 MB = **2 TB/day**.  
4. Pastebin / photo metadata systems / analytics cold store — many answers work if justified.

</details>

---

## Recap

- Estimates exist to **find bottlenecks**, not to impress with arithmetic  
- Master three tools: **QPS**, **storage**, **bandwidth**  
- Round bravely; state assumptions  
- End with: *“So the hard part is X, therefore we add Y.”*  

**Next:** [Clients, Servers & APIs](04-clients-servers-apis.md)
