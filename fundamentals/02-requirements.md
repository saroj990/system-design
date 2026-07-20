# 02. Requirements Gathering

## Learning goals

- Separate functional and non-functional requirements  
- Ask clarifying questions before drawing boxes  
- Define MVP vs nice-to-have  

## Why this comes first

If you jump straight to diagrams, you often solve the wrong problem.

Example: “Design Instagram”

Does that mean:

- photo upload + feed only?  
- stories, DMs, Reels, ads, search?  

Those are completely different systems. **Clarify first.**

## Functional requirements

What users can do. Write them as bullets.

Example — URL shortener MVP:

- User submits a long URL and gets a short URL  
- Visiting the short URL redirects to the long URL  
- Optional: custom alias, expiry, click count  

## Non-functional requirements

Quality attributes. Common categories:

| Category | Questions to ask |
|----------|------------------|
| **Latency** | How fast should redirect be? |
| **Availability** | Can redirects be down? How often? |
| **Consistency** | Must every read see the latest write immediately? |
| **Durability** | Can we lose data? Ever? |
| **Scale** | Daily active users? Peak QPS? |
| **Security** | Auth? Abuse? Malicious links? |

## The clarifying-question checklist

Use this in interviews and real projects:

1. Who are the users? (public, internal, mobile, IoT)  
2. What is the **MVP**?  
3. Read-heavy or write-heavy?  
4. Expected scale (now and in 1–2 years)?  
5. Latency expectations (p50 / p99)?  
6. Consistency needs?  
7. Any compliance (PII, payments, GDPR)?  
8. Online vs offline / async allowed?  

## MVP mindset

Design the **smallest useful product**, then say how it evolves.

Bad: “We’ll build Kafka, multi-region Cassandra, ML ranking…” on minute one.  
Good: “MVP is single-region Postgres + Redis. At 10× traffic we’d shard.”

## Write requirements like this (template)

```text
Product: <name>

Functional (MVP):
- ...
- ...

Out of scope (for now):
- ...

Non-functional:
- Scale: ...
- Latency: ...
- Availability: ...
- Consistency: ...
```

## Example: Chat app (trimmed)

**Functional (MVP)**

- 1:1 text messaging  
- Online/offline delivery  
- Message history  

**Out of scope**

- Voice/video, group chats of 10k, disappearing messages  

**Non-functional**

- Delivery latency usually < 500ms on good network  
- Messages must not be lost once acknowledged  
- Support millions of concurrent connections eventually  

## Common beginner mistakes

1. Designing every feature of a real company product  
2. Ignoring non-functionals entirely  
3. Assuming strong consistency when eventual is fine  
4. Forgetting abuse cases (spam, bots, oversized uploads)  

## Check your understanding

1. Is “redirect must complete in under 100ms” functional or non-functional?  
2. Why list out-of-scope items?  
3. Give one clarifying question for “Design YouTube.”  

<details>
<summary>Answers</summary>

1. Non-functional (latency).  
2. Prevents scope explosion and wrong architecture.  
3. Examples: upload only or also live streaming? Global users? Max video size? Free vs paid CDN budget?

</details>

---

**Next:** [Back-of-the-Envelope Estimates](03-estimates.md)
