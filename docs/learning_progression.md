# Event Ingestion — Learning Progression

This document tracks how my skills grew as I moved from “I know Node.js basics” 
to “I understand ingestion systems, overload behavior, backpressure, and database limits”.

The purpose is not motivation. It is evidence of engineering growth.

---

## 🟢 Level 0 — Naive Understanding

### 🧠 Mental Model (Before)
- “Events come in → store in DB → done”
- Assumed Express + `express.json()` was fine for ingestion
- Thought more concurrency = more throughput
- Did not understand:
  - inflight limits
  - backpressure
  - DB latency as bottleneck
  - memory growth behavior
  - streaming vs buffering

### 🧪 Experiments at this stage
- Built first `/ingest` endpoint using Express
- Parsed body using JSON middleware
- Inserted each request directly into Postgres
- Load-tested with `autocannon`

### 🚨 What broke / what I learned
- Large payloads blew memory
- Whole-body buffering blocked event loop
- Postgres write latency capped throughput
- Concurrency increase did NOT increase RPS
- Realized:
  - requests are not free
  - DB I/O dominates performance
  - Node isn’t the bottleneck, *the system is*

### 🧩 Key Concepts Unlocked
- Inflight request caps
- Backpressure mindset
- Postgres cannot be treated like a queue
- Throughput != concurrency

**This is where the “toy web-app mindset” died.**

---

## 🟡 Level 1 — First Principles Engineering

### 🧠 Mental Model (Now)
- Request handling must be **memory-bounded**
- DB writes must be **controlled**
- System should **fail fast when overloaded**
- Ingestion is NOT CRUD

### 🧪 Experiments at this stage
- Removed `express.json()` to avoid buffering
- Switched to raw streaming `req.on('data')`
- Added:
  - MAX_SIZE payload guard
  - inflight connection cap
  - cleanup + close handling
- Stress-tested with:
  - 1MB / 5MB / 20MB payloads
  - 10–20000 concurrency
- Added metrics for:
  - RSS memory
  - heap usage
  - event loop lag

### 📊 Breakthrough Observations
- Memory spikes follow payload size
- RSS stays high due to fragmentation (not leaks)
- GC reduces heap but not RSS
- Throughput plateaued ~5–6k req/sec
  → because Postgres was the bottleneck
- Inflight cap prevented catastrophic collapse
- Large single events = pathological clients

### 🧩 Concepts Gained (Real Engineering Skills)
- Overload protection is a feature
- Queueing is necessary
- DB writes must be decoupled
- Batching > single-row inserts
- Load patterns matter more than benchmarks
- Ingestion ≠ web server

**This is where I stopped thinking like a framework user
and started thinking like a systems engineer.**

---

## 🟣 Level 2 — Queue + Batch Writer (CURRENT STAGE)

I will document:

- my queue design decisions
- batch size strategy
- flush timing
- rejection policy when queue is full
- how throughput changes
- how latency behaves under load
- what surprised me
- what broke and why
- what I now understand differently

---
