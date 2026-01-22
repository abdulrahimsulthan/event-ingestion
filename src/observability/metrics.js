const client = require('prom-client')

// Collect Node.js process metrics (CPU, memory, GC)
client.collectDefaultMetrics();

const ingestRequestsTotal = new client.Counter({
  name: 'ingest_requests_total',
  help: 'Total number of ingest requests accepted',
})

const ingestRequestDuration = new client.Histogram({
  name: 'ingest_request_duration_ms',
  help: 'Ingest request latency in ms',
  buckets: [10, 25, 50, 100, 250, 500, 1000]
})

const ingestRequestsRejectedTotal = new client.Counter({
  name: 'ingest_requests_rejected_total',
  help: 'Total number of ingest request rejected'
})


const eventsProcessedTotal = new client.Counter({
  name: "events_processed_total",
  help: "Total number of events successfully processed",
});

const eventsFailedTotal = new client.Counter({
  name: "events_failed_total",
  help: "Total number of events that failed processing",
});

const eventRetriesTotal = new client.Counter({
  name: "event_retries_total",
  help: "Total number of event retries",
});

const eventsDeadTotal = new client.Counter({
  name: "events_dead_total",
  help: "Total number of dead-lettered events",
});

module.exports = {
  client,
  ingestRequestsTotal,
  ingestRequestDuration,
  ingestRequestsRejectedTotal,
  eventsProcessedTotal,
  eventsFailedTotal,
  eventRetriesTotal,
  eventsDeadTotal,
}