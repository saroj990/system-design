# Case Study 18 — File Storage & Sync (Dropbox-like)

Design a cloud service where users upload files, sync them across devices, and share folders — simplified Dropbox/Google Drive backend.

## 1. Problem

Users store files in the cloud, edit on laptop, and expect phone to show the latest version. Large files must upload reliably; only changed parts should transfer when possible. Storage must scale to billions of files without one giant disk.

## 2. Requirements

### Functional (MVP)

- User accounts with personal file namespaces  
- Upload, download, delete files and folders  
- List directory contents  
- Sync: client polls or receives notifications when remote changes occur  
- Basic sharing: read-only link to a file (optional MVP+)  
- Deduplication of identical file content (same bytes → store once)  

### Out of scope (initially)

- Real-time collaborative editing (see Case Study 19)  
- Full desktop sync client (block-level sync algorithm described, not built)  
- End-to-end encryption (mention as product option)  
- Version history beyond “last modified” (can extend later)  

### Non-functional

- Support files up to 10 GB  
- Resume interrupted uploads  
- Durability: no silent data loss (replicated object storage)  
- Metadata ops (list folder) fast; throughput for large files via chunked upload  
- Availability 99.9%+ for download  

## 3. Back-of-the-envelope estimates

Assumptions:

- 50M users, 200 files/user average → 10B file metadata records  
- Average file 500 KB (many small docs + some large) → 5 PB logical user data  
- Deduplication saves ~20% → ~4 PB unique blocks  
- 10M uploads/day, 50M downloads/day  

```text
Upload QPS   ≈ 10M / 86,400 ≈ 115/s avg, peak ~600/s
Download QPS ≈ 50M / 86,400 ≈ 580/s avg, peak ~3,000/s

Metadata     ≈ 10B × 500 B ≈ 5 TB (needs sharding — too big for one DB)
Block storage≈ 4 PB in object store (S3-like)
Sync notify  ≈ 1 change/user/hour × 50M ≈ 14k events/s (peak higher)
```

Insight: **separate metadata (small, relational) from blob storage (large, object store)**, and sync via **content-defined or fixed-size chunks**.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  Client[Desktop / Mobile Client] --> LB[Load Balancer]
  LB --> Meta[Metadata Service]
  LB --> Up[Upload Service]
  LB --> Down[Download Service]
  Meta --> MDB[(Metadata DB — sharded)]
  Meta --> Cache[(Redis — dir listings)]
  Up --> Obj[(Object Storage — S3)]
  Down --> Obj
  Up --> Hash[Block Registry]
  Hash --> MDB
  Client --> Notif[Sync / Notification Service]
  Notif --> WS[WebSocket / Long Poll]
  Notif --> Q[Event Queue]
  Meta --> Q
  Q --> Notif
```

### Components

| Component | Role |
|-----------|------|
| Metadata Service | Files, folders, paths, permissions, block pointers |
| Upload Service | Chunked upload, hash verification, commit |
| Download Service | Signed URLs or streaming from object storage |
| Object Storage | Immutable blobs keyed by content hash |
| Block Registry | Maps `contentHash → storageKey`, ref counts |
| Sync Service | Notifies clients of changes since `cursor` |
| Metadata DB | Sharded SQL or distributed KV for tree metadata |
| Redis | Cache hot directory listings |

### Flows

**Upload file (chunked)**

1. Client splits file into 4 MB chunks, computes SHA-256 per chunk  
2. Client asks which chunks server already has (`POST /uploads/check`)  
3. Client uploads missing chunks only  
4. Client commits file metadata listing chunk hashes in order  
5. Metadata service creates `file` record; block registry increments ref counts  

**Download**

1. Client requests file metadata → ordered list of chunk hashes  
2. For each chunk, download from object storage (parallel)  
3. Reassemble locally  

**Sync**

1. Client stores `syncCursor` (last seen change sequence)  
2. Poll `GET /sync/changes?since=cursor` or maintain WebSocket  
3. Server returns created/updated/deleted paths + new cursor  
4. Client fetches changed files  

**Delete**

1. Mark file deleted in metadata (tombstone)  
2. Decrement block ref counts; if zero, queue block for garbage collection  

### Trade-offs

| Choice | Pros | Cons |
|--------|------|------|
| Content-hash addressing | Dedup, integrity check | Cannot update block in place — new version = new blocks |
| Fixed 4 MB chunks vs content-defined chunking | Simple | CDC (rolling hash) saves bandwidth on inserts but harder |
| Metadata in SQL vs custom tree store | Familiar queries | Deep trees need careful indexing |
| Push (WebSocket) vs poll | Lower latency | More connection state |
| Immediate delete vs GC | Saves space faster | GC simplifies undo/version history |

## 5. Low-Level Design (LLD)

### APIs

```text
POST /api/v1/files/list
Body: { "path": "/Documents" }
→ { "entries": [{ "name", "type", "fileId", "size", "modifiedAt" }] }

POST /api/v1/uploads/check
Body: { "chunks": ["sha256:abc...", "sha256:def..."] }
→ { "missing": ["sha256:def..."] }

PUT  /api/v1/uploads/chunk/{sha256}
Body: raw bytes (4 MB max)
→ 201

POST /api/v1/files/commit
Body: {
  "path": "/Documents/report.pdf",
  "chunks": ["sha256:abc...", "sha256:def..."],
  "sizeBytes": 8000000,
  "clientRev": "local-uuid-7"
}
→ { "fileId", "serverRev", "modifiedAt" }

GET  /api/v1/files/download?fileId=f_123
→ 302 to signed URL OR chunked stream

GET  /api/v1/sync/changes?since=seq_991822
→ { "changes": [...], "cursor": "seq_991900" }

DELETE /api/v1/files?path=/Documents/old.doc
→ 204
```

### Schema

```text
users (
  user_id     BIGINT PRIMARY KEY,
  email       VARCHAR UNIQUE,
  root_id     BIGINT NOT NULL          -- root folder id
)

files (
  file_id       BIGINT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  parent_id     BIGINT NULL,           -- folder id; null = root
  name          VARCHAR(255) NOT NULL,
  is_folder     BOOLEAN NOT NULL,
  size_bytes    BIGINT DEFAULT 0,
  server_rev    BIGINT NOT NULL,
  is_deleted    BOOLEAN DEFAULT FALSE,
  modified_at   TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, parent_id, name, is_deleted)  -- simplified
)

file_blocks (
  file_id     BIGINT NOT NULL,
  seq         INT NOT NULL,            -- order within file
  block_hash  CHAR(64) NOT NULL,       -- SHA-256 hex
  PRIMARY KEY (file_id, seq)
)

blocks (
  block_hash    CHAR(64) PRIMARY KEY,
  storage_key   VARCHAR NOT NULL,      -- s3://bucket/ab/cdef...
  size_bytes    INT NOT NULL,
  ref_count     BIGINT NOT NULL DEFAULT 0
)

change_log (
  seq           BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  file_id       BIGINT,
  change_type   VARCHAR(16),           -- CREATE | UPDATE | DELETE
  path          TEXT,
  created_at    TIMESTAMPTZ NOT NULL
)

CREATE INDEX idx_files_user_parent ON files(user_id, parent_id) WHERE NOT is_deleted;
CREATE INDEX idx_change_log_user_seq ON change_log(user_id, seq);
```

Shard `files` and `change_log` by `user_id`.

### Modules

```text
MetadataService / PathResolver / FileRepository
UploadService / ChunkStore / CommitHandler
DownloadService / SignedUrlGenerator
BlockRegistry / RefCountWorker / GarbageCollector
SyncService / ChangeLogReader / NotificationPusher
```

### Algorithm — chunked upload with dedup

```text
function commitFile(userId, path, chunkHashes, sizeBytes):
  validatePath(path)
  parent, name = splitPath(path)

  tx.begin()
  for hash in chunkHashes:
    if not blocks.exists(hash):
      fail(400, "missing chunk: " + hash)
  for hash in chunkHashes:
    blocks.incrementRef(hash)

  oldFile = files.findByPath(userId, path)
  if oldFile:
    decrementRefs(oldFile.blockHashes)
    files.markUpdated(oldFile, chunkHashes, sizeBytes)
  else:
    files.create(userId, parent, name, chunkHashes, sizeBytes)

  changeLog.append(userId, path, UPDATE or CREATE)
  tx.commit()
  notifySync(userId)
```

### Algorithm — client sync loop

```text
function syncLoop(localCursor):
  resp = GET /sync/changes?since=localCursor
  for change in resp.changes:
    if change.type == DELETE:
      local.delete(change.path)
    else:
      meta = GET metadata(change.fileId)
      if local.hash(meta) != meta.serverRev:
        downloadAndReplace(change.path, meta)
  localCursor = resp.cursor
  persist(localCursor)
```

### Algorithm — garbage collection

```text
function gcBlocks():
  candidates = blocks.where(ref_count == 0 AND marked_at < now() - 7 days)
  for block in candidates:
    objectStorage.delete(block.storage_key)
    blocks.delete(block.block_hash)
```

### Concurrency notes

- Two clients commit same path: use **optimistic locking** with `server_rev` or `If-Match` header  
- Ref count updates must be transactional with metadata commit  
- Upload chunk PUT is idempotent (same hash → overwrite OK)  
- List-after-write: read your writes from primary DB replica, not stale replica  

## 6. Scale evolution

| Stage | Scale | Changes |
|-------|-------|---------|
| MVP | 1M users | Single region, Postgres + S3, poll-based sync |
| Metadata growth | 100M+ files | Shard metadata by `user_id`; separate change log per shard |
| Large files | 10 GB+ | Multipart upload API, parallel chunk PUT, CDN for download |
| Sync latency | Active users | WebSocket push + regional edge notification service |
| Global | Multi-region | Metadata home region per user; cross-region replication for DR only |
| Enterprise | Sharing & ACLs | Add permission graph; scan links for malware |

## 7. Recap

- **Metadata in DB, bytes in object storage** — never store large blobs in SQL  
- **Content-hash chunks** enable dedup, integrity, and incremental upload  
- **Change log + cursor** powers sync; push beats poll at scale  
- Deletes are **reference-counted**; GC reclaims unreferenced blocks  

**Practice:** walk through uploading a 12 MB file (3 chunks) where 1 chunk already exists on server — what API calls happen?
