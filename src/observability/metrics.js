const client = require('prom-client');
const { pool, checkDBError } = require('../config/db');
const logger = require('./logger');

client.collectDefaultMetrics();

/* =======================
   Ingestion counters
======================= */

const ingestRequestsTotal = new client.Counter({
  name: 'ingest_requests_total',
  help: 'Total number of ingest requests incoming',
});

const ingestRequestsAcceptedTotal = new client.Counter({
  name: 'ingest_requests_accepted_total',
  help: 'Total number of ingest requests accepted',
});

const ingestRequestsRejectedTotal = new client.Counter({
  name: 'ingest_requests_rejected_total',
  help: 'Total number of ingest request rejected',
});

const ingestBytesTotal = new client.Counter({
  name: 'ingest_bytes_total',
  help: 'Total number of ingest payload bytes',
});

const ingestRequestDuration = new client.Histogram({
  name: 'ingest_latency_seconds',
  help: 'Ingest request latency in seconds',
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

/* =======================
   Processing counters
======================= */

const eventsProcessedTotal = new client.Counter({
  name: 'events_processed_total',
  help: 'Total number of events successfully processed',
});

const eventsFailedTotal = new client.Counter({
  name: 'events_failed_total',
  help: 'Total number of events that failed processing',
});

const eventRetriesTotal = new client.Counter({
  name: 'events_retried_total',
  help: 'Total number of event retries',
});

const eventsDeadTotal = new client.Counter({
  name: 'events_dead_total',
  help: 'Total number of dead-lettered events',
});

/* =======================
   Lag & backlog gauges
======================= */

const ingestionLagSeconds = new client.Gauge({
  name: 'ingestion_lag_seconds',
  help: 'Age in seconds of the oldest unprocessed event',
});

const eventsPendingTotal = new client.Gauge({
  name: 'events_pending_total',
  help: 'Events pending processing',
});

const eventsProcessingTotal = new client.Gauge({
  name: 'events_processing_total',
  help: 'Events currently processing',
});

const eventsBacklogTotal = new client.Gauge({
  name: 'events_backlog_total',
  help: 'Total backlog size',
});

const eventsStuckProcessingTotal = new client.Gauge({
  name: 'events_stuck_processing_total',
  help: 'Events stuck in processing',
});

const activeWorkers = new client.Gauge({
  name: 'active_workers',
  help: 'Number of active worker processes',
  labelNames: ['worker_id'],
});


/* =======================
   Single interval updater
======================= */

let metricsRunning = false;

async function updateQueueMetrics () {
  if (metricsRunning) return;
  metricsRunning = true;

  try {
    const { rows: [row] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        EXTRACT(EPOCH FROM (
          now() - MIN(received_at)
        )) FILTER (WHERE status IN ('pending','processing')) AS lag,
        COUNT(*) FILTER (
          WHERE status = 'processing'
            AND processing_started_at < now() - INTERVAL '5 minutes'
        ) AS stuck
      FROM events_staging;
    `);

    const pending = Number(row.pending || 0);
    const processing = Number(row.processing || 0);

    eventsPendingTotal.set(pending);
    eventsProcessingTotal.set(processing);
    eventsBacklogTotal.set(pending + processing);
    ingestionLagSeconds.set(Number(row.lag || 0));
    eventsStuckProcessingTotal.set(Number(row.stuck || 0));

  } catch (error) {
    if (!checkDBError(error, { service: 'prom-client', component: 'updateQueueMetrics' })) {
      logger.fatal({
        service: 'prom-client',
        component: 'updateQueueMetrics',
        msg: 'unknown prom-client error',
        error_code: error.code,
      });
    }
  } finally {
    metricsRunning = false;
  }
}

setInterval(updateQueueMetrics, 5000);


/* =======================
  DB latency track wrapper
======================= */

const dbQueryLatencySeconds = new client.Histogram({
  name: 'db_query_latency_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['query'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
})

/* =======================
   Exports
======================= */

module.exports = {
  client,
  ingestRequestsTotal,
  ingestRequestsAcceptedTotal,
  ingestRequestsRejectedTotal,
  ingestBytesTotal,
  ingestRequestDuration,
  eventsProcessedTotal,
  eventsFailedTotal,
  eventRetriesTotal,
  eventsDeadTotal,
  activeWorkers,
  dbQueryLatencySeconds,
};
