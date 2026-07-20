# 09. CAP & Consistency

## Learning goals

- Explain consistency vs availability in plain English  
- Use CAP as intuition, not a religion  
- Pick consistency level for common features  

## The everyday problem

You have two database replicas in different places. A write happens on one.

Question: must every read everywhere see that write **immediately**?

- If **yes**, you may refuse some requests during network problems.  
- If **no**, users might briefly see old data, but the system stays up.  

That tension is the heart of this chapter.

## Consistency models (practical)

| Model | Meaning | Example |
|-------|---------|---------|
| **Strong** | After write ACK, all reads see it | Bank balance debit |
| **Eventual** | Reads converge to latest soon | Social like counts |
| **Read-your-writes** | You always see your own updates | Profile edit |

## CAP theorem (beginner version)

For a distributed data store, during a **network partition**, you lean toward:

- **C**onsistency — same data everywhere, or error  
- **A**vailability — always respond, maybe stale  
- **P**artition tolerance — network breaks *will* happen  

In real cloud systems, partitions happen, so you effectively choose between **C and A** during trouble.

Use CAP to **frame trade-offs**, not to memorize product labels.

## PACELC (optional upgrade)

Even without partitions, systems trade **latency vs consistency** (the ELC part). Waiting for many replicas increases latency.

## What to choose in product features

| Feature | Typical choice | Why |
|---------|----------------|-----|
| Payments / inventory checkout | Stronger consistency | Wrong count = money loss |
| URL redirect mapping | Strong enough / short lag OK | Wrong link is rare if carefully designed |
| Like counters | Eventual | Approximate is OK |
| News feed | Eventual / timeline lag OK | Fresh-enough is fine |
| Chat delivery | Durable + ordered per conversation | Don’t lose messages |

## Quorum intuition (Dynamo-style)

For N replicas, write to W, read from R.

If \(W + R > N\), reads and writes overlap → stronger consistency.

Example: N=3, W=2, R=2.

## Replication lag revisited

With primary + read replicas, reading from replica can return stale data.

Mitigation: read-your-writes via primary for that user, or session stickiness to primary after write.

## How to talk about this in HLD

Say sentences like:

> “Like counts are eventually consistent via async aggregation. Checkout uses a transactional inventory decrement.”

That sounds senior — and it’s clear.

## Check your understanding

1. Can a system be strongly consistent and always available during a network split?  
2. Why are like counts often eventually consistent?  
3. What does read-your-writes protect against?  

<details>
<summary>Answers</summary>

1. Not if you require partition tolerance — you usually sacrifice one during the split.  
2. Exact real-time accuracy rarely matters; availability and speed do.  
3. Users seeing their own outdated data right after an update.

</details>

---

**Next:** [Queues & Async Processing](10-queues-async.md)
