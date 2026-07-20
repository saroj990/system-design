# 12. Monolith vs Microservices

## Learning goals

- Define monolith and microservices simply  
- Know when *not* to split services  
- Draw either style cleanly in HLD  

## Monolith

One deployable application handles many features:

```text
Auth + Feed + Payments + Notifications  →  one codebase / one binary
```

### Pros

- Simple to develop early  
- Easy transactions across features  
- One deployment pipeline  

### Cons

- Large codebase can slow teams  
- Scale is coarser (scale whole app)  
- A bug in one area can crash all  

## Microservices

Features become separate services with APIs:

```text
User Service | Feed Service | Media Service | Notification Service
```

### Pros

- Independent deploy/scale  
- Team ownership boundaries  
- Polyglot tech possible  

### Cons

- Distributed complexity (latency, partial failures)  
- Harder transactions  
- More ops/observability needed  

## Beginner rule of thumb

> Start with a **modular monolith**. Extract services when a boundary is clear *and* scaling/team needs justify it.

Interview designs often show multiple boxes for clarity even if MVP would be one service — that’s OK if you say “logical components; can be one deployable initially.”

## How to split (when you do)

Split along **domain boundaries** and **scaling needs**:

- Media processing (CPU heavy)  
- Notifications (spiky, async)  
- Search (different storage)  
- Chat gateway (huge concurrent connections)  

Avoid splitting by accidental technical layers only (“the DaoService microservice”).

## Communication styles

| Style | Use |
|-------|-----|
| Sync HTTP/gRPC | Request needs immediate answer |
| Async events/queues | Side effects, fanout, decoupling |

## Shared database anti-pattern

If every “microservice” reads/writes the same tangled tables, you have a distributed monolith.

Prefer: each service owns its data; others integrate via API/events.

## Example evolution

**MVP:** one API app + Postgres + Redis + S3  

**Later:** extract `MediaService` and `NotificationService` because they scale differently  

## Check your understanding

1. Name one advantage of a monolith for early products.  
2. Why are distributed transactions hard?  
3. What is a modular monolith?  

<details>
<summary>Answers</summary>

1. Faster development, simpler ops, easy cross-feature transactions.  
2. Multiple services/DBs — partial failure and consistency are complex.  
3. One deployable with clear internal modules/boundaries ready for later extraction.

</details>

---

**Next:** [Reliability, Security & Observability](13-reliability-security-observability.md)
