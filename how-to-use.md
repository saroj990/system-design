# How to use this course

## Mental model

System design answers three questions:

1. **What** does the product need to do?
2. **How** do pieces of software talk and store data?
3. **What breaks** when traffic or data grows 100×?

You will practice the same loop on every lesson and case study:

```text
Clarify → Estimate → Draw HLD → Detail LLD → Discuss trade-offs
```

## Symbols used in lessons

| Symbol | Meaning |
|--------|---------|
| **HLD** | High-Level Design — boxes and arrows (services, DBs, queues) |
| **LLD** | Low-Level Design — APIs, schemas, classes, algorithms |
| **QPS** | Queries Per Second — request rate |
| **SLA / SLO** | How reliable / fast the system promises to be |

## How to study each fundamental chapter

1. Read once for intuition  
2. Redraw any diagram from memory  
3. Answer the “Check your understanding” questions  
4. Only then move on  

Skipping ahead to case studies without fundamentals usually creates confusion (why Redis? why a queue?).

## How to think (before memorizing case studies)

After fundamentals — and before binge-reading solutions — complete **Part 1.5 — How to think**:

1. [The Thinking Loop](thinking/01-the-thinking-loop.md) — five questions for any prompt  
2. [Pattern Choosers](thinking/02-pattern-choosers.md) — queue / cache / SQL / fan-out trees  
3. [First 10 Minutes](thinking/03-first-10-minutes.md) — narrated interview scripts  
4. [Practice Without Spoilers](thinking/04-practice-without-spoilers.md) — drill protocol + rubric  

The goal is a repeatable method, not a catalog of diagrams.

## How to study each case study

1. Read **only** the problem + requirements  
2. Run the Thinking Loop on paper for 10–15 minutes (see Part 1.5)  
3. Uncover estimates + HLD and grade your reasoning (not box-for-box match)  
4. Read LLD carefully — APIs and tables are where interviews get specific  
5. Note 2–3 trade-offs + one failure mode you would mention  

## Interview tip

Interviewers care more about **clear reasoning** than a perfect diagram. Always say:

- assumptions  
- bottlenecks  
- what you would change at 10× scale  

## Tools in this site

- **Sidebar** — full course outline  
- **Search** — find topics across lessons  
- **Previous / Next** — sequential reading  

---

**Next:** [What is System Design?](fundamentals/01-what-is-system-design.md)
