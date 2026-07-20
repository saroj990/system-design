# Case Study 22 — Hotel / Home Booking

Design a service like **Airbnb**: hosts list properties; guests search, check availability, and book date ranges without double-booking.

## 1. Problem

Travelers need to find lodging for specific check-in/check-out dates. Hosts manage calendars and pricing. The system must prevent two guests from booking the same property for overlapping nights.

## 2. Requirements

### Functional (MVP)

- Host creates listing (title, location, photos, base price)  
- Host blocks/unblocks dates on availability calendar  
- Guest searches listings by location + date range + guests  
- Guest views listing detail and price breakdown  
- Guest creates booking (pending → confirmed)  
- Guest cancels booking (policy-dependent refund rules simplified)  
- Host views upcoming bookings  

### Out of scope (initially)

- Instant Book vs request-to-book workflow, messaging, reviews  
- Dynamic pricing ML, multi-currency FX, tax/VAT engines  
- Payment disputes, host payouts, identity verification  
- Experiences, long-term leases  

### Non-functional

- Search results feel fast (< 500 ms P95 for MVP)  
- **No double-booking** — correctness over eventual consistency on reservations  
- Handle peak booking spikes (holidays)  
- Idempotent booking API (retries safe)  

## 3. Back-of-the-envelope

Assumptions:

- 2M active listings  
- 500K bookings/day  
- Average stay 3 nights  
- Search QPS ≈ 10× booking attempts  

```text
Booking write QPS ≈ 500K / 86400 ≈ 6/s avg, peak ~60/s
Search QPS ≈ 60/s avg, peak ~600/s

Listing metadata ≈ 2M × ~5 KB ≈ 10 GB
Bookings/year ≈ 500K × 365 ≈ 182M rows × ~500 B ≈ 90 GB/year

Calendar slots: 2M listings × 365 days × ~20 B ≈ 15 GB/year (compressed bitmaps help)
```

Insight: **availability + booking must be strongly consistent per listing** — use DB constraints or distributed locks around the reservation window.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  U[Guests / Hosts] --> LB
  LB --> API[Booking API]
  API --> Auth[Auth]
  API --> ListDB[(Postgres)]
  API --> Search[Search + Geo Index]
  API --> Cache[(Redis)]
  API --> Pay[Payments Service]
  Pay --> PayDB[(Payments DB)]
  API --> N[Notification Service]
  Search --> ListDB
```

### Components

| Component | Role |
|-----------|------|
| Booking API | Listings CRUD, search orchestration, bookings |
| Postgres | Listings, availability, bookings (source of truth) |
| Search + Geo Index | Location/date-filtered listing discovery |
| Redis | Search result cache, idempotency keys, short locks |
| Payments Service | Authorize/capture charges (async confirm) |
| Notification Service | Email/push on confirm/cancel |

### Flows

**Search**

1. Guest submits city + check-in + check-out + guest count  
2. API queries geo index for listings in bounding box  
3. Filter candidates where **every night in range is available**  
4. Return ranked results with total price estimate  

**Book (critical path)**

1. Guest selects listing + dates; client sends idempotency key  
2. API validates listing active and guest count within capacity  
3. **Begin transaction**: lock listing row or date range  
4. Re-check availability for each night (no overlapping confirmed booking)  
5. Insert booking row `status=pending`; hold inventory  
6. Call payment authorize; on success → `status=confirmed`  
7. Commit; invalidate search cache for listing; notify host/guest  

**Host blocks dates**

1. Host selects blocked range on calendar  
2. Verify no confirmed booking overlaps  
3. Insert `blocked_nights` or update availability bitmap  
4. Invalidate cached availability for listing  

### Trade-offs

- **Pessimistic lock (row/range) vs optimistic (version + retry)** — pessimistic simpler for double-booking prevention; optimistic better under low contention  
- **Night-granularity vs hourly** — nights match hotels/Airbnb MVP; hourly adds complexity  
- **Sync payment in booking TX vs saga** — sync TX is simpler; saga needed if payment is slow/unreliable  
- **Materialized availability vs compute on read** — materialized speeds search; must update on every booking/block  

## 5. Low-Level Design (LLD)

### APIs

```text
GET /api/v1/search?city=Paris&checkIn=2026-08-01&checkOut=2026-08-04&guests=2
→ { "listings": [{ "id", "title", "nightlyPrice", "totalPrice", "photos" }] }

GET /api/v1/listings/:id?checkIn=...&checkOut=...
→ { "listing", "available": true, "priceBreakdown": {...} }

POST /api/v1/bookings
Headers: Idempotency-Key: <uuid>
Body: {
  "listingId": "lst_123",
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-04",
  "guests": 2,
  "paymentMethodId": "pm_abc"
}
→ 201 { "bookingId", "status": "confirmed", "totalAmount": 45000 }
→ 409 if dates unavailable
→ 200 same body if idempotency key replayed

POST /api/v1/bookings/:id/cancel
→ { "status": "cancelled", "refundAmount": 30000 }

PUT /api/v1/host/listings/:id/availability
Body: { "blockedRanges": [{ "from": "2026-12-24", "to": "2026-12-26" }] }
→ 409 if overlaps confirmed booking
```

### Schema

```text
users (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  role          VARCHAR(16) NOT NULL  -- 'guest' | 'host'
)

listings (
  id            BIGSERIAL PRIMARY KEY,
  host_id       BIGINT REFERENCES users(id),
  title         VARCHAR(255) NOT NULL,
  city          VARCHAR(128) NOT NULL,
  lat           DECIMAL(9,6),
  lng           DECIMAL(9,6),
  max_guests    INT NOT NULL,
  nightly_price_cents INT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  version       INT DEFAULT 1
)

-- one row per listing per night (materialized calendar)
listing_nights (
  listing_id    BIGINT REFERENCES listings(id),
  night_date    DATE NOT NULL,
  status        VARCHAR(16) NOT NULL,  -- 'available' | 'booked' | 'blocked'
  booking_id    BIGINT NULL,
  PRIMARY KEY (listing_id, night_date)
)

bookings (
  id            BIGSERIAL PRIMARY KEY,
  listing_id    BIGINT REFERENCES listings(id),
  guest_id      BIGINT REFERENCES users(id),
  check_in      DATE NOT NULL,
  check_out     DATE NOT NULL,         -- exclusive end (hotel convention)
  guests        INT NOT NULL,
  status        VARCHAR(16) NOT NULL,  -- pending | confirmed | cancelled
  total_cents   INT NOT NULL,
  idempotency_key VARCHAR(64) UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL
)

-- prevents overlapping confirmed bookings (alternative to listing_nights)
CREATE UNIQUE INDEX no_overlap_confirmed ON bookings (listing_id)
  WHERE status = 'confirmed';  -- use EXCLUDE constraint in Postgres for real overlap
```

Postgres overlap prevention (preferred):

```sql
ALTER TABLE bookings ADD CONSTRAINT no_date_overlap
  EXCLUDE USING gist (
    listing_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));
```

### Modules

```text
SearchController
ListingController
BookingController
AvailabilityService
BookingService
ListingRepository
BookingRepository
PaymentClient
IdempotencyStore
SearchIndexClient
```

### Algorithm — search with availability

```text
function search(city, checkIn, checkOut, guests):
  candidateIds = searchIndex.geoQuery(city, filters={ guests, price })
  available = []
  for listingId in candidateIds:
    nights = eachNight(checkIn, checkOut)  -- [in, out) half-open
    if availabilityService.allNightsAvailable(listingId, nights):
      price = pricingService.total(listingId, nights)
      available.append({ listingId, price })
  return sortByRelevance(available)
```

### Algorithm — create booking (double-booking safe)

```text
function createBooking(guestId, listingId, checkIn, checkOut, guests, idempotencyKey):
  existing = idempotencyStore.get(idempotencyKey)
  if existing: return existing.response

  nights = eachNight(checkIn, checkOut)
  listing = repo.findListing(listingId)
  if guests > listing.maxGuests: return 400

  begin transaction:
    -- lock listing to serialize concurrent bookings
    repo.lockListingForUpdate(listingId)

    for night in nights:
      row = repo.getNight(listingId, night)
      if row.status != 'available':
        rollback; return 409("dates unavailable")

    booking = repo.insertBooking({
      listingId, guestId, checkIn, checkOut, guests,
      status: 'pending', idempotencyKey
    })

    for night in nights:
      repo.updateNight(listingId, night, status='booked', bookingId=booking.id)

  payment = paymentClient.authorize(guestId, booking.totalCents)
  if payment.failed:
    rollbackBooking(booking.id)  -- release nights
    return 402

  repo.confirmBooking(booking.id)
  idempotencyStore.save(idempotencyKey, booking)
  notifyHostAndGuest(booking)
  return 201(booking)
```

### Algorithm — cancel booking

```text
function cancelBooking(guestId, bookingId):
  booking = repo.find(bookingId)
  if booking.guestId != guestId: return 403
  if booking.status != 'confirmed': return 400

  refund = policyService.refundAmount(booking)
  begin transaction:
    repo.updateBookingStatus(bookingId, 'cancelled')
    for night in eachNight(booking.checkIn, booking.checkOut):
      repo.updateNight(booking.listingId, night, status='available', bookingId=null)
  paymentClient.refund(booking, refund)
  return { status: 'cancelled', refundAmount: refund }
```

### Concurrency & correctness

- **Half-open date ranges** `[check_in, check_out)` avoid off-by-one on last night  
- DB exclusion constraint or locked `listing_nights` rows prevent overlap  
- Idempotency key dedupes client retries  
- Pending bookings should expire (TTL job) to release held nights if payment stalls  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single Postgres; nightly materialized calendar; basic geo search |
| Search load | Elasticsearch + Redis cache for popular city/date queries |
| Hot listings | Shard bookings by `listing_id`; queue writes per listing |
| Global | Regional read replicas; currency display only (single settlement region) |
| Peak events | Precompute availability bitmaps; rate-limit booking attempts per user |

## 7. Recap

- **Correctness beats speed on booking** — one successful reservation per night per listing  
- **Materialized nights or exclusion constraints** make overlap checks fast and safe  
- **Idempotent booking API** handles network retries without duplicate charges  
- **Search is read-heavy** — cache and index; booking path is transactional  

**Practice:** redraw HLD from memory, then write `createBooking` with lock + night updates without looking.
