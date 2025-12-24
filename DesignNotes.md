# Event Ingestion
## Event

An event is an immutable record of something that happened at a point in time.
Once accepted by the system, an event is never modified or deleted.

An event consists of:
- event_id: globally unique identifier (UUIDv7 preferred for ordering)
- event_name: logical type of event (e.g. page_view, button_click)
- api_key: identifies the producer (tenant)
- occurred_at: timestamp when the event occurred (may be in the past)
- received_at: timestamp when the server accepted the event
- properties: arbitrary key-value data associated with the event

Notes:
- Events are append-only.
- Events are immutable after ingestion.
- Ordering is best-effort per api_key, not globally guaranteed.
## Producers

Producers are untrusted clients that send events to the ingestion system.

Examples:
- Browser SDKs
- Mobile SDKs
- Backend services

Constraints:
- Producers may be slow, bursty, or misbehaving.
- Producers may retry requests.
- Producers may send duplicate events.
- Producers cannot be trusted for correctness or ordering.

The system must remain stable regardless of producer behavior.
## Ingestion Endpoints

The system exposes two ingestion endpoints:

- POST `/ingest`
  - Accepts a single event.

- POST `/batch`
  - Accepts multiple events in one request.
  - Maximum request size: 20MB.

Batch format:
```
{
  api_key,
  events: [
    { event_id, event_name, occurred_at, properties }
  ]
}
```
## Consumers (Downstream)

Consumers are internal or external systems that read ingested events
for processing, analytics, or delivery.

Examples:
- Analytics processors
- Real-time delivery systems
- Data warehouse loaders

Consumer behavior is out of scope for Milestone 0.
## What happens if ingestion is slower than producers?

The system applies backpressure at the HTTP layer.

Strategies:
- Requests are processed only while internal buffers are below a fixed limit.
- When capacity is exceeded, new requests are rejected with HTTP 429.
- No unbounded in-memory queues are allowed.

This protects:
- Process memory (RSS)
- Event loop latency
- Database stability

## What happens if producers are slow?

Nothing special.

Slow producers naturally reduce load on the system.
The server does not maintain state or buffers per producer.

## What happens if PostgreSQL is slow or unavailable?

The ingestion system does NOT buffer events to disk.

Behavior:
- Ingestion throughput is reduced via backpressure.
- Requests may be delayed or rejected (HTTP 503).
- Producers are responsible for retries.

Rationale:
- Introducing a secondary persistence layer increases complexity.
- Correctness and bounded memory are prioritized over availability.

## Data Loss Guarantees

The system provides at-least-once ingestion semantics while under normal operation.

Intentional data loss may occur when:
- The system is under sustained overload
- PostgreSQL is unavailable
- Backpressure limits are exceeded

In these cases:
- Requests may be rejected
- Events are not buffered indefinitely
- Producers must retry if delivery is required

The system prioritizes stability over completeness.
