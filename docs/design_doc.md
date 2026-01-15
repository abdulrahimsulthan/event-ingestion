# Final Product Design – Event Ingestion System

## Goal
Build a production-ready event ingestion pipeline with:
- Idempotent ingestion
- Durable staging
- Replayable processing
- Isolated downstream consumers
- Observable failures

This design is LOCKED during Days 4–8.

---

## System Overview

Ingress API
→ PostgreSQL Staging
→ Processor Worker
→ Canonical Events Store
→ Downstream Consumers

---

## Core Components

### Ingest API
Responsibilities:
- Validate request shape
- Enforce idempotency
- Write to events_staging
- Return immediately

Never:
- Transform events
- Write to final tables
- Retry heavy operations

---

### Staging Table (events_staging)
- Append-only
- Stores raw payload
- Tracks processing status
- Source of truth for replay

---

### Processor Worker
- Polls staging table in batches
- Uses transactions
- Handles retries and backoff
- Writes to canonical events table
- Marks staging rows as processed or failed

Must be:
- Stateless
- Restart-safe
- Idempotent

---

### Canonical Events Table (events)
- Clean, queryable schema
- No business logic
- Strict constraints
- Indexed for reads

---

## Downstream Consumers

### Audit Consumer
- Reads from events table
- Writes to audit_events
- Enables human inspection

### Analytics Consumer
- Aggregates events
- Produces metrics tables
- Can be rebuilt from events

Consumers:
- Track their own offsets
- Do not block ingestion
- Can be replayed independently

---

## Failure Handling
- Transient errors → retry
- Permanent errors → dead_events
- Replay via CLI or SQL

---

## Observability
Minimum metrics:
- Ingest rate
- Processing rate
- Lag
- Failure count
- Consumer lag

---

## Constraints
- No Kubernetes
- No architectural redesign
- Prefer explicit code over abstraction
