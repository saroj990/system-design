# 06. Databases

## Learning goals

- Choose between SQL and NoSQL at a beginner level  
- Understand indexes and why they matter  
- Model data for common app patterns  

## Database = durable source of truth

Caches can vanish. Queues move work. **Databases persist** the data you cannot lose.

## SQL (relational)

Examples: PostgreSQL, MySQL.

- Tables with fixed schema  
- Powerful queries (`JOIN`, transactions)  
- Strong consistency tools (ACID transactions)  

**Great for:** users, orders, payments, relationships with clear structure.

```text
users(id, email, created_at)
orders(id, user_id, total, status)
```

## NoSQL (umbrella term)

| Family | Examples | Shape | Good for |
|--------|----------|-------|----------|
| Document | MongoDB | JSON-like docs | Flexible objects |
| Key-value | Redis, DynamoDB | key → value | Sessions, simple lookups |
| Wide-column | Cassandra | rows with flexible columns | Huge write throughput |
| Graph | Neo4j | nodes/edges | Social graphs |

**Great for:** massive scale with simple access patterns, flexible schemas, specialized workloads.

## The real rule (not dogma)

> Choose the database that fits your **access patterns** and **consistency needs**.

If you always fetch `user_id → profile`, a key-value or document store is natural.  
If you need multi-row money transfers, SQL transactions shine.

## Indexes

Without an index, finding a row can mean scanning the whole table (slow).

An **index** is like a book index: quick lookup on a column (e.g., `email`).

Trade-off: faster reads, slower writes, extra storage.

## Primary keys & uniqueness

Every row needs a unique identity:

- Auto-increment integers (simple, local DB)  
- UUIDs (easy to generate anywhere)  
- Snowflake-style IDs (time-ordered, distributed) — see case study 05  

## Transactions (ACID intuition)

For beginners:

- **Atomic:** all succeed or all fail  
- **Consistent:** rules/constraints hold  
- **Isolated:** concurrent transactions don’t corrupt each other carelessly  
- **Durable:** committed data survives crash  

Example: transfer $10 from A to B must debit and credit together.

## Normalization vs denormalization

- **Normalize:** less duplication, more joins  
- **Denormalize:** duplicate data for faster reads (feeds often do this)  

Feeds, timelines, and leaderboards often denormalize for speed.

## Example schemas

### URL shortener

```text
urls(
  short_code PK,
  long_url,
  user_id NULL,
  created_at,
  expires_at NULL,
  click_count
)
```

### Chat message

```text
messages(
  message_id PK,
  conversation_id,
  sender_id,
  body,
  created_at
)
-- index (conversation_id, created_at)
```

## Polyglot persistence

Large companies use **multiple databases**:

- Postgres for accounts  
- Redis for cache/sessions  
- S3 for videos  
- Elasticsearch for search  
- Cassandra for analytics events  

That’s normal. Start with one primary DB for MVP.

## Check your understanding

1. When would you prefer SQL over a document DB?  
2. What does an index improve, and what does it cost?  
3. Why denormalize a news feed?  

<details>
<summary>Answers</summary>

1. Complex relationships, joins, strong multi-row transactions (e.g., payments).  
2. Improves read/lookup speed; costs write overhead and disk.  
3. Precompute/store feed rows so reads are simple and fast at scale.

</details>

---

**Next:** [Replication & Sharding](07-replication-sharding.md)
