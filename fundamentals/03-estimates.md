# 03. Back-of-the-Envelope Estimates

## Learning goals

- Estimate QPS, storage, and bandwidth roughly  
- Use powers of 10 comfortably  
- Decide when a single machine is not enough  

## Why estimates matter

Estimates tell you **which problems are real**.

If you expect 10 writes/sec, a single Postgres is fine.  
If you expect 100,000 writes/sec, you need sharding, queues, or both.

Interviewers love rough math. Exact numbers are less important than **order of magnitude**.

## Useful constants (memorize these)

| Quantity | Approx |
|----------|--------|
| Seconds in a day | \(8.64 \times 10^4\) ≈ **10⁵** |
| Seconds in a month | ≈ **2.5 × 10⁶** |
| Bytes in a KB / MB / GB / TB | 10³ / 10⁶ / 10⁹ / 10¹² (close enough) |
| 1 million | 10⁶ |

Rule of thumb: **1 request/sec ≈ 86,400 requests/day ≈ 2.5M / month**.

## Estimating QPS

**QPS** = Queries (requests) Per Second.

Formula pattern:

```text
Daily active users × actions per user per day / 86400 ≈ average QPS
Peak QPS ≈ average × peak factor (often 2–5×)
```

### Example

- 10 million DAU  
- Each opens feed 10 times/day  

```text
Requests/day = 10M × 10 = 100M
Avg QPS = 100M / 86400 ≈ 1,200 QPS
Peak ≈ 3× → ~3,600 QPS
```

## Estimating storage

```text
Storage = records × size per record × retention
```

### Example — URL shortener

- 100M new links/month  
- Each record ≈ 500 bytes (URL + metadata)  
- Keep forever for 5 years  

```text
Per month ≈ 100M × 500B = 50 GB
Per year ≈ 600 GB
5 years ≈ 3 TB (+ indexes, say 2× → ~6 TB)
```

Still manageable for modern databases, but you plan backups and growth.

## Estimating bandwidth

```text
Bandwidth ≈ QPS × response size
```

If 3,600 QPS each return 2 KB:

```text
3,600 × 2 KB ≈ 7.2 MB/s ≈ ~60 Mbps
```

Images/videos dominate bandwidth — that’s why CDNs exist.

## When one machine is not enough

Rough intuition (not laws of physics):

| Resource | Single strong server ballpark |
|----------|-------------------------------|
| Web app QPS | thousands–tens of thousands (simple handlers) |
| SQL primary writes | hundreds–low thousands TPS often |
| Disk | TBs easily; tens of TBs need planning |
| Network NIC | 1–10+ Gbps |

If estimates exceed comfortable single-node limits, introduce scale-out pieces early in HLD.

## Traffic patterns

- **Read-heavy:** news feed, URL redirect → cache + replicas  
- **Write-heavy:** metrics ingest → queues + append-friendly stores  
- **Spiky:** ticket sales → aggressive rate limits + queues  

Always ask: read:write ratio?

## Worked mini-example: Pastebin

Assumptions:

- 5M writes/day, 50M reads/day  
- Average paste 10 KB  
- Keep 1 year  

```text
Write QPS ≈ 5M/86400 ≈ 58
Read QPS ≈ 50M/86400 ≈ 580
Peak reads ≈ 2,000

Storage/year ≈ 5M × 365 × 10KB ≈ 18 TB
```

Insight: storage and read bandwidth matter more than write QPS here → object storage + CDN/cache likely.

## Tips for interviews

1. State assumptions out loud  
2. Round aggressively (100M not 97,342,118)  
3. Convert everything to /sec and bytes  
4. Use estimates to justify Redis, sharding, CDN, etc.  

## Check your understanding

1. 1,000 QPS is how many requests/day roughly?  
2. Why do we multiply average QPS by a peak factor?  
3. If each user uploads a 2 MB photo once/day and DAU is 1M, what’s daily ingest?  

<details>
<summary>Answers</summary>

1. ≈ 1,000 × 86,400 ≈ 86M requests/day.  
2. Real traffic is not flat; lunch/evening peaks need headroom.  
3. 1M × 2 MB = 2 TB/day ingest.

</details>

---

**Next:** [Clients, Servers & APIs](04-clients-servers-apis.md)
