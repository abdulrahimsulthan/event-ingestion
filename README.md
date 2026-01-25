# Event Ingestion Pipeline

A production-style event ingestion pipeline built to demonstrate low-latency ingestion, correctness under retries and crashes, and disciplined system design.  
The system prioritizes idempotent ingestion, durable staging, replayable processing, and explicit failure observability over premature distributed complexity.

---

## Problem Statement

Event ingestion systems exist to reliably accept, process, and distribute events to downstream consumers.  
The hardest problems are not throughput or tooling, but correctness: ensuring events are not lost, duplicated, or corrupted under retries, crashes, and partial failures.

This project focuses on building a defensible ingestion backbone before optimizing for downstream scale or distributed fan-out.

---

## Design Goals

- Low-latency, non-blocking ingestion using Node.js streams
- Idempotent ingestion under duplicate requests
- Durable buffering before processing
- Replayable processing without data corruption
- Crash-safe event promotion
- Explicit and observable failure handling
- Clear separation of ingestion and consumption concerns

---

## Non-Goals

- End-to-end real-time processing guarantees
- Exactly-once semantics across distributed boundaries
- Kubernetes-based deployment
- Heavy analytical processing in Node.js

These are intentionally deferred to keep the scope focused and defensible.

---

## High-Level Architecture

```
Client
↓
Ingestion API (Node.js, stream-based)
↓
Durable Staging (PostgreSQL)
↓
Processor Worker
↓
Canonical Events Store
```

Events are considered accepted only after being durably written to staging.  
Downstream consumption is intentionally decoupled from ingestion correctness.

---

## Core Components

### Ingestion API

- Accepts events over HTTP
- Reads request bodies as streams (no full JSON buffering)
- Enforces payload size limits during streaming
- Validates event shape (not business semantics)
- Requires client-provided `event_id` for idempotency
- Writes events to durable staging
- Responds immediately after durable write

This design ensures low ingestion latency and predictable memory usage under load.

---

### Staging Layer (Durability Buffer)

- Append-only `events_staging` table
- Preserves original payload for audit and replay
- Explicit processing states:
  - `pending`
  - `processed`
  - `failed`
- Attempt counter and failure reason stored per event

The staging table is the source of truth for ingestion correctness.

---

### Processor Worker

- Polls staged events in batches
- Uses row-level locking to avoid duplicate processing
- Performs idempotent writes to the canonical store
- Explicit state transitions within transactions
- Retry with backoff for transient failures
- Isolates permanently failing (poison) events

The worker is designed to be stateless and crash-safe.

---

### Canonical Events Store

- Clean, queryable event log
- Enforced uniqueness on `event_id`
- Indexed for downstream consumption
- No business logic or retries at this layer

This table is the contract boundary for future consumers.

---

## Correctness Guarantees

The system is designed to uphold the following invariants:

- An event is written to the canonical store at most once
- No staged event is lost after successful ingestion
- Worker crashes do not cause duplicate events
- Reprocessing and replay are safe and deterministic
- Failed events are observable and recoverable

These guarantees are validated through explicit crash and retry experiments.

---

## Failure Handling & Recovery

The system explicitly handles:

- Worker crashes during batch processing
- Crashes after partial writes
- Transient database failures
- Permanently failing (poison) events

Failed events are retried with backoff up to a maximum attempt threshold and then isolated for inspection and manual replay.

---

## Replay & Backfill

- Events can be replayed by time range or failure state
- Replays do not duplicate canonical events
- Replay does not block live ingestion
- Replay behavior is observable through logs and metrics

Replayability is a first-class design concern, not an afterthought.

---

## Observability

The system provides explicit visibility into ingestion and processing behavior:

### Metrics
- Ingest rate
- Processing rate
- Processing lag (oldest pending event)
- Failure count
- Retry count

### Logging
- Structured JSON logs
- Event lifecycle tracing via `event_id`
- Classified error types instead of raw stack traces

This allows reasoning about system health without guesswork.

---

## Tradeoffs & Design Decisions

<sub>January 25, 2026</sub>
- Per-event state transition history is intentionally not persisted. The system treats events_staging as the authoritative current state, while historical behavior and correctness under failure are demonstrated through metrics, timestamps, and controlled failure experiments. This avoids write amplification and preserves ingestion throughput at scale.

<sub>January 20, 2026</sub>
- PostgreSQL staging is used as the primary durability buffer instead of a message queue to prioritize correctness, explicit state transitions, and deterministic replay.
- Message queues are treated as transport mechanisms and intentionally deferred.
- Node.js is used for ingestion due to its strengths in non-blocking IO and stream-based request handling.
- Downstream consumers are intentionally deferred and expected to be implemented in languages better suited for aggregation and stateful processing.

---

## Running the System

- Start PostgreSQL
- Run database migrations
- Start ingestion API
- Start processor worker

---

## Future Work

- Introduce downstream consumers implemented in more suitable languages (e.g., JVM or Rust)
- Add message queue–based fan-out for consumers
- Deploy and operate the system in Kubernetes

These are evolutionary steps that do not invalidate the core design.

---

## Summary

This project demonstrates the design and implementation of a low-latency, correctness-first event ingestion pipeline.  
It emphasizes disciplined tradeoffs, explicit failure handling, and system behavior under stress rather than tool-driven complexity.
