# Observability
The observability is when something goes wrong the system tells you 
- that it's wrong
- how bad it is
- where it is
- why it happened
- what you can do next


## The Canonical production observability model
SIGNALS
- Metrics - System health and trends
- Logs - Discrete decisions and failures
- Traces - Request flow (Optional)

CONTROL
- Dashboards - Situational awareness
- Alerts - Wake human when invarients break
  
STORAGE
- Time series DB (Metrics)
- Log stores (Logs)

PIPELINE
- App emits signals
- Infra transport and stores

## Signals
    What your application must emit
- Metrics - System health and trends
- Logs - Discrete decisions and failures

---

## Metrics
Metrics are cheap, stable and alertable.

    They answer "Is the system bahaving?".

---
### Ingestion Metrics
These defines SLO's Later
- `ingest_requests_total`: Counter - ingest req incoming load
- `ingest_requests_accepted_total`: Counter - Accepted events
- `ingest_rejected_total`: Counter - Invalid payloads
- `ingest_bytes_total`: Counter - Load pressure
- `ingest_latency_seconds`: Histogram - Client Experience

---
### Processing metrics
These prove correctness under failure
- `events_processed_total`: Counter - Successful promotions
- `events_failed_total`: Counter - Failed attempts
- `events_retried_total`: Counter - Retry scheduling
- `events_dead_total`: Counter - Poison events
  
---
### Lag & Backlog metrics
These answer "are we falling behind?"
- `ingestion_lags_seconds`: Gauge - Oldest pending events
- `processing_backlog`: Gauge - pending + processing
- `processing_workers_active`: Gauge - Worker health

---
### System health Metrics
- `db_query_latency_seconds`: Histogram - DB pressure
- `worker_crashes_total`: Counter - stability
- `recovery_actions_total`: Counter - Self-healing

---
## Logs
    Logs answers "What exactly happened for this case?"

Logs must be:
- structured JSON
- sparse
- decision oriented
- state machine aware

---
### Logs schema
- Base schema
    ```
    {
        "level": "info | warn | error | fatal",
        "timestamp": "ISO-8601",
        "service": "ingestion-api | worker",
        "component": "ingest | processor | retry | recovery",
        "msg": "LOG_MESSAGE",
    }
    ```

---  
### Logs Taxonomy
- Ingest Logs (ingest)
  - `INFO`: event_accepted
    - `{event_id, size_bytes}`
  - `WARN`: rejected_payload
    ```
    { 
        event_id, 
        size_bytes, 
        error_code: "invalid_json | missing_props | exceed_payload_size"
    }
    ```
  - `ERROR`: service_unavailable
    ```
    {
        event_id, 
        size_bytes, 
        error_code: "staging_db_failure"
    }
    ```
- State transistions
  - `INFO`: pending -> processing
  - `INFO`: processing -> processed
  - `INFO`: failed -> pending (retry)
  - `WARN`: processing -> failed
  - `ERROR`: failed -> dead
- Recovery & Safety
  - `INFO`: stuck processing recovered
  - `WARN`: unusual recovery volume
  - `FATAL`: invariant voilation
- Lifecycle
  - `INFO`: worker start/stop
  - `INFO`: ingestion_service_started
    - `{service_port}`
  - `ERROR`: worker crash
  - `ERROR`: server restart
  - `FATAL`: server crash

---
## Control Plane ( Dashboard )
    Dashboards are for Humans, not for machines 
Note: If a graph doesn't support a decision, remove it

---
### Is the system alive?
If this is zero pull responsible person
- Ingest RPS
- Processing RPS
- worker count

---
### Is it keeping up?
This answers "Do we need scaling?"
- Ingestion Lag (seconds)
- processing backlog (count)

---
### Is it healthy?
- Failure rate
- Retry rate
- Dead events (rate)

---
### Is it degrading?
This answers "Will it fail soon?"
- DB latency p95
- worker crash rate
- recovery rate

---
### Can we trust it?
This answers data trust
- Processed vs Ingested Delta
- Dead events cumulative

---
## Alerts 
    This is where the systems fail.
Alerting principles:
- Alert on **Symptoms**, not causes
- Alert on **rates**, not single spikes
- Alert on breached invariants

---
### Critical Alerts (Wake someone)
- Ingestion stalled: ingest RPS = 0 for N minutes
- Processing stalled: processed RPS = 0 while backlog > 0
- Lag exploding: lag > threshold for sustained time
- Dead events appearing: dead rate > 0
- Worker crash loop: crash rate > threshold

---
### Warning Alerts (Investigate later)
- Retry rate spike: retries > baseline
- Failure rate spike: failures > baseline
- DB latency rising: p95 > baseline

---
### Alert we should NOT create (prevents from alert fatigue)
- Any single error
- Any single retry
- Any single dead event
- Any short spike

---

## Storage and Pipeline
Note: App emits signals, Infra stores & transport, Human observe & act
### Metrics
    APP -> /metrics -> Prometheus -> Grafana -> Alert Manager
- Retention: 15 to 30 days
- scrape interval: 5 to 15 sec
- downsampling later if needed

---
### Logs
    App -> stdout -> Promtail/Fluent Bit -> Loki -> Grafana
- Retention: 7 to 30 days
- Structured JSON
- Indexed on level, component, msg

---
## Traces
No traces yet, deffered until fanout.