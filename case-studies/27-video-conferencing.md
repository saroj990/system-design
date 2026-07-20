# Case Study 27 — Video Conferencing

Design a service like **Zoom**: multi-party video calls with screen sharing, mute/unmute, and stable quality on typical home networks.

## 1. Problem

Users join a virtual **meeting room** from browsers or mobile apps. Each participant sends audio/video to others with acceptable latency (< 300 ms one-way ideally) and without melting the server or the client's CPU.

Direct peer-to-peer works for 2 people but breaks down at 5+ participants — you need a **Selective Forwarding Unit (SFU)** architecture.

## 2. Requirements

### Functional (MVP)

- Create / join meeting by ID or link  
- Multi-party video and audio (up to ~50 participants per room)  
- Mute/unmute audio, enable/disable camera  
- Screen sharing (one active sharer at a time)  
- Participant list and host controls (mute all, remove participant)  
- Chat messages in-meeting (optional MVP+)  

### Out of scope (initially)

- End-to-end encryption with server-blind routing (complex key management)  
- Live transcription and AI summaries  
- Recording to cloud storage  
- Webinar mode (1-to-many broadcast with RTMP)  

### Non-functional

- Low latency media path (< 300 ms)  
- Adaptive bitrate — degrade gracefully on bad Wi-Fi  
- High availability for signaling; media servers regional  
- Scale horizontally by meeting room  
- Privacy: only invited users join (tokens, waiting room)  

## 3. Back-of-the-envelope

Assumptions:

- 100K concurrent meetings at peak  
- Average 8 participants per meeting  
- 720p video ~ 1.5 Mbps uplink per sender; SFU forwards selectively  

```text
Concurrent participants ≈ 100K × 8 = 800K

Per participant (SFU model):
  Upload: 1 stream up to SFU (~1.5 Mbps video + 50 Kbps audio)
  Download: N-1 forwarded streams, but simulcast/layer selection → ~2–4 Mbps typical

SFU egress per 8-person room ≈ 8 uploads in, ~8×2 Mbps selective out ≈ 16 Mbps/room
100K rooms × 16 Mbps ≈ 1.6 Tbps peak (distributed across regions)

Signaling QPS: join/leave/ICE updates ≈ low thousands/s (not the bottleneck)
```

Insight: **media bandwidth dominates** — use SFU (not MCU mixing), simulcast, and regional edge servers.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  subgraph clients [Clients]
    A[Browser A]
    B[Browser B]
    C[Browser C]
  end

  A --> SIG[Signaling Service]
  B --> SIG
  C --> SIG

  SIG --> MR[Meeting Registry]
  SIG --> SFU[SFU Media Server]

  A <-->|WebRTC media| SFU
  B <-->|WebRTC media| SFU
  C <-->|WebRTC media| SFU

  SIG --> DB[(Postgres)]
  SFU --> TURN[TURN Server]
  A -.->|fallback relay| TURN
```

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Signaling
  participant F as SFU

  C->>S: POST /meetings/:id/join (JWT)
  S->>S: Validate token, assign SFU node
  S->>C: room config + ICE servers + SFU endpoint
  C->>F: WebRTC offer (SDP)
  F->>C: WebRTC answer (SDP)
  C->>F: ICE candidates (trickle)
  Note over C,F: DTLS-SRTP media flows Client ↔ SFU
  S->>C: participant joined (WebSocket event)
```

### Components

| Component | Role |
|-----------|------|
| Signaling Service | WebSocket/HTTP — SDP offers/answers, ICE candidates, room events |
| Meeting Registry | Maps `meetingId → sfuNode, participants, host` |
| SFU Media Server | Receives streams, forwards selected layers to subscribers |
| TURN Server | Relays media when UDP blocked (symmetric NAT, corporate firewalls) |
| Auth Service | Issues short-lived JWT for join |
| Postgres | Meetings metadata, users, schedules |

### Flows

**Create meeting**

1. Host authenticates → `POST /meetings`  
2. System generates meeting ID + host token  
3. Store meeting record (optional password, waiting room flag)  

**Join meeting**

1. Client sends join request with JWT  
2. Signaling validates, picks nearest SFU node (geo + load)  
3. Client opens WebSocket to signaling  
4. WebRTC negotiation: offer/answer exchange via signaling  
5. Media flows **directly to SFU** (not through signaling)  

**During call**

- Signaling carries control: mute, raise hand, screen share start/stop  
- SFU forwards audio always; video layers based on subscriber bandwidth  
- Host "mute all" → signaling event → clients stop sending audio  

### Trade-offs

- **Mesh vs SFU vs MCU** — Mesh: no server media cost, O(N²) connections; MCU: heavy CPU mixing; **SFU: best balance** for group calls  
- **UDP vs TCP** — WebRTC prefers UDP (SRTP); TCP (TURN-TLS) as fallback adds latency  
- **Simulcast vs SVC** — Simulcast (multiple encodings) widely supported; SVC (single scalable stream) more efficient but codec-dependent  

## 5. Low-Level Design (LLD)

### APIs

```text
POST /api/v1/meetings
Headers: Authorization: Bearer <host-jwt>
Body: { "title": "Standup", "waitingRoom": true, "maxParticipants": 50 }
→ { "meetingId": "abc-123", "joinUrl": "https://meet.app/abc-123", "hostToken": "..." }

POST /api/v1/meetings/:id/join
Body: { "displayName": "Alice", "token": "..." }
→ {
     "meetingId": "abc-123",
     "participantId": "p_456",
     "signalingUrl": "wss://signal.us-east.meet.app/ws",
     "sfuUrl": "https://sfu-us-east-1.meet.app",
     "iceServers": [
       { "urls": "stun:stun.meet.app:3478" },
       { "urls": "turn:turn.meet.app:443", "username": "...", "credential": "..." }
     ]
   }

WebSocket wss://signal.../ws?meetingId=abc-123&participantId=p_456

Client → Server messages:
  { "type": "offer",  "sdp": "..." }
  { "type": "answer", "sdp": "...", "targetParticipantId": "p_789" }
  { "type": "ice",    "candidate": {...}, "targetParticipantId": "p_789" }
  { "type": "mute",   "audio": false }
  { "type": "screen-share-start" }

Server → Client messages:
  { "type": "participant-joined", "participant": {...} }
  { "type": "participant-left", "participantId": "p_789" }
  { "type": "offer",  "sdp": "...", "fromParticipantId": "p_789" }
  { "type": "host-muted-all" }
```

### Schema

```text
meetings (
  id              UUID PRIMARY KEY,
  host_user_id    BIGINT NOT NULL,
  title           VARCHAR(256),
  password_hash   VARCHAR(128) NULL,
  waiting_room    BOOLEAN DEFAULT FALSE,
  max_participants INT DEFAULT 50,
  status          VARCHAR(16) DEFAULT 'scheduled',  -- scheduled, active, ended
  created_at      TIMESTAMPTZ NOT NULL,
  started_at      TIMESTAMPTZ NULL,
  ended_at        TIMESTAMPTZ NULL
)

meeting_participants (
  id              UUID PRIMARY KEY,
  meeting_id      UUID REFERENCES meetings(id),
  user_id         BIGINT NULL,
  display_name    VARCHAR(128) NOT NULL,
  role            VARCHAR(16) DEFAULT 'guest',       -- host, co-host, guest
  sfu_node_id     VARCHAR(64) NULL,
  joined_at       TIMESTAMPTZ NULL,
  left_at         TIMESTAMPTZ NULL
)

sfu_nodes (
  id              VARCHAR(64) PRIMARY KEY,
  region          VARCHAR(32) NOT NULL,
  public_url      TEXT NOT NULL,
  capacity_score  INT NOT NULL,                    -- remaining slots
  last_heartbeat  TIMESTAMPTZ NOT NULL
)
```

### Modules

```text
MeetingController
MeetingService
SignalingGateway          (WebSocket hub)
SfuAllocator              (pick node by region + load)
WebRtcNegotiationHandler
ParticipantSessionManager
TurnCredentialService     (time-limited TURN credentials)
MediaQualityController    (simulcast layer selection — SFU-side)
```

### Algorithm — SFU selective forwarding

Each publisher sends **simulcast layers** (low/medium/high resolution). Each subscriber receives one layer based on bandwidth.

```text
function onPublisherTrack(publisherId, track, layers):
  sfu.registerPublisher(meetingId, publisherId, track, layers)

function onSubscriberJoin(subscriberId, publisherId):
  // Start with medium layer
  sfu.forwardLayer(meetingId, publisherId, subscriberId, layer="medium")

function onBandwidthEstimate(subscriberId, bps):
  for each publisherId subscribed by subscriberId:
    layer = pickLayer(bps, publisherSimulcastLayers)
    sfu.forwardLayer(meetingId, publisherId, subscriberId, layer)

function pickLayer(bps, layers):
  if bps > 1_500_000: return "high"
  if bps > 500_000:   return "medium"
  return "low"
```

### Algorithm — SFU node selection

```text
function assignSfu(meetingId, participantRegion):
  meeting = registry.get(meetingId)
  if meeting.sfuNodeId exists:
    node = sfuPool.get(meeting.sfuNodeId)
    if node.healthy and node.capacity > 0:
      return node

  candidates = sfuPool.filter(region ≈ participantRegion, healthy=true)
  node = argmin(candidates, loadScore)
  registry.setSfu(meetingId, node.id)
  return node
```

Sticky assignment: once a meeting binds to an SFU node, new participants prefer the same node to avoid cross-server media routing.

### Algorithm — signaling (offer/answer relay)

```text
function handleOffer(fromId, sdp):
  broadcast to meeting except fromId:
    send { type: "offer", fromParticipantId: fromId, sdp }

function handleAnswer(fromId, toId, sdp):
  send to toId:
    { type: "answer", fromParticipantId: fromId, sdp }

function handleIce(fromId, toId, candidate):
  send to toId:
    { type: "ice", fromParticipantId: fromId, candidate }
```

In SFU architecture, clients typically send **one offer to SFU** (not mesh pairwise). Signaling simplifies to client ↔ SFU negotiation per participant.

### Concurrency & correctness

- Meeting state in Redis for fast participant lookups; Postgres as source of truth  
- JWT join tokens expire in 5–15 minutes; single-use optional for guest links  
- SFU node heartbeats; reassign if node dies (participants reconnect)  
- Idempotent join by `participantId` session token  

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single SFU node + signaling; STUN only; ≤ 10 participants |
| NAT issues | Add TURN cluster; geographic TURN anycast |
| More participants | SFU horizontal scale; cap active videos (audio-only mode) |
| Multi-region | Regional SFU pools; geo-DNS routes clients to nearest edge |
| Large webinars | Separate broadcast path (RTMP/HLS) instead of full-mesh SFU |
| Recording | Sidecar subscriber on SFU composes to object storage |

## 7. Recap

- Group video = **SFU**, not mesh — each client sends one uplink, SFU forwards selectively  
- **Signaling** (WebSocket) is separate from **media** (WebRTC UDP)  
- **Simulcast + adaptive layer selection** handles variable bandwidth  
- **TURN** is required for real-world NAT/firewall coverage  
- Scale by **meeting room** and **region**, not one global media server  

**Practice:** draw the signaling sequence diagram from memory, then explain why SFU beats MCU for 10-person calls.
