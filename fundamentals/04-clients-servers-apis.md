# 04. Clients, Servers & APIs

## Learning goals

By the end of this lesson you will be able to:

- Trace the full **lifecycle of a request** from browser tap to database and back
- Explain the roles of **client**, **server**, **API**, and **database** in plain language
- Design **REST-style HTTP APIs** with sensible URLs, verbs, status codes, and JSON bodies
- Understand when **GraphQL**, **gRPC**, **WebSockets**, and **webhooks** appear (awareness level)
- Apply **authentication**, **idempotency**, **pagination**, and **versioning** patterns
- Write API specs suitable for system design interviews (LLD section)
- Avoid common API design mistakes that cause pain at scale

---

## Client and server — the basics

### Everyday analogy: ordering at a restaurant

| Role | Restaurant | Software |
|------|------------|----------|
| **Client** | You (the customer) | Browser, mobile app, IoT device |
| **Server** | Kitchen + wait staff | API server running business logic |
| **Request** | "I'll have the pasta, no onions" | `GET /api/v1/feed` or `POST /api/v1/orders` |
| **Response** | Plate of food (or "we're out of pasta") | JSON data + HTTP status code |
| **Database** | Pantry / inventory ledger | PostgreSQL, MongoDB, etc. |

The **client** initiates. The **server** responds. The client never talks to the database directly in a typical web app — the server is the gatekeeper.

### Basic request flow

```mermaid
sequenceDiagram
  participant C as Client (browser/app)
  participant S as Server (API)
  participant D as Database

  C->>S: HTTP request (GET /feed)
  Note over C,S: Headers: Auth token, Content-Type
  S->>S: Validate auth, parse request
  S->>D: SQL query (SELECT ... WHERE user_id = 42)
  D-->>S: rows
  S->>S: Format JSON response
  S-->>C: 200 OK + JSON body
  Note over C: Render feed in UI
```

### What each piece does

| Component | Responsibility | Stateless or stateful? |
|-----------|----------------|------------------------|
| **Client** | UI, local state, initiates requests | Holds user session token locally |
| **Server (API)** | Auth, validation, business rules, orchestration | Should be **stateless** (see below) |
| **Database** | Durable storage, queries, transactions | **Stateful** — source of truth |

---

## The full request lifecycle (step by step)

When you tap "Refresh" on a social feed, more happens than you might think:

```mermaid
sequenceDiagram
  participant User
  participant Browser
  participant DNS
  participant LB as Load Balancer
  participant App as App Server
  participant Cache as Redis Cache
  participant DB as Database

  User->>Browser: Tap "Refresh"
  Browser->>DNS: Resolve api.myapp.com
  DNS-->>Browser: IP address
  Browser->>LB: HTTPS GET /api/v1/feed<br/>Authorization: Bearer eyJ...
  LB->>App: Forward to healthy server
  App->>App: Verify JWT, extract user_id
  App->>Cache: GET feed:user:42
  alt Cache hit
    Cache-->>App: Cached feed JSON
  else Cache miss
    App->>DB: SELECT posts WHERE ...
    DB-->>App: Rows
    App->>Cache: SET feed:user:42 (TTL 60s)
  end
  App-->>LB: 200 OK + JSON
  LB-->>Browser: Response
  Browser-->>User: Render posts
```

| Step | What happens | Failure mode |
|------|--------------|--------------|
| 1. DNS lookup | Domain → IP address | DNS outage → app unreachable |
| 2. TLS handshake | Encrypted connection established | Certificate expired → browser warning |
| 3. Load balancer | Picks a healthy app server | All backends down → 503 |
| 4. Auth | Server validates token | Invalid token → 401 Unauthorized |
| 5. Business logic | Query cache or DB | DB timeout → 500 or degraded response |
| 6. Response | JSON back to client | Malformed JSON → client parse error |

Understanding this lifecycle helps you debug ("is it DNS? LB? auth? DB?") and design (where does caching fit? where is auth checked?).

---

## Stateless app servers (critical concept)

A **stateless** app server does not store user-specific data in its own memory between requests. Any server can handle any request.

### Library desk analogy

**Stateful (bad for scale):** One librarian remembers your account in their head. You must always go to *that* librarian.

**Stateless (good for scale):** Any librarian can help you — they look up your account in the shared system (database/Redis) using your library card (JWT/session ID).

```mermaid
flowchart LR
  subgraph Bad["Stateful ❌"]
    U1[User A] --> S1[Server 1<br/>holds User A session]
    U2[User B] --> S2[Server 2<br/>holds User B session]
  end

  subgraph Good["Stateless ✅"]
    U3[User A] --> LB[Load Balancer]
    U4[User B] --> LB
    LB --> SA[Server 1]
    LB --> SB[Server 2]
    SA --> Redis[(Shared session store)]
    SB --> Redis
  end
```

**Why stateless matters:**

| Benefit | Explanation |
|---------|-------------|
| **Horizontal scaling** | Add more servers; LB distributes freely |
| **Easy failover** | Server dies → LB routes to others; no lost in-memory sessions |
| **Simple deploys** | Kill old servers, start new ones; no session migration |
| **Predictable load** | Any server can serve any user |

Session data lives in **Redis** or the **database**, not in server RAM alone.

---

## What is an API?

An **API (Application Programming Interface)** is the **contract** between client and server:

- Which **URLs** exist
- What **data** you send (request body, headers, query params)
- What **data** you get back (response body, status codes)
- What **errors** look like

### Post office analogy

The API is like the **official form** at the post office:

- Form number 1040 = "Register a package" → `POST /api/v1/parcels`
- Required fields: sender, recipient, weight → request JSON schema
- You get back a tracking number → response `{ "trackingId": "..." }`
- If weight exceeds limit → error 400 with message "Max weight 30kg"

If the post office changes the form without telling anyone (breaking change), customers' automated systems break. Same with APIs — hence **versioning**.

### Properties of good APIs

| Property | What it means | Example |
|----------|---------------|---------|
| **Predictable naming** | Consistent URL patterns | `/users/:id/posts`, not `/getUserPosts?id=` |
| **Correct HTTP verbs** | GET reads, POST creates, etc. | Never `GET /deleteUser/42` |
| **Explicit errors** | Machine-readable error codes + human message | `{ "error": "INVALID_URL", "message": "..." }` |
| **Versioned** | Breaking changes don't break old clients | `/api/v1/...` vs `/api/v2/...` |
| **Documented** | Request/response examples exist | OpenAPI/Swagger spec |
| **Paginated lists** | Never return unbounded arrays | `?cursor=abc&limit=20` |

---

## REST-style APIs (deep dive for beginners)

**REST (Representational State Transfer)** is the most common API style for web and mobile apps. It models the world as **resources** (nouns) manipulated by **HTTP verbs** (actions).

### Resources + verbs

| HTTP Verb | Meaning | Safe? | Idempotent? | Example |
|-----------|---------|-------|-------------|---------|
| **GET** | Read a resource | Yes | Yes | `GET /users/42` |
| **POST** | Create a new resource | No | No | `POST /urls` |
| **PUT** | Replace entire resource | No | Yes | `PUT /users/42` |
| **PATCH** | Partial update | No | No* | `PATCH /users/42` |
| **DELETE** | Remove resource | No | Yes | `DELETE /posts/9` |

- **Safe** = doesn't change server state (GET should never delete data)
- **Idempotent** = calling twice has the same effect as calling once (important for retries — covered later)

*PATCH idempotency depends on implementation; design it to be idempotent when possible.

### URL design principles

| Do ✅ | Don't ❌ | Why |
|-------|---------|-----|
| `/users/42/posts` | `/getUserPosts?userId=42` | Nouns in URLs; verbs are HTTP methods |
| `/api/v1/urls` | `/api/createUrl` | Resource-oriented |
| Plural nouns: `/notes` | `/note` | Convention; pick one and stay consistent |
| `POST /users` (create) | `POST /createUser` | POST to collection creates a member |

### Worked example: URL shortener API

**Create a short URL:**

```http
POST /api/v1/urls
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "longUrl": "https://example.com/very/long/path?page=1",
  "customAlias": "my-link",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Success response:**

```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/v1/urls/aZ9kQ2

{
  "shortCode": "aZ9kQ2",
  "shortUrl": "https://short.ly/aZ9kQ2",
  "longUrl": "https://example.com/very/long/path?page=1",
  "createdAt": "2026-08-06T14:30:00Z"
}
```

**Redirect (separate endpoint — often no auth):**

```http
GET /aZ9kQ2

HTTP/1.1 302 Found
Location: https://example.com/very/long/path?page=1
```

**Error response:**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": "ALIAS_TAKEN",
  "message": "Custom alias 'my-link' is already in use"
}
```

### Common HTTP status codes

| Code | Meaning | When to use |
|------|---------|-------------|
| **200 OK** | Success (read/update) | `GET /users/42` found |
| **201 Created** | Resource created | `POST /urls` success |
| **204 No Content** | Success, empty body | `DELETE /posts/9` |
| **400 Bad Request** | Client sent invalid data | Missing required field |
| **401 Unauthorized** | Not authenticated | Missing or expired token |
| **403 Forbidden** | Authenticated but not allowed | User trying to delete someone else's post |
| **404 Not Found** | Resource doesn't exist | `GET /users/99999` |
| **409 Conflict** | State conflict | Duplicate alias |
| **429 Too Many Requests** | Rate limited | Too many requests per minute |
| **500 Internal Server Error** | Server bug | Unhandled exception |
| **503 Service Unavailable** | Temporarily down | Maintenance or overload |

In system design interviews, mention status codes for **main error paths** — it shows you think about the full contract.

---

## Other API styles (awareness)

You won't design these in every interview, but you should recognize when they appear:

| Style | Transport | Best for | Trade-off |
|-------|-----------|----------|-----------|
| **REST + JSON** | HTTP | Most web/mobile apps, public APIs | Simple; sometimes over-fetching |
| **GraphQL** | HTTP (usually POST) | Mobile apps needing flexible queries | Client specifies exact fields; server complexity |
| **gRPC** | HTTP/2, binary (Protobuf) | Internal microservice communication | Fast, typed; not browser-friendly natively |
| **WebSockets** | Persistent TCP connection | Real-time chat, live sports scores, gaming | Bidirectional; connection management at scale |
| **Webhooks** | HTTP POST to *your* URL | Event notifications (payment succeeded, CI finished) | Server pushes to you; you must handle retries |

### When to mention each in an interview

```mermaid
flowchart TD
  Q["What kind of API?"]
  Q -->|"CRUD, web/mobile"| REST["REST + JSON"]
  Q -->|"Many different screens,\n varied data needs"| GQL["GraphQL"]
  Q -->|"Service-to-service,\n low latency"| GRPC["gRPC"]
  Q -->|"Real-time push\nto client"| WS["WebSockets"]
  Q -->|"Notify external\nsystems of events"| WH["Webhooks"]
```

| Scenario | Recommended style |
|----------|-------------------|
| URL shortener, notes app, basic CRUD | **REST** |
| Instagram mobile app (feed + profile + comments in one screen) | **GraphQL** often wins |
| Payment service ↔ fraud detection service | **gRPC** |
| Chat app message delivery | **WebSockets** (or long polling as simpler fallback) |
| Stripe telling your server "payment completed" | **Webhook** |

For beginners and most case studies in this course, **HTTP JSON REST APIs** are the default. Mention alternatives when the use case clearly calls for them.

---

## Designing APIs for system design interviews

In the **LLD section** of an interview, write:

1. **Endpoint list** — method + path + one-line description
2. **Request / response JSON** — for 2–3 key endpoints
3. **Status codes** — for main success and error cases
4. **Auth method** — who can call what

### Example LLD: Notes app API

```text
POST   /api/v1/notes              Create a note
GET    /api/v1/notes/:id          Get a single note
GET    /api/v1/notes?limit=20     List my notes (paginated)
PATCH  /api/v1/notes/:id          Update note title/body
DELETE /api/v1/notes/:id          Delete a note

Auth: JWT Bearer token on all endpoints except none (all require login)
```

**Create note:**

```json
POST /api/v1/notes
Request:
{
  "title": "Grocery list",
  "body": "Milk, eggs, bread"
}

Response 201:
{
  "id": "note_8x7kQ",
  "title": "Grocery list",
  "body": "Milk, eggs, bread",
  "createdAt": "2026-08-06T10:00:00Z",
  "updatedAt": "2026-08-06T10:00:00Z"
}

Errors:
  400 — missing title or body
  401 — not authenticated
  413 — body exceeds 100 KB limit
```

---

## Authentication (auth)

**Authentication** = verifying *who* is calling.  
**Authorization** = verifying *what they're allowed to do*.

### Highway toll analogy

- **Authentication:** Showing your transponder — the system knows *which car* you are
- **Authorization:** Some lanes are HOV-only — being identified isn't enough; you need 2+ passengers

### Common auth patterns

| Pattern | How it works | Best for |
|---------|--------------|----------|
| **None (public)** | No auth header required | Public URL redirects, read-only public data |
| **API key** | `X-API-Key: abc123` in header | Server-to-server, developer APIs |
| **Session cookie** | Server sets cookie after login; browser sends automatically | Traditional web apps |
| **JWT (Bearer token)** | `Authorization: Bearer eyJ...` | Mobile apps, SPAs, microservices |
| **OAuth 2.0** | Delegate auth to Google/GitHub/etc. | "Sign in with Google" |
| **mTLS** | Client and server both present certificates | High-security service-to-service |

### Quick auth map for system design

| Endpoint type | Typical auth |
|---------------|--------------|
| Public read (URL redirect) | None |
| User actions (create post, send message) | JWT or session cookie |
| Admin actions (ban user, view all data) | JWT + role check (`admin`) |
| Service-to-service (payment → ledger) | mTLS or signed internal token |
| Third-party developer API | API key + rate limiting |

In interviews, one sentence is enough: *"User-facing endpoints require JWT; the redirect endpoint is public; internal services use mTLS."*

---

## Idempotency (critical for reliability)

**Idempotency** means: calling an operation **multiple times** has the **same effect** as calling it **once**.

### Why it matters: the double-charge problem

```mermaid
sequenceDiagram
  participant Client
  participant Server
  participant Payment

  Client->>Server: POST /payments ($50)
  Server->>Payment: Charge $50
  Payment-->>Server: Success
  Note over Client,Server: Network timeout — client never got response!
  Client->>Server: POST /payments ($50) [RETRY]
  Server->>Payment: Charge $50 AGAIN??
```

Without idempotency, network retries **double-charge** the customer.

### Idempotency key pattern

```http
POST /api/v1/payments
Idempotency-Key: unique-key-from-client-uuid
Content-Type: application/json

{ "amount": 5000, "currency": "usd" }
```

**Server logic:**

1. Check if `Idempotency-Key` was seen before
2. If yes → return the **stored result** (don't re-process)
3. If no → process payment, store result keyed by idempotency key

| HTTP Method | Naturally idempotent? |
|-------------|----------------------|
| GET | Yes |
| PUT | Yes (replace same resource) |
| DELETE | Yes (delete twice = still deleted) |
| POST | **No** — always use idempotency keys for critical POSTs |
| PATCH | Often no — design carefully |

**Rule of thumb:** Any POST that moves money, sends email, or creates an irreversible side effect needs an **idempotency key**.

---

## Pagination (never return unbounded lists)

Returning `SELECT * FROM posts` for a user with 100,000 posts will:

- Slow down the database
- Blow up response size
- Timeout the client

### Offset pagination (simple but flawed at scale)

```http
GET /api/v1/feed?offset=40&limit=20
```

Returns items 41–60.

| Pros | Cons |
|------|------|
| Easy to implement | Slow for large offsets (`OFFSET 100000`) |
| Supports "jump to page 5" | Inconsistent if new items inserted while paginating |

### Cursor pagination (preferred at scale)

```http
GET /api/v1/feed?cursor=eyJpZCI6MTIzfQ&limit=20
```

Cursor = opaque token encoding "last seen item" (often base64 of `{ "createdAt": "...", "id": 123 }`).

**Response includes next cursor:**

```json
{
  "items": [ ... ],
  "nextCursor": "eyJpZCI6MTQzfQ",
  "hasMore": true
}
```

| Pros | Cons |
|------|------|
| Consistent performance at any depth | No arbitrary page jumping |
| Stable if new items added | Slightly more complex |

**Interview default:** Recommend **cursor-based** for feeds, timelines, and message history.

---

## API versioning

APIs change. Versioning prevents breaking existing clients.

### Strategies

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| **URL path** | `/api/v1/users`, `/api/v2/users` | Obvious, easy to route | URL clutter |
| **Header** | `Accept: application/vnd.myapp.v2+json` | Clean URLs | Harder to test in browser |
| **Query param** | `/api/users?version=2` | Simple | Easy to forget |

**Recommendation for beginners:** **URL path versioning** (`/api/v1/...`) — clearest in diagrams and interviews.

### What counts as a breaking change?

| Breaking (needs new version) | Non-breaking (same version OK) |
|------------------------------|-------------------------------|
| Removing a field | Adding a new optional field |
| Renaming a field | Adding a new endpoint |
| Changing field type | Adding a new optional query param |
| Changing error codes | Adding a new error code |

---

## Worked example: Chat app API (interview LLD)

```text
WebSocket: wss://api.chatapp.com/v1/ws
  — Persistent connection for real-time message delivery
  — Client sends/receives JSON frames

REST endpoints:

POST   /api/v1/messages           Send message (also via WebSocket)
GET    /api/v1/messages?cursor=   Message history (paginated)
GET    /api/v1/users/:id/presence Online/offline status
POST   /api/v1/auth/login         Login, receive JWT
```

**Send message (REST fallback):**

```json
POST /api/v1/messages
Authorization: Bearer eyJ...

Request:
{
  "recipientId": "user_456",
  "body": "Hey, are you free tonight?"
}

Response 201:
{
  "messageId": "msg_abc123",
  "senderId": "user_789",
  "recipientId": "user_456",
  "body": "Hey, are you free tonight?",
  "sentAt": "2026-08-06T18:00:00Z",
  "status": "delivered"
}
```

**WebSocket frame (real-time):**

```json
{
  "type": "message.new",
  "payload": {
    "messageId": "msg_abc123",
    "senderId": "user_789",
    "body": "Hey, are you free tonight?",
    "sentAt": "2026-08-06T18:00:00Z"
  }
}
```

Note how REST handles CRUD/history while WebSockets handle real-time push — a common hybrid pattern.

---

## Common API design mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| **Verbs in URLs** | `POST /createUser` | `POST /users` |
| **GET that mutates state** | `GET /deletePost/9` | `DELETE /posts/9` |
| **No pagination** | Returning 50,000 items | Cursor pagination with `limit` |
| **No idempotency on POST payments** | Double-charge on retry | `Idempotency-Key` header |
| **Generic 500 for everything** | Clients can't handle errors | Specific 4xx codes with error bodies |
| **No versioning plan** | Breaking mobile apps on deploy | `/api/v1/` from day one |
| **Leaking internal IDs** | Sequential IDs enable scraping | Use UUIDs or public IDs |
| **No rate limiting** | Abuse, DDoS, runaway costs | 429 + rate limit headers |
| **Returning stack traces** | Security leak | Generic 500 message; log details server-side |

---

## Check your understanding

### Question 1
Why prefer stateless app servers? What do you do with session data instead?

### Question 2
What HTTP verb and URL pattern should you use to fetch a single user with id 42?

### Question 3
Why is idempotency critical for payment APIs? Describe the idempotency key pattern.

### Question 4
What's the difference between authentication and authorization? Give an example of each.

### Question 5
Offset pagination vs cursor pagination — when prefer cursors?

### Question 6
You're designing a chat app. Would you use REST, WebSockets, or both? Why?

### Question 7
A client receives `403 Forbidden` on `DELETE /api/v1/posts/9`. What likely happened?

### Question 8
Name two breaking API changes that would require a new version.

<details>
<summary>Detailed answers</summary>

**1. Stateless app servers**

Stateless servers let the load balancer send **any request to any server**. Benefits: easy horizontal scaling, painless failover, simple deploys.

Session data (login state, shopping cart) goes in a **shared store** — Redis or the database — keyed by session ID or JWT. The server reads it per request but doesn't *own* it in local RAM.

**2. Fetch user 42**

```http
GET /api/v1/users/42
```

GET because it's a read. Noun (`users`) in the URL. ID in the path. No verb in the URL.

**3. Idempotency for payments**

Network failures cause clients to **retry** requests. Without idempotency, `POST /payments` run twice charges the customer twice.

**Idempotency key pattern:** Client sends a unique `Idempotency-Key` header (UUID). Server checks if it's seen this key: if yes, return the cached result; if no, process and store the result. Retries become safe.

**4. Auth vs authorization**

- **Authentication:** Proving identity. Example: logging in with email/password and receiving a JWT.
- **Authorization:** Proving permission. Example: user is logged in (authenticated) but tries to delete another user's post → 403 Forbidden (not authorized).

**5. Cursor vs offset pagination**

Prefer **cursor pagination** for:
- Large datasets (feeds, timelines, message history)
- Real-time data where items are inserted during pagination
- When consistent performance matters (offset 100,000 is slow in SQL)

Offset is fine for small admin tables or when users need "jump to page 5."

**6. Chat app — REST + WebSockets**

**Both:**
- **WebSockets** for real-time message delivery (push to recipient instantly)
- **REST** for history (`GET /messages?cursor=`), login, profile, and as a fallback send mechanism

Pure REST requires polling ("any new messages? any new messages?") which is wasteful at scale.

**7. 403 on DELETE /posts/9**

The user is **authenticated** (otherwise 401) but **not allowed** to delete this post. Likely: they're trying to delete someone else's post, or their account lacks permission (e.g., not a moderator).

**8. Breaking changes requiring new version**

Any two of:
- Removing a response field clients depend on
- Renaming `userId` to `user_id`
- Changing `createdAt` from string to integer timestamp
- Changing 200 success to 204 with empty body for an endpoint that previously returned data
- Removing an endpoint entirely

Non-breaking: adding a new optional field, adding a new endpoint.

</details>

---

**Next:** [Load Balancing](05-load-balancing.md) — learn how to spread traffic across many servers so one machine doesn't become the bottleneck.
