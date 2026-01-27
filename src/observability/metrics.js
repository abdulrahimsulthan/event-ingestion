const client = require('prom-client');
const { pool, checkDBError } = require('../config/db');
const logger = require('./logger');

// Collect Node.js process metrics (CPU, memory, GC)
client.collectDefaultMetrics();

const ingestRequestsTotal = new client.Counter({
  name: 'ingest_requests_total',
  help: 'Total number of ingest requests incoming',
})

const ingestRequestsAcceptedTotal = new client.Counter({
  name: 'ingest_requests_accepted_total',
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

const ingestionLagSeconds = new client.Gauge({
  name: 'ingestion_lag_seconds',
  help: 'Age is seconds of the oldest unprocessed event'
})

async function updateIngestionLag () {
  try {
    const {rows: [{lag=0}]} = await pool.query(`
      SELECT EXTRACT(EPOCH FROM (now() - MIN(received_at))) AS lag
      FROM events_staging
      WHERE status IN ('pending', 'processing');
      `)
    ingestionLagSeconds.set(Number(lag))
    
  } catch (error) {
    if (checkDBError(error, {service: 'prom-client', component: 'update_ingestion_lag'})) {}
    else {
      logger.fatal({
        service: 'prom-client',
        component: 'update_ingestion_lag',
        msg: 'unknown prom-client error',
        error_code: error.code
      })
    }
  }

}
setInterval(updateIngestionLag, 5000)

module.exports = {
  client,
  ingestRequestsTotal,
  ingestRequestsAcceptedTotal,
  ingestRequestDuration,
  ingestRequestsRejectedTotal,
  eventsProcessedTotal,
  eventsFailedTotal,
  eventRetriesTotal,
  eventsDeadTotal,
}