# Case Study 31 — Order Matching Engine

Design a **stock exchange order matching engine** like the core of **NASDAQ matching engine** or **Binance spot matcher**: maintain per-symbol order books, match buy/sell orders by **price-time priority**, and emit fills and market data at microsecond-to-millisecond latency with strict correctness.

## 1. Problem

Traders submit **limit** and **market** orders for symbols (e.g., `AAPL`, `BTC-USD`). The exchange must:

- Accept orders, validate funds/positions, and place them in an **order book**  
- Match incoming orders against resting liquidity using **price-time priority**  
- Emit **trades**, update **best bid/offer (BBO)**, and publish **market data**  
- Guarantee **deterministic ordering** — all participants see the same sequence of events  

A naive database-backed design cannot sustain millions of orders/day with sub-millisecond matching. The engine is a **single-writer per symbol** hot path with extreme correctness requirements.

## 2. Requirements

### Functional (MVP)

- Order types: limit (GTC), market, IOC, FOK  
- Side: buy / sell  
- Price-time priority matching within each symbol  
- Partial fills allowed (except FOK)  
- Cancel and replace (modify price/qty)  
- Trade reporting: price, qty, aggressor side, trade ID  
- Market data: BBO, last trade, depth snapshot (top N levels)  
- Order status API: open, partially filled, filled, cancelled, rejected  

### Out of scope (initially)

- Options, multi-leg spreads, auction opening/closing phases  
- Cross-symbol matching (currency conversion)  
- Retail payment settlement — assume clearing house downstream  
- Colocation / FPGA hardware design  
- Regulatory surveillance (layered separately)  

### Non-functional

- Matching latency p99 < 1 ms per order (in-memory path)  
- Throughput: 100K orders/sec aggregate across symbols; hot symbols 10K/sec  
- **Total ordering** per symbol — no ambiguous fill sequence  
- **No double fills, no lost orders** — crash recovery from durable log  
- Fairness: time priority preserved at same price level  
- Auditability: replay log → identical book state  

## 3. Back-of-the-envelope

Assumptions:

- 5,000 listed symbols  
- 500M orders/day, 50M trades/day  
- Average order message 200 bytes; trade 150 bytes  
- 200 hot symbols drive 80% of volume  

```text
Avg order rate  ≈ 500M / 86,400 ≈ 5,800 orders/s
Peak (×5)       ≈ 29,000 orders/s aggregate
Hot symbol peak ≈ 10,000 orders/s per symbol

Trades/s avg    ≈ 50M / 86,400 ≈ 580/s

In-memory book per symbol (rough):
  10 price levels × 100 orders/level × 64 B ≈ 64 KB (small)
  Deep book 10K resting orders × 64 B ≈ 640 KB

Durable log/day ≈ 500M × 200 B ≈ 100 GB raw (+ trades 7.5 GB)
  → Kafka/Pulsar with 3× replication; compacted snapshots hourly

Network fan-out (market data):
  200 hot symbols × 10K updates/s × 100 B ≈ 200 MB/s to internal bus
  External subscribers via filtered multicast / WebSocket gateways
```

Insight: **one matching thread (or shard) per symbol** owns the book — no locks on the hot path; durability via **append-only event log** + periodic snapshots.

## 4. High-Level Design (HLD)

```mermaid
flowchart TB
  GW[Order Gateway] --> VAL[Validation / Risk]
  VAL --> ROUTER[Symbol Router]
  ROUTER --> M1[Matcher AAPL]
  ROUTER --> M2[Matcher MSFT]
  ROUTER --> MN[Matcher ...]

  M1 --> LOG[(Event Log — Kafka)]
  M2 --> LOG
  MN --> LOG

  LOG --> MD[Market Data Publisher]
  LOG --> AUD[Audit / Surveillance]
  LOG --> SNAP[Snapshot Service]

  SNAP --> OBJ[(Object Storage — snapshots)]
  MD --> WS[WebSocket / FIX Gateways]
  MD --> CACHE[(Redis — BBO cache)]

  REC[Recovery Service] --> OBJ
  REC --> LOG
  REC --> M1
```

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant M as Matcher AAPL
  participant L as Event Log
  participant P as Market Data

  C->>G: NewOrder BUY 150.00 × 100
  G->>G: auth, risk pre-check
  G->>M: route(symbol=AAPL, order)
  M->>M: match against ask book
  M->>L: append OrderAccepted, Trade, OrderPartialFill events
  M->>P: push BBO + trade tick
  M-->>G: ack + fills
  G-->>C: execution report
```

### Components

| Component | Role |
|-----------|------|
| Order Gateway | FIX/REST ingress, session mgmt, rate limits |
| Validation / Risk | Buying power, position limits, fat-finger checks |
| Symbol Router | Consistent hash `symbol → matcher partition` |
| Matcher (per symbol shard) | In-memory order book + matching loop |
| Event Log | Durable ordered log of all commands and effects |
| Snapshot Service | Periodic book snapshots + log offset for fast recovery |
| Market Data Publisher | BBO, trades, depth; fans out to subscribers |
| Recovery Service | Replay log from snapshot on restart |
| Audit / Surveillance | Async consumers for compliance |

### Flows

**Submit limit buy**

1. Gateway validates session, assigns `clientOrderId`, checks risk cache  
2. Router sends to matcher partition for symbol  
3. Matcher assigns monotonic `sequenceNumber`, appends `OrderAccepted` to log  
4. Matching loop tries cross with best ask:  
   - If buy price ≥ best ask → trade at resting ask price (price improvement for buyer)  
   - Repeat until order qty exhausted or book empty  
5. Remainder rests in bid book at price level (FIFO queue at that price)  
6. Append `Trade`, `OrderResting` / `OrderFilled` events  
7. Push market data delta; return execution report to client  

**Cancel**

1. Matcher finds order by `orderId` in book index  
2. If found: remove from price level FIFO, append `OrderCancelled`  
3. If already filled → reject cancel  

**Crash recovery**

1. Load latest snapshot for symbol (book state + last sequence)  
2. Replay log entries with `sequence > snapshot.offset`  
3. Rebuild in-memory indexes; resume accepting orders  

### Trade-offs

- **Single-threaded matcher vs lock-free multi-thread** — Single writer per symbol eliminates races; simplest correctness story  
- **Log-first vs match-first** — Synchronous log before ack adds latency but gives strong durability; group commit batches fsync  
- **Price levels as tree vs array** — Tree map (skip list) for sparse prices; array for tick-sized dense prices  
- **Internal FIFO vs pro-rata** — FIFO (price-time) is standard for equities; pro-rata for some futures venues  
- **Colocated binary protocol vs REST** — REST for retail; FIX/binary for HFT gateways  

## 5. Low-Level Design (LLD)

### APIs

Gateway (REST simplified):

```text
POST /api/v1/orders
Body: {
  "symbol": "AAPL",
  "side": "BUY",
  "type": "LIMIT",
  "price": "150.00",
  "qty": 100,
  "timeInForce": "GTC",
  "clientOrderId": "c-88421"
}
→ {
  "orderId": "o-99102",
  "status": "PARTIALLY_FILLED",
  "filledQty": 40,
  "remainingQty": 60,
  "avgPrice": "149.95",
  "trades": [{ "tradeId": "t-1", "price": "149.95", "qty": 40 }]
}

DELETE /api/v1/orders/:orderId
→ { "orderId": "o-99102", "status": "CANCELLED" }

GET /api/v1/orderbook/AAPL?depth=10
→ {
  "bids": [["150.00", 500], ["149.99", 1200]],
  "asks": [["150.01", 300], ["150.02", 800]],
  "sequence": 8840021
}
```

Internal matcher command (single partition):

```text
Command {
  type: NEW_ORDER | CANCEL | REPLACE,
  sequence: int64,           // assigned by matcher
  symbol: string,
  orderId: string,
  ...
}
Event {
  type: ORDER_ACCEPTED | TRADE | ORDER_FILLED | ORDER_CANCELLED | BBO_UPDATE,
  sequence: int64,
  payload: ...
}
```

Market data (WebSocket):

```text
{ "type": "trade", "symbol": "AAPL", "price": "149.95", "qty": 40, "seq": 8840021 }
{ "type": "bbo", "symbol": "AAPL", "bid": "150.00", "ask": "150.01", "seq": 8840022 }
```

### Schema

Durable log (Avro/Protobuf, compacted topics for snapshots):

```text
orders_log (
  partition_key = symbol,
  sequence      BIGINT,
  event_type    VARCHAR,
  payload       BYTES,
  timestamp_ns  BIGINT
)

snapshots (
  symbol        VARCHAR,
  snapshot_id   UUID,
  log_offset    BIGINT,
  book_blob     BYTES,          -- serialized bids/asks + order index
  created_at    TIMESTAMPTZ
)

-- Downstream OLTP for client queries (async projection)
orders_projection (
  order_id        VARCHAR PRIMARY KEY,
  client_order_id VARCHAR,
  symbol          VARCHAR,
  side            VARCHAR,
  status          VARCHAR,
  price           DECIMAL,
  qty             BIGINT,
  filled_qty      BIGINT,
  created_at      TIMESTAMPTZ
)
```

In-memory structures (per symbol):

```text
OrderBook {
  bids: PriceLevelMap            // price → PriceLevel (descending)
  asks: PriceLevelMap            // price → PriceLevel (ascending)
  orderIndex: Map<orderId, OrderLocation>
  sequence: int64
}

PriceLevel {
  price: Decimal
  totalQty: int64
  orders: DoublyLinkedList<Order>   // FIFO — time priority
}

Order {
  orderId, clientOrderId, side, price, remainingQty, timestamp
}
```

### Modules

```text
OrderGateway
SessionManager
RiskChecker
SymbolRouter
MatcherEngine
OrderBook
MatchingLoop
PriceLevel
EventLogWriter
Snapshotter
RecoveryManager
MarketDataPublisher
OrderProjectionConsumer
```

### Algorithm — price-time priority matching

```text
function processNewOrder(order):
  assign order.orderId, order.timestamp
  log.append(ORDER_ACCEPTED, order)
  trades = []

  if order.side == BUY:
    book = askBook
    comparator = order.price >= level.price
  else:
    book = bidBook
    comparator = order.price <= level.price

  while order.remainingQty > 0 and book.bestLevel exists:
    best = book.bestLevel()
    if order.type == LIMIT and not comparator(order, best):
      break

    while order.remainingQty > 0 and best.orders not empty:
      resting = best.orders.head()
      fillQty = min(order.remainingQty, resting.remainingQty)
      tradePrice = resting.price                // resting price wins

      trade = Trade(tradePrice, fillQty, aggressor=order)
      trades.append(trade)
      log.append(TRADE, trade)

      applyFill(order, fillQty)
      applyFill(resting, fillQty)
      if resting.remainingQty == 0:
        best.orders.popHead()
        orderIndex.remove(resting.orderId)

    if best.orders empty:
      book.removeLevel(best.price)

  if order.remainingQty > 0 and order.type == LIMIT and order.timeInForce != IOC:
    insertResting(order)                        // FIFO at price level
    log.append(ORDER_RESTING, order)
  else if order.remainingQty == 0:
    log.append(ORDER_FILLED, order)
  else if order.timeInForce == IOC and order.remainingQty > 0:
    log.append(ORDER_CANCELLED, order, reason=IOC)

  publishBBO()
  return trades
```

### Algorithm — insert resting order (FIFO)

```text
function insertResting(order):
  level = book.side.getOrCreate(order.price)
  level.orders.pushTail(order)                  // time priority
  orderIndex[order.orderId] = { price, nodeRef }
  level.totalQty += order.remainingQty
```

### Algorithm — cancel and replace

```text
function cancel(orderId):
  loc = orderIndex.get(orderId)
  if loc is null: return REJECT_UNKNOWN
  level = book.side[loc.price]
  level.orders.remove(loc.nodeRef)
  orderIndex.remove(orderId)
  log.append(ORDER_CANCELLED, orderId)

function replace(orderId, newPrice, newQty):
  old = orderIndex.get(orderId)
  if old is null: return REJECT
  cancelled = cancel(orderId)
  newOrder = cloneWith(newPrice, newQty)
  return processNewOrder(newOrder)              // loses time priority at new price
```

### Algorithm — deterministic recovery

```text
function recover(symbol):
  snap = snapshotStore.latest(symbol)
  book = deserialize(snap.book_blob)
  seq = snap.log_offset

  for event in log.read(symbol, from=seq+1):
    assert event.sequence == seq + 1
    applyEventToBook(book, event)               // same code as live path
    seq = event.sequence

  return MatcherEngine(book, seq)
```

### Algorithm — group commit to log (latency vs durability)

```text
function matcherLoop():
  batch = []
  loop:
    cmd = inboundQueue.poll(timeout=100µs)
    if cmd: batch.append(cmd)
    if batch not empty and (batch.size >= 64 or timeout elapsed):
      events = []
      for cmd in batch:
        events += execute(cmd)                  // produces events in memory
      log.appendSync(events)                    // fsync or Kafka ack all
      outboundAck(batch)
      batch.clear()
```

### Concurrency & correctness

- **Single thread per symbol partition** — all book mutations serial; no locks  
- **Monotonic sequence** — every event gets `sequence++`; consumers detect gaps  
- **Idempotent clientOrderId** — gateway dedup window prevents double submit  
- **FOK pre-check** — simulate match without mutation; abort if cannot fill entirely  
- **Market orders** — walk book until qty filled; uncross at any price level  
- **Self-trade prevention (STP)** — optional: cancel resting if same `accountId`  
- **Invariant checks** (debug): `sum(level.qty) == sum(orders.qty)`; no negative qty  

### Failure modes

| Failure | Symptom | Mitigation |
|---------|---------|------------|
| Matcher crash mid-batch | Uncommitted orders lost | Log-before-ack; replay uncommitted |
| Log partition unavailable | Cannot accept orders | Halt matching for symbol; fail closed |
| Slow consumer (market data) | Backpressure | Separate log for MD; matcher never blocks on WS |
| Clock skew on timestamps | Display-only issue | Matching uses arrival sequence, not wall clock |
| Duplicate gateway delivery | Double order | Dedup `clientOrderId` at gateway + matcher |
| Snapshot corruption | Bad recovery | Keep N snapshots; verify checksum; replay from older |
| Hot symbol overload | Latency spike | Shard sub-books (rare); colocate; binary protocol |

## 6. Scale evolution

| Stage | Change |
|-------|--------|
| MVP | Single process, all symbols, in-memory + local WAL |
| Production | Partition by symbol hash; dedicated matcher VMs |
| Hot symbols | Isolated partition per mega-cap; CPU pinning |
| HA | Active-passive per partition via leader lease; standby hot replay |
| Global exchange | Symbol locality; matching in one region per listing |
| Ultra-low latency | Kernel bypass NIC, custom binary, snapshot to PMEM |

## 7. Recap

- **Price-time priority** = best price first, then FIFO within level  
- **Single writer per symbol** is the standard correctness pattern  
- **Event log + snapshots** enable crash recovery and audit replay  
- Matching is CPU-bound and in-memory; **don't put the book in Postgres**  
- Market data is a **read-only projection** of the same ordered events  

**Practice:** draw the order book for a sequence of 5 orders (buys/sells/cancels), list resulting trades, then write `processNewOrder` pseudocode including partial fills and IOC behavior.
