# Case Study 21 — Music Streaming

Design a service like **Spotify**: browse a catalog, stream audio, and manage playlists.

## 1. Problem

Users discover songs, play them with minimal buffering, and build personal playlists. The platform must respect licensing (region, expiry) and serve audio efficiently at global scale.

## 2. Requirements

### Functional (MVP)

- Browse/search catalog (artists, albums, tracks)  
- Stream audio (play, pause, seek within track)  
- User accounts and authentication  
- Create/edit/delete playlists; add/remove tracks  
- Track play history (recently played)  
- Store licensing metadata per track (regions, rights holder, expiry)  

### Out of scope (initially)

- Offline downloads, lyrics sync, social feed, podcast video, live DJ rooms  
- Full recommendation ML pipeline (use simple “related tracks” later)  
- Artist upload portal and royalty payout accounting  

### Non-functional

- Playback starts quickly (< 2 s on good network)  
- High read:write ratio (streams >> playlist edits)  
- CDN-friendly audio delivery; origin shielding  
- Licensing checks before every stream URL is issued  
- High availability for playback path  

## 3. Back-of-the-envelope

Assumptions:

- 50M monthly active users (MAU)  
- Average 30 streams/user/day  
- Average track size ≈ 5 MB (128 kbps, ~5 min)  
- Catalog ≈ 80M tracks metadata; audio in object storage  

```text
Stream events/day ≈ 50M × 30 = 1.5B
Stream QPS (avg) ≈ 1.5B / 86400 ≈ 17,000/s
Peak stream QPS ≈ 3× avg ≈ 50,000/s

Catalog metadata ≈ 80M × ~2 KB ≈ 160 GB (+ indexes)
Audio storage ≈ 80M × 5 MB ≈ 400 TB (cold object storage)

Playlist writes: assume 10% users edit 2 playlists/day
Write QPS ≈ (5M × 2) / 86400 ≈ 115/s (low vs reads)
```

Insight: **separate metadata path from audio bytes** — metadata in DB/cache; audio from CDN/object storage.

## 4. High-Level Design (HLD)

```mermaid
flowchart LR
  U[Users / Apps] --> LB
  LB --> API[Streaming API]
  API --> Auth[Auth Service]
  API --> MetaDB[(Postgres)]
  API --> Cache[(Redis)]
  API --> Search[Search Index]
  API --> License[Licensing Service]
  License --> MetaDB
  API --> CDN[Audio CDN]
  CDN --> S3[(Object Storage)]
  API --> Q[Event Queue]
  Q --> W[Analytics Workers]
  W --> AnalyticsDB[(Analytics DB)]
```

### Components

| Component | Role |
|-----------|------|
| Streaming API | Catalog, playlists, playback session orchestration |
| Auth Service | JWT/session; user identity |
| Postgres | Users, tracks, albums, playlists, licensing rows |
| Redis | Hot catalog slices, session tokens, rate limits |
| Search Index | Full-text search on track/artist/album |
| Licensing Service | Region/expiry checks before signed URL |
| Object Storage (S3) | Master audio files (MP3/AAC) |
| Audio CDN | Edge cache for segments/bytes |
| Queue + workers | Play events, royalty reporting (async) |

### Flows

**Search & browse**

1. Client queries `/search?q=...`  
2. API hits search index (Elasticsearch/OpenSearch)  
3. Returns track IDs + metadata from cache/DB  
4. Client renders catalog UI  

**Start playback**

1. Client requests `POST /tracks/:id/play` with user region  
2. API loads track + licensing metadata  
3. Licensing service validates: region allowed, not expired, not blocked  
4. API mints **short-lived signed CDN URL** (or HLS manifest URL)  
5. Client streams directly from CDN; API enqueues play event async  

**Create playlist**

1. Validate user owns playlist or creates new  
2. Insert/update `playlists` + `playlist_tracks` in transaction  
3. Invalidate user’s playlist cache  
4. Return updated playlist  

### Trade-offs

- **Progressive download vs HLS/DASH** — HLS enables adaptive bitrate and better seek; more encoding pipeline complexity  
- **Signed URLs vs proxy streaming** — signed URLs offload bandwidth to CDN; proxy gives tighter control but costly  
- **Central licensing table vs per-track flags** — table scales with rules; simple flags OK for MVP  
- **Strong consistency on playlists vs eventual** — transactional playlist edits prevent duplicate/conflicting order  

## 5. Low-Level Design (LLD)

### APIs

```text
GET /api/v1/search?q=beatles&limit=20
→ { "tracks": [...], "artists": [...], "albums": [...] }

GET /api/v1/tracks/:trackId
→ { "id", "title", "artist", "album", "durationMs", "previewUrl" }

POST /api/v1/tracks/:trackId/play
Body: { "deviceId": "...", "quality": "high" }
→ {
    "streamUrl": "https://cdn.example.com/...?sig=...&exp=...",
    "expiresAt": "2026-07-20T08:05:00Z",
    "format": "aac"
  }
→ 403 if not licensed in user region

GET /api/v1/playlists/:id
→ { "id", "name", "tracks": [...] }

POST /api/v1/playlists
Body: { "name": "Road Trip" }
→ { "id": "pl_abc", "name": "Road Trip" }

PUT /api/v1/playlists/:id/tracks
Body: { "trackIds": ["t1", "t2", "t3"], "version": 3 }
→ 409 if version conflict (optimistic locking)

GET /api/v1/me/recent
→ { "tracks": [...] }
```

### Schema

```text
users (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  region_code   CHAR(2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
)

tracks (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(512) NOT NULL,
  album_id      BIGINT REFERENCES albums(id),
  duration_ms   INT NOT NULL,
  storage_key   VARCHAR(512) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
)

albums (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(512) NOT NULL,
  artist_id     BIGINT REFERENCES artists(id)
)

artists (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(512) NOT NULL
)

track_licenses (
  track_id      BIGINT REFERENCES tracks(id),
  region_code   CHAR(2),          -- 'US', 'IN', or '*' for global
  rights_holder VARCHAR(255),
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_until   TIMESTAMPTZ NULL,
  PRIMARY KEY (track_id, region_code)
)

playlists (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  version       INT DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL
)

playlist_tracks (
  playlist_id   BIGINT REFERENCES playlists(id),
  track_id      BIGINT REFERENCES tracks(id),
  position      INT NOT NULL,
  PRIMARY KEY (playlist_id, track_id),
  UNIQUE (playlist_id, position)
)

play_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT,
  track_id      BIGINT,
  played_at     TIMESTAMPTZ NOT NULL,
  device_id     VARCHAR(64),
  region_code   CHAR(2)
)
```

### Modules

```text
TrackController
PlaylistController
PlaybackService
LicensingService
CatalogRepository
PlaylistRepository
CdnUrlSigner
PlayEventProducer
SearchClient
```

### Algorithm — issue stream URL (with licensing)

```text
function startPlayback(userId, trackId, region):
  track = catalogRepo.findTrack(trackId)
  if track is null: return 404

  license = licensingService.resolve(trackId, region)
  if license is null or license.expired or license.blocked:
    return 403("not available in your region")

  sessionId = uuid()
  exp = now() + 5 minutes
  streamUrl = cdnSigner.sign(
    objectKey = track.storageKey,
    exp = exp,
    claims = { userId, trackId, sessionId }
  )

  playEventProducer.enqueue({ userId, trackId, region, sessionId })
  return { streamUrl, expiresAt: exp }
```

### Algorithm — update playlist (optimistic concurrency)

```text
function updatePlaylistTracks(userId, playlistId, trackIds, clientVersion):
  playlist = repo.findPlaylist(playlistId)
  if playlist.userId != userId: return 403
  if playlist.version != clientVersion: return 409

  begin transaction:
    delete from playlist_tracks where playlist_id = playlistId
    for i, trackId in enumerate(trackIds):
      insert playlist_tracks(playlistId, trackId, position=i)
    update playlists set version = version + 1 where id = playlistId
  commit

  cache.invalidate("playlist:" + playlistId)
  return repo.findPlaylist(playlistId)
```

### Concurrency & correctness

- Licensing checked at **play time**, not only catalog browse — rights can change  
- Signed URLs expire quickly; re-request on seek if needed  
- Playlist `version` prevents lost updates from multiple devices  
- Play events are append-only; analytics aggregates eventually  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single Postgres + Redis; one CDN bucket; simple search |
| Hot tracks | CDN cache hit ratio > 95%; pre-warm popular releases |
| Global | Multi-region CDN; geo-routing; replicate read-only catalog |
| Huge catalog | Shard metadata by `track_id`; dedicated search cluster |
| Personalization | Offline feature store + recommendation service (async) |

## 7. Recap

- **Metadata in DB/cache; bytes on CDN** — never stream audio through app servers at scale  
- **Licensing gate on every play URL** — region and expiry are first-class  
- **Playlists are transactional writes** — streams are read-heavy and cache-friendly  
- **Analytics async** — don’t block playback for royalty/event logging  

**Practice:** redraw HLD from memory, then write `startPlayback` + playlist update pseudocode without looking.
