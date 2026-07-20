# Case Study 24 — API Gateway

Design an **API Gateway** in front of microservices: single entry point for clients with routing, authentication, rate limiting, and optional response aggregation.

## 1. Problem

Mobile and web clients should not call dozens of internal services directly. A gateway terminates TLS, validates identity, enforces quotas, routes to the correct backend, and can combine multiple backend calls into one client response.

## 2. Requirements

### Functional (MVP)

- Route requests by path/host to backend services  
- Authenticate requests (JWT validation)  
- Rate limit per user/API key/IP  
- Request/response logging and correlation IDs  
- Optional **aggregation**: one endpoint calls multiple services and merges JSON  
- Health-aware routing (skip unhealthy backends)  

### Out of scope (initially)

- Full GraphQL federation, WebSocket gateway for all products  
- WAF/DDoS at L7 (assume CDN/WAF upstream)  
- Developer portal and API key self-service UI  
- Complex transformation (XML ↔ JSON)  

### Non-functional

- Low added latency (< 10–20 ms P95 at gateway itself)  
- Stateless gateway instances — horizontal scale  
- Fail closed on auth failures  
- Rate limits accurate enough for abuse prevention (not perfect global sync required for MVP)  
- High availability — gateway is on every request path  

## 3. Back-of-the-envelope

Assumptions:

- 10 backend services  
- 50K RPS aggregate through gateway  
- Average gateway processing 5 ms; backend 100 ms  

```text
Gateway instances:
  each handles ~5K RPS comfortably
  50K / 5K = ~10 instances (+ N+1 for HA)

Rate limit storage:
  1M active API keys × ~100 B ≈ 100 MB in Redis

Log volume:
  50K RPS × 86400 ≈ 4.3B requests/day
  sample 1% + structured logs ≈ manageable with log pipeline
```

Insight: **gateway stays thin** — heavy business logic stays in services; gateway does cross-cutting concerns only.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  C[Clients] --> CDN[CDN / WAF]
  CDN --> GLB[Global LB]
  GLB --> G1[Gateway]
  GLB --> G2[Gateway]
  G1 --> Auth[Auth / JWKS]
  G1 --> RL[(Redis Rate Limits)]
  G1 --> R[Router]
  R --> U[User Service]
  R --> O[Order Service]
  R --> P[Product Service]
  G1 --> Agg[Aggregation Layer]
  Agg --> U
  Agg --> O
  G1 --> Log[Logging Pipeline]
```

### Components

| Component | Role |
|-----------|------|
| Gateway (Envoy/Kong/custom) | HTTP proxy + plugins/middleware chain |
| Router | Path → upstream service mapping |
| Auth middleware | JWT verify, scopes, API key lookup |
| Rate limiter | Token bucket / sliding window in Redis |
| Service registry | Consul/K8s DNS/upstream health |
| Aggregation layer | Parallel backend fan-out + merge |
| Logging pipeline | Access logs, trace IDs, metrics |

### Flows

**Simple proxied request**

1. Client `GET /api/v1/users/me` with `Authorization: Bearer <jwt>`  
2. Gateway assigns `X-Request-Id`  
3. Auth middleware validates JWT signature + expiry  
4. Rate limiter checks key `user:{sub}`  
5. Router forwards to User Service with internal headers  
6. Response streamed back; access log emitted  

**Aggregated request**

1. Client `GET /api/v1/dashboard`  
2. After auth, aggregation handler fans out:  
   - `GET user-service/profile`  
   - `GET order-service/recent?limit=5`  
   - `GET product-service/recommendations`  
3. Wait for all (or partial with timeout policy)  
4. Merge JSON `{ profile, orders, recommendations }`  
5. Return single response  

**Rate limit exceeded**

1. Limiter returns 429 with `Retry-After`  
2. Request never hits backend  

### Trade-offs

- **Central gateway vs sidecar per service** — central simpler for clients; sidecar better per-team isolation at scale  
- **Sync JWT verify vs introspection** — JWT local verify is fast; introspection handles instant revocation  
- **Global vs local rate limits** — Redis cluster ≈ global; per-node counters are faster but uneven  
- **Aggregation in gateway vs BFF service** — gateway OK for small merges; complex BFF deserves its own service  

## 5. Low-Level Design (LLD)

### Route configuration (declarative)

```text
routes:
  - match: { pathPrefix: "/api/v1/users" }
    upstream: user-service
    auth: jwt
    rateLimit: { key: userId, rpm: 600 }

  - match: { pathPrefix: "/api/v1/orders" }
    upstream: order-service
    auth: jwt
    rateLimit: { key: userId, rpm: 300 }

  - match: { path: "/api/v1/dashboard" }
    handler: aggregateDashboard
    auth: jwt
    rateLimit: { key: userId, rpm: 120 }
```

### APIs (client-facing)

```text
GET /api/v1/users/me
Authorization: Bearer <jwt>
→ proxied to user-service

GET /api/v1/orders?status=open
→ proxied to order-service

GET /api/v1/dashboard
→ 200 {
    "profile": { "name": "Ada", "tier": "pro" },
    "recentOrders": [...],
    "recommendations": [...]
  }

GET /health
→ 200 { "status": "ok" }
```

Internal headers added by gateway:

```text
X-Request-Id: req_abc123
X-User-Id: 42
X-User-Scopes: orders:read,users:read
X-Forwarded-For: <client-ip>
```

### Schema (API keys — optional)

```text
api_keys (
  id            BIGSERIAL PRIMARY KEY,
  key_hash      VARCHAR(64) UNIQUE NOT NULL,
  owner_id      BIGINT NOT NULL,
  tier          VARCHAR(32) NOT NULL,
  rpm_limit     INT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL
)

rate_limit_buckets (
  bucket_key    VARCHAR(128) PRIMARY KEY,  -- e.g. "user:42" or "ip:1.2.3.4"
  tokens        INT NOT NULL,
  last_refill   TIMESTAMPTZ NOT NULL
)
```

### Modules

```text
GatewayServer
MiddlewareChain
  - RequestIdMiddleware
  - LoggingMiddleware
  - AuthMiddleware
  - RateLimitMiddleware
  - RouterMiddleware
UpstreamClient
AggregateHandlers
  - DashboardHandler
RouteConfigLoader
HealthCheckPoller
MetricsExporter
```

### Algorithm — middleware chain

```text
function handle(request):
  ctx = newContext(request)
  for mw in middlewareChain:
    result = mw.process(ctx)
    if result.shortCircuit:
      return result.response   -- e.g. 401, 429
  upstreamResponse = router.forward(ctx)
  return upstreamResponse
```

### Algorithm — JWT auth (fail closed)

```text
function authMiddleware(ctx):
  token = parseBearer(ctx.headers.Authorization)
  if token is null:
    return shortCircuit(401, "missing token")

  try:
    claims = jwt.verify(token, jwksUrl, audience="api")
  catch Expired:
    return shortCircuit(401, "token expired")
  catch InvalidSignature:
    return shortCircuit(401, "invalid token")

  ctx.userId = claims.sub
  ctx.scopes = claims.scope.split(" ")
  return continue
```

### Algorithm — token bucket rate limit (Redis)

```text
function rateLimitMiddleware(ctx):
  key = "rl:user:" + ctx.userId
  limit = tierLimit(ctx.userId)      -- e.g. 600 requests/minute
  refillRate = limit / 60            -- tokens per second

  -- Lua script in Redis for atomicity
  allowed, remaining, retryAfter = redis.tokenBucket(
    key, capacity=limit, refillRate, cost=1
  )

  if not allowed:
    return shortCircuit(429, headers={ Retry-After: retryAfter })

  ctx.headers["X-RateLimit-Remaining"] = remaining
  return continue
```

### Algorithm — dashboard aggregation

```text
function aggregateDashboard(ctx):
  userId = ctx.userId
  timeout = 2 seconds

  results = parallelWithTimeout(timeout, [
    () => upstream.get("user-service", "/users/" + userId + "/profile"),
    () => upstream.get("order-service", "/orders/recent?userId=" + userId),
    () => upstream.get("product-service", "/recommendations?userId=" + userId)
  ])

  if results.profile.failed and results.orders.failed:
    return 503("critical upstream unavailable")

  return 200({
    profile: results.profile.value or null,
    recentOrders: results.orders.value or [],
    recommendations: results.recommendations.value or []
  })
```

### Concurrency & correctness

- Gateway instances are **stateless**; shared state only in Redis/JWKS cache  
- Circuit breaker per upstream avoids cascade failures  
- Aggregation uses bounded thread pool + per-upstream timeouts  
- Propagate same `X-Request-Id` to all backends for distributed tracing  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single region; NGINX/Envoy; Redis rate limits; static routes |
| Many services | Dynamic config from control plane; K8s service discovery |
| Global | Regional gateways; geo-routing; JWT keys cached locally |
| High security | mTLS gateway→service; OAuth2 introspection for sensitive routes |
| Heavy aggregation | Extract BFF services; gateway routes only |

## 7. Recap

- Gateway = **cross-cutting edge**: route, auth, limit, observe  
- **Fail closed** on bad/missing credentials  
- Rate limits in **Redis** with atomic token bucket  
- Keep aggregation **simple**; push complex orchestration to BFF  

**Practice:** redraw HLD from memory, then write middleware chain + token bucket pseudocode without looking.
