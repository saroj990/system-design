# 13. Reliability, Security & Observability

## Learning goals

- Add failure thinking to every design  
- Apply basic security controls  
- Know what to monitor  

## Reliability mindset

Everything fails: disks, networks, zones, deploys, dependencies.

Design for:

1. **Detection** — know it’s broken  
2. **Mitigation** — degrade gracefully  
3. **Recovery** — return to healthy  

## High availability patterns

| Pattern | Idea |
|---------|------|
| Redundancy | Multiple instances, multi-AZ |
| Health checks + auto replace | Remove bad nodes |
| Timeouts | Don’t wait forever |
| Retries with backoff | Transient blips |
| Circuit breaker | Stop calling a sick dependency |
| Bulkhead | Isolate thread/connection pools |
| Graceful degradation | Feed without recommendations still works |

## Backups & disaster recovery

- Regular DB backups + restore drills  
- Multi-AZ for hardware failure  
- Multi-region only when business truly needs it (expensive/complex)  

Know your **RPO** (how much data you can lose) and **RTO** (how fast you must recover).

## Rate limiting & abuse

Protect APIs from bots and accidental floods.

Place limits at edge/API gateway (see case study 03).

## Security basics for HLD/LLD

Always mention where relevant:

- **Authn** — who are you? (login, OAuth, JWT)  
- **Authz** — what can you do? (ACL/roles)  
- **TLS everywhere**  
- **Secrets** in a vault, not source code  
- **Input validation** / size limits  
- **Least privilege** IAM for S3/DB  
- **Encryption at rest** for sensitive data  
- **Audit logs** for payments/admin actions  

## Observability pillars

| Pillar | What | Example |
|--------|------|---------|
| **Logs** | Event records | `order_id=… status=paid` |
| **Metrics** | Numbers over time | QPS, latency p99, error rate |
| **Traces** | Request across services | API → payment → DB spans |

Golden signals: **latency, traffic, errors, saturation**.

## SLOs

Example: “99.9% of redirects complete under 100ms.”

Alerts should track user pain, not only CPU graphs.

## Putting it in a design doc

A strong beginner ending section:

```text
Failure modes:
- Cache down → read DB (with higher latency)
- Queue lag → delay notifications, not core create
- Primary DB fail → failover to replica

Security:
- Auth on write APIs
- Signed URLs for private media
- Rate limit create endpoints
```

## Check your understanding

1. What is graceful degradation?  
2. Why timeouts matter as much as retries?  
3. Name the three observability pillars.  

<details>
<summary>Answers</summary>

1. Keep core features working when non-critical parts fail.  
2. Without timeouts, retries pile up and amplify outages.  
3. Logs, metrics, traces.

</details>

---

**Next:** [How to do HLD](14-how-to-hld.md)
