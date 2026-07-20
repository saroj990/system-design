# Case Study 28 — Nearby Friends

Design a feature like **Facebook Nearby Friends** or **Snap Map**: show friends who are close to you on a map, updated every few minutes while location sharing is enabled.

## 1. Problem

Users opt in to share their **approximate location** with friends. The app must:

- Accept periodic location updates from millions of mobile clients  
- Answer "who among my friends is near me?" quickly  
- Respect privacy (fuzzing, opt-out, expiration)  

Naive approach — compare every friend pair — does not scale.

## 2. Requirements

### Functional (MVP)

- User enables/disables location sharing  
- Client sends location updates every N minutes (e.g., 5 min) or on significant movement  
- Show nearby friends on a map (within radius R, e.g., 5 km)  
- Friend list only — no strangers  
- Location staleness indicator ("updated 12 min ago")  

### Out of scope (initially)

- Live continuous tracking (second-by-second)  
- Place check-ins and venue recommendations  
- Background geofencing alerts  
- Public location broadcast  

### Non-functional

- Write-heavy (constant location pings)  
- Read latency < 300 ms for nearby query  
- Privacy: coarse location by default; precise only with consent  
- Battery-friendly — batch updates, adaptive frequency  
- Scale to 100M users with ~10% sharing at once  

## 3. Back-of-the-envelope

Assumptions:

- 100M DAU, 10% share location = 10M active sharers  
- Update every 5 minutes  
- Average 200 friends per user (but queries only check mutual sharers)  

```text
Location write QPS ≈ 10M / 300s ≈ 33,000/s avg, peak ~100,000/s

Storage (current location per user):
  10M × (~16B geohash + lat/lng + timestamp + userId) ≈ 10M × 64B ≈ 640 MB

Nearby read QPS: if 10M users open map 3×/day ≈ 350/s (low vs writes)
  Peak map opens: ~5,000/s

Friend graph lookups dominate read path — not full table scan
```

Insight: **index locations by geohash** and only search neighboring cells; filter by friend list after candidate retrieval.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  M[Mobile App] --> LB[Load Balancer]
  LB --> LS[Location Service]
  LS --> LC[(Redis: user locations)]
  LS --> Q[Geo Index]
  Q --> GH[(Redis GEO / Geohash Index)]

  M --> FS[Friends Service]
  FS --> FG[(Friend Graph Store)]

  U[User opens map] --> NS[Nearby Service]
  NS --> FS
  NS --> GH
  NS --> LC
```

```mermaid
flowchart TB
  subgraph geohash [Geohash Grid Concept]
    C1[cell: 9q8yy]
    C2[cell: 9q8yz]
    C3[cell: 9q8yp]
  end
  UserA[User A in 9q8yy] --> C1
  UserB[User B in 9q8yz] --> C2
  Query[Search 9q8yy + 8 neighbors] --> C1
  Query --> C2
```

### Components

| Component | Role |
|-----------|------|
| Location Service | Ingest `POST /location` updates |
| Redis GEO / Geohash index | Spatial index for range queries |
| Friend Graph Store | Bidirectional friend lists (cached) |
| Nearby Service | Orchestrates geo query ∩ friends |
| Location Cache | Latest coords per user with TTL |

### Flows

**Update location**

1. Client sends `{ lat, lng, accuracy, timestamp }` every 5 min  
2. Server validates session + sharing enabled  
3. Optionally fuzz location (grid snap to ~500 m)  
4. Write to Redis: `SET user:{id}:loc` + `GEOADD geo_index {lng lat} userId`  
5. Set TTL — auto-expire if client stops sending  

**Find nearby friends**

1. Client requests nearby friends  
2. Load user's friend IDs where `sharing_enabled = true` (cached set)  
3. Query geo index: all users in radius R around user  
4. **Intersect** geo candidates with friend set  
5. Return friend profiles + distance + last updated  

### Trade-offs

- **Geohash vs Quadtree vs Redis GEO** — Redis GEO uses geohash internally; good MVP. Quadtree better for skewed density  
- **Push vs pull updates** — Pull on map open is simpler; push (WebSocket) for live map optional  
- **Precise vs fuzzy** — Fuzzy protects privacy and reduces update churn  
- **Update interval vs accuracy** — 5 min saves battery; show staleness in UI  

## 5. Low-Level Design (LLD)

### APIs

```text
PUT /api/v1/location/sharing
Body: { "enabled": true, "visibility": "friends" }
→ { "enabled": true, "updateIntervalSec": 300 }

POST /api/v1/location
Body: {
  "lat": 37.7749,
  "lng": -122.4194,
  "accuracyMeters": 25,
  "capturedAt": "2026-07-20T12:00:00Z"
}
→ 204 No Content

GET /api/v1/friends/nearby?radiusKm=5&limit=50
→ {
     "center": { "lat": 37.7749, "lng": -122.4194 },
     "radiusKm": 5,
     "friends": [
       {
         "userId": "u_42",
         "displayName": "Bob",
         "lat": 37.78,
         "lng": -122.41,
         "distanceKm": 1.2,
         "updatedAt": "2026-07-20T11:58:00Z",
         "stale": false
       }
     ]
   }

DELETE /api/v1/location
→ 204   (stop sharing, purge location)
```

### Schema

```text
user_location_settings (
  user_id           BIGINT PRIMARY KEY,
  sharing_enabled   BOOLEAN DEFAULT FALSE,
  visibility        VARCHAR(16) DEFAULT 'friends',
  fuzz_level_meters INT DEFAULT 500,
  updated_at        TIMESTAMPTZ NOT NULL
)

-- Optional Postgres backup / history (not hot path)
user_locations (
  user_id     BIGINT PRIMARY KEY,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  geohash     VARCHAR(12) NOT NULL,
  accuracy_m  INT,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL
)
CREATE INDEX idx_locations_geohash ON user_locations (geohash);

friendships (
  user_id     BIGINT NOT NULL,
  friend_id   BIGINT NOT NULL,
  status      VARCHAR(16) DEFAULT 'accepted',
  PRIMARY KEY (user_id, friend_id)
)
```

Redis structures:

```text
GEOADD locations:geo <lng> <lat> <userId>
HSET user:loc:<userId> lat lng geohash updatedAt sharingEnabled
EXPIRE user:loc:<userId> 900          -- 15 min without update → gone

SET friends:sharing:<userId> → {friendId1, friendId2, ...}  (only friends who share back)
```

### Modules

```text
LocationController
LocationIngestService
GeohashEncoder
LocationFuzzer
NearbyFriendsService
FriendGraphClient
GeoIndexRepository
SharingSettingsService
```

### Algorithm — geohash indexing

Geohash encodes `(lat, lng)` into a string where **nearby places share a prefix**.

```text
function encodeGeohash(lat, lng, precision=6):
  // precision 6 ≈ ±0.61 km × ±1.22 km cell
  return geohashLibrary.encode(lat, lng, precision)

function getNeighborCells(geohash):
  return [geohash] + geohashLibrary.neighbors(geohash)  // 8 adjacent cells
```

For radius R, choose precision so cell size ≈ R/2, then search center + neighbors (may need 2 rings for large R).

### Algorithm — nearby friends query

```text
function getNearbyFriends(userId, radiusKm, limit):
  me = locationCache.get(userId)
  if me is null or not me.sharingEnabled:
    return forbidden()

  friends = friendGraph.getSharingFriends(userId)   // pre-filtered set
  if friends.isEmpty(): return []

  // Redis GEO radius query
  candidates = redis.geoRadius(
    key="locations:geo",
    lng=me.lng, lat=me.lat,
    radiusKm=radiusKm,
    withDist=true,
    count=limit * 10                    // over-fetch before friend filter
  )

  results = []
  friendSet = Set(friends)
  for (candidateId, distanceKm) in candidates:
    if candidateId not in friendSet: continue
    if candidateId == userId: continue
    loc = locationCache.get(candidateId)
    if loc is null: continue
    results.append({ userId: candidateId, distanceKm, ...loc })
    if results.size >= limit: break

  sort results by distanceKm
  return results
```

### Algorithm — location fuzzing

```text
function fuzzLocation(lat, lng, fuzzMeters):
  // Snap to grid or add random offset within cell
  cell = metersToDegrees(fuzzMeters)
  latF = round(lat / cell) * cell
  lngF = round(lng / cell) * cell
  return (latF, lngF)
```

### Algorithm — adaptive update interval (client-side)

```text
function shouldSendUpdate(lastSent, currentPos, speed):
  elapsed = now() - lastSent.time
  distance = haversine(lastSent.pos, currentPos)

  if elapsed > 5 minutes: return true
  if distance > 500 meters: return true
  if speed > 30 km/h and elapsed > 2 minutes: return true
  return false
```

### Concurrency & correctness

- Last-write-wins for location (timestamp compare discard stale updates)  
- TTL auto-clears ghost users who uninstalled app  
- `DELETE /location` removes from GEO index immediately  
- Friend intersection enforces **mutual opt-in** — both must share  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Redis GEO + friend list in Redis; single region |
| Write spike | Shard Redis by `hash(userId)`; separate GEO shards by geohash prefix |
| Global | Partition geo index by country/region; cross-region friends = harder (pick home region) |
| Denser cities | Quadtree or S2 cells instead of flat geohash; dynamic precision |
| Live map | WebSocket push on friend cell change; geohash watch subscriptions |
| Privacy tiers | Multiple fuzz levels; hide exact distance ("nearby" bucket) |

## 7. Recap

- Nearby friends = **geo index query ∩ friend set** — never O(friends × users) brute force  
- **Geohash / Redis GEO** makes radius search practical  
- **Periodic updates + TTL** balance battery, freshness, and storage  
- **Fuzz coordinates** for privacy; show staleness in the UI  
- Writes dominate — optimize ingest; reads are relatively cheap  

**Practice:** redraw the HLD from memory, then write pseudocode for `getNearbyFriends` including the friend-set intersection step.
