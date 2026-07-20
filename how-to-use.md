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

## How to study each case study

1. Cover the solution and try your own HLD for 10–15 minutes  
2. Compare with the tutorial HLD  
3. Read LLD carefully — APIs and tables are where interviews get specific  
4. Note 2–3 trade-offs you would mention in an interview  

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
