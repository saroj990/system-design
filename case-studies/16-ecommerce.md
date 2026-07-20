# Case Study 16 — E-commerce Product Catalog + Shopping Cart

Design an online store backend: browse products, search the catalog, and manage a shopping cart before checkout.

## 1. Problem

Users need to discover products (by category, search, filters), view details, and add items to a cart that persists across sessions. The system must stay fast during sales spikes and keep cart state accurate when the same user shops from phone and laptop.

## 2. Requirements

### Functional (MVP)

- Product catalog: list, detail, category browse, text search  
- Inventory display: show “in stock” / “out of stock” (read-only for MVP)  
- Shopping cart: add, update quantity, remove, view cart  
- Cart persistence: logged-in users keep cart across devices; guests use session cookie  
- Merge guest cart into user cart on login  

### Out of scope (initially)

- Payment processing, order fulfillment, shipping labels  
- Product reviews, recommendations, wishlists  
- Seller/admin portal, promotions engine, multi-currency  
- Real-time inventory reservation at checkout (MVP shows stock; checkout is a separate system)  

### Non-functional

- Catalog reads dominate writes (browse >> admin updates)  
- Search latency p99 < 200 ms for common queries  
- Cart writes should feel instant (< 100 ms perceived)  
- High availability for browse + cart during flash sales  
- Eventual consistency acceptable for search index lag (seconds)  

## 3. Back-of-the-envelope estimates

Assumptions:

- 10M monthly active users (MAU)  
- 50M product SKUs in catalog  
- 100:1 read:write on catalog  
- Average 5 cart operations per session, 20M sessions/day  

```text
Catalog read QPS  ≈ 50M reads/day / 86,400 ≈ 580/s avg, peak ~3,000/s
Cart write QPS    ≈ 20M sessions × 5 / 86,400 ≈ 1,160/s avg, peak ~6,000/s
Search QPS        ≈ 30% of catalog reads ≈ 900/s peak

Product storage   ≈ 50M × 2 KB metadata ≈ 100 GB (+ images in object storage)
Cart storage      ≈ 10M active carts × 500 B ≈ 5 GB (Redis)
Search index      ≈ 50M docs × 1 KB ≈ 50 GB (Elasticsearch)
```

Insight: **separate the read-heavy catalog from write-heavy cart**, and cache hot products aggressively.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  U[Users / Web App] --> CDN[CDN — static assets]
  U --> LB[Load Balancer]
  LB --> GW[API Gateway]
  GW --> Cat[Catalog Service]
  GW --> Cart[Cart Service]
  GW --> Search[Search Service]
  Cat --> Cache[(Redis — product cache)]
  Cat --> PDB[(Postgres — products)]
  Cart --> Redis[(Redis — carts)]
  Search --> ES[(Elasticsearch)]
  PDB --> CDC[Change Data Capture]
  CDC --> Q[Message Queue]
  Q --> Idx[Indexing Worker]
  Idx --> ES
  PDB --> Img[Object Storage — images]
```

### Components

| Component | Role |
|-----------|------|
| Catalog Service | CRUD for products (admin), read APIs for storefront |
| Cart Service | Per-user/session cart in Redis |
| Search Service | Full-text + filters via Elasticsearch |
| Postgres | Source of truth for product metadata |
| Redis (products) | Cache hot product pages and category lists |
| Redis (carts) | Fast cart reads/writes with TTL |
| Elasticsearch | Search index, facets (brand, price range) |
| CDC + Queue + Worker | Keep search index in sync with Postgres |
| Object Storage | Product images (CDN-backed URLs in catalog) |
| CDN | Static JS/CSS and image delivery |

### Flows

**Browse category**

1. Client requests `GET /categories/{id}/products?page=1`  
2. Catalog service checks Redis for category page cache  
3. On miss, query Postgres (indexed by `category_id`, `created_at`)  
4. Return JSON + cache with short TTL (30–60 s)  

**Search**

1. Client sends query + filters to Search service  
2. Elasticsearch returns ranked product IDs + facets  
3. Optional: hydrate top N product details from product cache  

**Add to cart**

1. Client sends `POST /cart/items` with `productId`, `quantity`  
2. Cart service validates product exists (cache lookup) and `quantity > 0`  
3. Update Redis hash `cart:{userId}` or `cart:guest:{sessionId}`  
4. Return updated cart snapshot  

**Login merge**

1. On auth success, Cart service loads guest cart + user cart  
2. Merge line items (same `productId` → sum quantities, cap at max per SKU)  
3. Write merged cart to user key, delete guest key  

### Trade-offs

| Choice | Pros | Cons |
|--------|------|------|
| Redis for carts vs Postgres | Sub-ms writes, simple TTL for abandoned carts | Durability needs AOF/replication; harder to query historically |
| Elasticsearch vs Postgres full-text | Fast search, facets, typo tolerance | Extra system; index lag |
| Cache-aside vs read-through | Simple, explicit invalidation | Stampede risk on hot keys — use singleflight / stale-while-revalidate |
| Show stock from catalog vs inventory service | Simpler MVP | Overselling possible until checkout reserves stock |

## 5. Low-Level Design (LLD)

### APIs

```text
GET  /api/v1/products/:id
→ { "id", "name", "description", "priceCents", "currency", "images", "inStock", "categoryId" }

GET  /api/v1/categories/:id/products?page=1&limit=20
→ { "items": [...], "page", "total" }

GET  /api/v1/search?q=running+shoes&brand=nike&minPrice=50&maxPrice=200
→ { "items": [...], "facets": { "brand": [...], "priceRanges": [...] } }

GET  /api/v1/cart
Headers: Authorization OR X-Guest-Session-Id
→ { "items": [{ "productId", "name", "priceCents", "quantity", "lineTotalCents" }], "subtotalCents" }

POST /api/v1/cart/items
Body: { "productId": "p_123", "quantity": 2 }
→ updated cart

PATCH /api/v1/cart/items/:productId
Body: { "quantity": 3 }

DELETE /api/v1/cart/items/:productId
→ updated cart

POST /api/v1/cart/merge
Body: { "guestSessionId": "..." }   // called after login
→ merged cart
```

### Schema (Postgres — catalog)

```text
categories (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  parent_id   BIGINT NULL REFERENCES categories(id)
)

products (
  id            BIGSERIAL PRIMARY KEY,
  sku           VARCHAR(64) UNIQUE NOT NULL,
  name          VARCHAR(512) NOT NULL,
  description   TEXT,
  price_cents   INT NOT NULL CHECK (price_cents >= 0),
  currency      CHAR(3) DEFAULT 'USD',
  category_id   BIGINT NOT NULL REFERENCES categories(id),
  stock_count   INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL
)

CREATE INDEX idx_products_category_active ON products(category_id, is_active, id);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);  -- optional MVP search fallback
```

### Cart data model (Redis)

```text
Key:   cart:user:{userId}     OR   cart:guest:{sessionId}
Type:  Hash
Fields:
  item:{productId} → JSON { "productId", "quantity", "addedAt" }
TTL:   30 days (refresh on each write)

Key:   product:{productId}
Type:  String (JSON snapshot for cache-aside)
TTL:   5–15 minutes
```

### Modules

```text
CatalogController / CatalogService / ProductRepository / ProductCache
SearchController / SearchService / ElasticsearchClient
CartController / CartService / CartRepository(Redis) / CartMerger
IndexingWorker (consumes product change events)
AuthMiddleware (user id vs guest session)
```

### Algorithm — add to cart

```text
function addToCart(cartKey, productId, quantity):
  if quantity <= 0: return error(400)
  if quantity > MAX_QTY_PER_LINE: return error(400)

  product = productCache.get(productId)
  if product is null:
    product = productRepo.findActive(productId)
    if product is null: return error(404)
    productCache.set(productId, product, ttl=10m)

  if not product.inStock and product.stockCount <= 0:
    return error(409, "out of stock")   // MVP: soft check only

  redis.hset(cartKey, "item:" + productId, { productId, quantity, addedAt: now() })
  redis.expire(cartKey, 30 days)
  return buildCartSnapshot(cartKey)
```

### Algorithm — merge carts on login

```text
function mergeCarts(userId, guestSessionId):
  userKey = "cart:user:" + userId
  guestKey = "cart:guest:" + guestSessionId

  userItems = redis.hgetall(userKey)
  guestItems = redis.hgetall(guestKey)

  merged = {}
  for each item in userItems + guestItems:
    pid = item.productId
    merged[pid] = min(merged.get(pid, 0) + item.quantity, MAX_QTY_PER_LINE)

  redis.del(guestKey)
  redis.hmset(userKey, merged)
  return buildCartSnapshot(userKey)
```

### Algorithm — search index update (async)

```text
function onProductChange(event):
  if event.type in (CREATE, UPDATE):
    doc = mapProductToSearchDoc(event.product)
    elasticsearch.index(index="products", id=event.productId, body=doc)
  if event.type == DELETE or not event.product.isActive:
    elasticsearch.delete(index="products", id=event.productId)
```

### Concurrency notes

- Cart updates are **last-write-wins per line item** at the field level in Redis — acceptable for MVP  
- For strict quantity caps during concurrent adds, use `WATCH`/`MULTI` or Lua script:

```text
-- Lua: atomic increment with cap
local qty = redis.call('HGET', key, field)
if tonumber(qty or 0) + delta > MAX then return -1 end
redis.call('HINCRBY', key, field, delta)
return 1
```

- Product cache: invalidate on admin update (`DEL product:{id}`, `DEL category_page:{catId}:*`)  
- Search index lag of 1–5 s is OK; show “results may update shortly” only if needed  

## 6. Scale evolution

| Stage | Traffic | Changes |
|-------|---------|---------|
| MVP | < 100 QPS | Single Postgres, one Redis, optional ES |
| Growth | 1k+ catalog QPS | Redis cluster for carts + product cache; read replicas for Postgres |
| Hot products | Flash sale on one SKU | Local in-process cache + CDN for product detail; singleflight on cache miss |
| Large catalog | 100M+ SKUs | Shard products by `category_id` or hash; ES index sharding |
| Global | Multi-region users | Geo-routed CDN; regional Redis; catalog read replicas per region |
| Checkout integration | Real inventory | Introduce Inventory Service with reservation at checkout (separate case study) |

## 7. Recap

- **Catalog is read-heavy** → cache + search index + CDN for images  
- **Cart is write-heavy and session-scoped** → Redis with TTL and merge-on-login  
- **Search stays eventually consistent** via CDC/async indexing  
- Keep checkout, payments, and inventory reservation out of MVP but design hooks (`productId`, `quantity`) for them  

**Practice:** draw the HLD from memory, then write pseudocode for `addToCart` and `mergeCarts` without looking.
