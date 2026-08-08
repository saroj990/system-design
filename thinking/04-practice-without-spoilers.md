# 04. Practice Without Spoilers

> **Goal:** Turn every case study into a thinking drill — not a reading binge.

You already have 41 worked solutions. The skill unlock is **doing the blank work first**.

---

## The practice protocol (use on every case study)

```text
1. Read only: title + problem + requirements (stop before estimates/HLD)
2. Start a 15-minute timer
3. Run the Thinking Loop on paper
4. Draw Layer A → Layer B
5. List 2 failures + 1 trade-off
6. Uncover the tutorial and grade with the rubric below
7. Write a 3-bullet “what I’d say differently next time”
```

If you skip steps 2–5, you are mostly memorizing.

---

## What to cover with your hand (or scroll discipline)

On each case study page, practice **stopping before**:

1. Back-of-the-envelope (try your own numbers first)  
2. HLD diagram  
3. LLD APIs/schema  

It’s OK to peek at requirements twice. It’s not OK to peek at the diagram “just for a second” before your attempt — your brain will treat it as the answer key.

---

## Grading rubric (honest scoring)

Score 0–2 on each row (0 = missing, 1 = partial, 2 = clear).

| Skill | 0 | 1 | 2 |
|-------|---|---|---|
| **Assumptions** | None | Vague | Explicit + ask interviewer |
| **Core verb / hot path** | Unclear | Named but mixed with side tasks | Crisp split |
| **Estimates** | None | One number | Shape: QPS + storage + ratio |
| **Simple core first** | Mega-diagram immediately | Core exists but buried | Layer A then grow |
| **Bottleneck → component** | Buzzwords | Component without why | Clear causal link |
| **Flow walkthrough** | None | Only happy path nouns | Read + write steps |
| **Failures** | None | One vague risk | Concrete failure + mitigation |
| **Trade-off** | None | Preference only | A vs B with when |

**Max 16.**  
- **12–16:** strong session  
- **8–11:** solid — pick one weak row to drill  
- **&lt;8:** repeat the same prompt tomorrow with [Thinking Loop](01-the-thinking-loop.md) open

---

## Failure-first add-on (5 extra minutes)

After your diagram, fill this table *before* reading the tutorial’s scale section:

| Failure | What user sees | What you do first |
|---------|----------------|-------------------|
| Cache cluster down | | |
| Primary DB unavailable | | |
| Queue backlog grows 1 hour | | |
| Hot key / viral spike | | |
| Duplicate webhook / retry | | |

You won’t always have perfect answers. The act of asking is the skill.

---

## Design A vs Design B (force a choice)

For these case studies, always invent an alternative:

| Case study | Axis to compare |
|------------|-----------------|
| [News Feed](../case-studies/06-news-feed.md) | Fan-out on write vs read |
| [Chat](../case-studies/07-chat-messaging.md) | Sticky gateway sessions vs Redis routing |
| [Ticket Booking](../case-studies/11-ticket-booking.md) | DB locks only vs Redis holds + DB confirm |
| [Pastebin](../case-studies/02-pastebin.md) | Blob in DB vs object storage |
| [Rate Limiter](../case-studies/03-rate-limiter.md) | Token bucket vs fixed window |

Write 3 bullets:

```text
Design A: ...
Design B: ...
I’d pick __ because __; I’d switch if __.
```

---

## Suggested drill order (beginner → stretch)

Don’t march 01→41 in order on day one. Use this ladder:

### Week ladder

| Day focus | Drill these (practice first) |
|-----------|------------------------------|
| Caching + simple CRUD | URL Shortener, Pastebin, Rate Limiter |
| Social read paths | News Feed, Photo Sharing |
| Realtime | Chat, Collaborative Docs (harder) |
| Scarcity + money | Ticket Booking, Payment Wallet |
| Media | Video Streaming, Music Streaming |
| Data pipelines | Notification System, Analytics Pipeline |

Advanced Part 3 studies (matching engine, Raft, S3 internals) come **after** the loop feels automatic.

---

## Interview day checklist (pocket card)

```text
□ Clarify + assumptions
□ Core verb + hot path
□ Traffic shape (QPS, R:W, storage)
□ 3–4 APIs
□ Layer A diagram
□ Add boxes only with reasons
□ Walk read + write
□ Failures + trade-offs
□ “At 10× I would …”
```

If time is almost up, skip pretty boxes — **talk failures and trade-offs**. That scores higher than a silent perfect diagram.

---

## Pair this section with

| Resource | Use it for |
|----------|------------|
| [Thinking Loop](01-the-thinking-loop.md) | The 5 questions |
| [Pattern Choosers](02-pattern-choosers.md) | Stuck on queue/cache/SQL |
| [First 10 Minutes](03-first-10-minutes.md) | Hear a strong narration |
| [How to do HLD](../fundamentals/14-how-to-hld.md) | Full 8-step checklist |
| [How to do LLD](../fundamentals/15-how-to-lld.md) | After HLD is solid |

---

## Mini challenge

Pick **one** case study you haven’t memorized. Run the full protocol today. Tomorrow, redo the *same* prompt from memory without notes — only the pocket card above.

Improvement on the second attempt is the point of this course.

---

## Check your understanding

1. Why grade yourself before reading the official HLD?  
2. What should you do if your diagram differs from the tutorial but your reasons are sound?  
3. Why practice failure tables even as a beginner?

<details>
<summary>Answers</summary>

1. After you see the answer, you can’t tell whether you could generate structure under pressure.  
2. Keep your design if trade-offs are honest — tutorials are one good path, not the only path. Note differences; don’t force identical boxes.  
3. Interviews often ask “what if Redis dies?” — practicing failures builds flexible thinking beyond happy-path blogs.

</details>

---

**Next:** Start drilling with [URL Shortener](../case-studies/01-url-shortener.md) — cover the solution, run the protocol, then uncover.
