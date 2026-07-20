# System Design Handbook

## View the live app

**[Open System Design Handbook →](https://system-design-iota-ten.vercel.app/)**

Browse the full interactive course in your browser — 15 fundamentals, 20 case studies, HLD/LLD diagrams, and prev/next navigation.

> **Live app:** [system-design-iota-ten.vercel.app](https://system-design-iota-ten.vercel.app/) · **GitHub:** [saroj990/system-design](https://github.com/saroj990/system-design)

A complete beginner-to-interview path for designing backend systems: clarify requirements, estimate scale, draw a clear **HLD**, then specify **LLD** with APIs, schemas, and algorithms.

<div class="home-like-banner">
  👍 Enjoying this handbook? Give the repo a <strong>star on GitHub</strong> — it helps others discover it and keeps this project going.
  <a href="https://github.com/saroj990/system-design" target="_blank" rel="noopener">Star on GitHub ⭐</a>
</div>

<div class="home-hero-meta">
  <span>15 fundamentals</span>
  <span>20 case studies</span>
  <span>HLD + LLD for every app</span>
</div>

## Who this is for

| Audience | What you will get |
|----------|-------------------|
| New to distributed systems | A plain-English map of the building blocks |
| Backend engineers | A repeatable method for HLD and LLD |
| Interview candidates | Practice on the apps interviewers ask most |

You should be comfortable writing basic code. You do **not** need prior experience with Kafka, Redis clusters, or multi-region architecture.

## Course structure

<div class="home-grid">

<div class="home-card">

### Part 1 — Fundamentals

Fifteen sequential lessons covering the vocabulary and patterns every design reuses:

requirements → estimates → APIs → load balancing → databases → replication & sharding → caching → consistency → queues → CDN → services → reliability → **how to HLD** → **how to LLD**

[Begin Part 1 →](fundamentals/01-what-is-system-design.md)

</div>

<div class="home-card">

### Part 2 — Case studies

Twenty common products, each designed end-to-end with the same template: problem, requirements, capacity math, component diagram, APIs, schema, algorithms, and scale evolution.

Start with [URL Shortener](case-studies/01-url-shortener.md), then [Rate Limiter](case-studies/03-rate-limiter.md), then explore freely.

[Browse case studies →](case-studies/01-url-shortener.md)

</div>

</div>

## Featured case studies

Start with these — they cover the patterns interviewers ask most often. Each includes HLD diagrams, APIs, schema, and scale notes.

<div class="home-case-grid">

<a class="home-case-card" href="#/case-studies/01-url-shortener.md">
  <span class="home-case-num">01</span>
  <strong class="home-case-title">URL Shortener</strong>
  <span class="home-case-desc">bit.ly-style redirects at scale</span>
  <span class="home-case-tags">Caching · Unique codes · Read-heavy</span>
</a>

<a class="home-case-card" href="#/case-studies/03-rate-limiter.md">
  <span class="home-case-num">03</span>
  <strong class="home-case-title">Rate Limiter</strong>
  <span class="home-case-desc">Protect APIs from abuse</span>
  <span class="home-case-tags">Token bucket · Redis · Middleware</span>
</a>

<a class="home-case-card" href="#/case-studies/06-news-feed.md">
  <span class="home-case-num">06</span>
  <strong class="home-case-title">News Feed</strong>
  <span class="home-case-desc">Twitter/X-style timeline</span>
  <span class="home-case-tags">Fan-out · Denormalization · Hot users</span>
</a>

<a class="home-case-card" href="#/case-studies/07-chat-messaging.md">
  <span class="home-case-num">07</span>
  <strong class="home-case-title">Chat / Messaging</strong>
  <span class="home-case-desc">WhatsApp-like real-time chat</span>
  <span class="home-case-tags">WebSockets · Delivery · Ordering</span>
</a>

<a class="home-case-card" href="#/case-studies/08-photo-sharing.md">
  <span class="home-case-num">08</span>
  <strong class="home-case-title">Photo Sharing</strong>
  <span class="home-case-desc">Instagram-style uploads & feed</span>
  <span class="home-case-tags">S3 · CDN · Async processing</span>
</a>

<a class="home-case-card" href="#/case-studies/09-video-streaming.md">
  <span class="home-case-num">09</span>
  <strong class="home-case-title">Video Streaming</strong>
  <span class="home-case-desc">YouTube-style on-demand video</span>
  <span class="home-case-tags">Transcoding · HLS · ABR</span>
</a>

<a class="home-case-card" href="#/case-studies/10-ride-sharing.md">
  <span class="home-case-num">10</span>
  <strong class="home-case-title">Ride Sharing</strong>
  <span class="home-case-desc">Uber-style driver matching</span>
  <span class="home-case-tags">Geo search · Real-time · State machine</span>
</a>

<a class="home-case-card" href="#/case-studies/11-ticket-booking.md">
  <span class="home-case-num">11</span>
  <strong class="home-case-title">Ticket Booking</strong>
  <span class="home-case-desc">Concert seats under flash traffic</span>
  <span class="home-case-tags">Inventory locks · Holds · Queues</span>
</a>

<a class="home-case-card" href="#/case-studies/15-payment-wallet.md">
  <span class="home-case-num">15</span>
  <strong class="home-case-title">Payment / Wallet</strong>
  <span class="home-case-desc">Transfers with correct balances</span>
  <span class="home-case-tags">Ledger · Idempotency · ACID</span>
</a>

</div>

<p class="home-case-more">See all 20 case studies in the catalog below, or jump to <a href="#/case-studies/14-notification-system.md">Notifications</a>, <a href="#/case-studies/18-file-storage.md">File Storage</a>, or <a href="#/case-studies/20-analytics-pipeline.md">Analytics</a>.</p>

## Learning path

1. Read [How to use this course](how-to-use.md) — study habits and interview tips  
2. Complete **Fundamentals 01–15** in order  
3. Attempt each case study’s HLD yourself before reading the solution  
4. Deep-read LLD for APIs, tables, and concurrency  

## What you will practice

```text
Clarify → Estimate → Draw HLD → Detail LLD → Name trade-offs
```

Every case study trains the same loop so the method becomes automatic.

## Case study catalog

| # | System | Focus |
|---|--------|--------|
| 01 | [URL Shortener](case-studies/01-url-shortener.md) | Caching, unique codes |
| 02 | [Pastebin](case-studies/02-pastebin.md) | Metadata vs object storage |
| 03 | [Rate Limiter](case-studies/03-rate-limiter.md) | Token bucket, Redis |
| 04 | [Key-Value Store](case-studies/04-key-value-store.md) | Hashing, quorum |
| 05 | [Unique ID Generator](case-studies/05-unique-id-generator.md) | Snowflake IDs |
| 06 | [News Feed](case-studies/06-news-feed.md) | Fan-out strategies |
| 07 | [Chat / Messaging](case-studies/07-chat-messaging.md) | WebSockets, delivery |
| 08 | [Photo Sharing](case-studies/08-photo-sharing.md) | Upload pipeline, CDN |
| 09 | [Video Streaming](case-studies/09-video-streaming.md) | Transcoding, ABR |
| 10 | [Ride Sharing](case-studies/10-ride-sharing.md) | Geo matching |
| 11 | [Ticket Booking](case-studies/11-ticket-booking.md) | Inventory locks |
| 12 | [Web Crawler](case-studies/12-web-crawler.md) | Frontier, politeness |
| 13 | [Search Autocomplete](case-studies/13-search-autocomplete.md) | Tries, top-K |
| 14 | [Notification System](case-studies/14-notification-system.md) | Multi-channel fan-out |
| 15 | [Payment / Wallet](case-studies/15-payment-wallet.md) | Ledger, idempotency |
| 16 | [E-commerce](case-studies/16-ecommerce.md) | Catalog & cart |
| 17 | [Distributed Cache](case-studies/17-distributed-cache.md) | Cluster slots |
| 18 | [File Storage](case-studies/18-file-storage.md) | Sync & dedup |
| 19 | [Collaborative Docs](case-studies/19-collaborative-docs.md) | OT / CRDT basics |
| 20 | [Analytics Pipeline](case-studies/20-analytics-pipeline.md) | Ingest → warehouse |

## Run & deploy

**Live handbook:** [https://system-design-iota-ten.vercel.app](https://system-design-iota-ten.vercel.app)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). This is a **Next.js** app — deploy safely to Vercel with `git push`. See [Deploy this site](DEPLOY.md).

---

<div class="home-like-banner">

👍 **Found this useful?** Give the project a star on [GitHub](https://github.com/saroj990/system-design) — it takes one click and helps more learners find this handbook.

</div>

<div class="home-cta">

**Ready?** Start with [How to use this course](how-to-use.md), then continue to [What is System Design?](fundamentals/01-what-is-system-design.md).

</div>
