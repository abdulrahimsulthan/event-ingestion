const http = require('http')
const { pool } = require("../config/db");
const { parentPort } = require("worker_threads");
const { eventsProcessedTotal, eventsFailedTotal, eventsDeadTotal, eventRetriesTotal, client } = require("../observability/metrics");
const logger = require('../observability/logger');

const METRICS_PORT = process.env.METRICS_PORT;
const WORKER_ID = process.env.WORKER_ID;

const BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function computeBackoffMS(retry_count) {
  const base = 1000; // 1s
  const max = 60_000; // 1min cap

  const exp = Math.min(base * 2 ** retry_count, max); // exponential backoff
  const jitter = Math.random() * exp * 0.2; // ± 20% jitter - reduce synchronisation

  return exp + jitter;
}

// Recover events from stucked in processing status, and make it as failed events
async function recoverStuckProcessing() {
  const res = await pool.query(
    `
    UPDATE events_staging
    SET
      status = 'failed',
      retry_count = retry_count + 1,
      retry_at = now(),
      error = 'processing time out',
      processing_started_at = NULL
    WHERE
      status = 'processing' 
      AND dead = false 
      AND processing_started_at IS NOT NULL 
      AND processing_started_at < now() - ($1 || ' milliseconds')::interval

    RETURNING events_staging.event_id
    `,
    [PROCESSING_TIMEOUT_MS],
  );
  if (res.rowCount > 0) {
    logger.info({
    service: 'wroker',
    component: 'recovery',
    msg: 'recovered_processing_events',
    work: 'state_transisition',
    from_state: 'processing',
    to_state: 'failed',
      recovered_count: res.rowCount,
      recovered_events: res.rows.map((evt)=> evt.event_id)
  })
  }
}

// Requeue the eligible failed events.
async function retryFailed() {
  const res = await pool.query(
    `
    UPDATE events_staging
    SET
      status = 'pending'
    WHERE
      status = 'failed' 
      AND dead = false 
      AND retry_at <= now()

    RETURNING events_staging.event_id
    `,
  );
  if (res.rowCount > 0) {
  logger.info({
    service: 'worker',
    component: 'retry',
    msg: 'retry_failed_events',
    work: 'state_transistion',
    from_state: 'failed',
    to_state: 'pending',
    retry_count: res.rowCount,
      retry_events: res.rows.map((evt)=> evt.event_id),
  })
  }
  eventRetriesTotal.inc(res.rowCount)
}

async function promoteOnce({
  staging_id,
  event_id,
  name,
  occurred_at,
  received_at,
  properties,
  retry_count,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Idempotent insert into events table
    await client.query(
      `
      INSERT INTO events (id, name, occurred_at, received_at, properties)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
      `,
      [event_id, name, occurred_at, received_at, properties],
    );
    await client.query(
      `
      UPDATE events_staging
      SET status = 'processed', processing_started_at = NULL 
      WHERE staging_id = $1
      `,
      [staging_id],
    );
    await client.query("COMMIT");
    logger.info({
      service: 'worker',
      component: 'processor',
      msg: 'event_promoted',
      work: 'state_transistion',
      from_state: 'processing',
      to_state: 'processed',
      event_id: event_id,
    })
    eventsProcessedTotal.inc()
  } catch (error) {
    await client.query("ROLLBACK");

    // Update event as failed status with retry backoff interval
    const backoffMS = computeBackoffMS(retry_count);
    await pool.query(
      `
      UPDATE events_staging
      SET 
        status = 'failed', 
        error = $1,
        retry_count = retry_count + 1,
        retry_at = now() + ($2 || ' milliseconds')::interval,
        processing_started_at = NULL
      WHERE staging_id = $3
      `,
      [error.message, backoffMS, staging_id],
    );
    logger.warn({
      service: 'wroker',
      component: 'processor',
      msg: 'promotion_failed',
      work: 'state_transisition',
      from_state: 'processing',
      to_state: 'failed',
      event_id: event_id
    })
    eventsFailedTotal.inc()
  } finally {
    client.release();
  }
}

async function promoteBatch() {
  const client = await pool.connect();

  // Claim batch of eligible pending events and move to processing status
  try {
    const { rows, rowCount } = await client.query(
      `
      WITH claimed AS (
        SELECT staging_id FROM events_staging 
        WHERE status = 'pending' AND dead = 'false' AND (retry_at IS NULL OR retry_at <= now())
        ORDER BY received_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      
      UPDATE events_staging SET
        status = 'processing', processing_started_at = now()
      FROM claimed 
      WHERE events_staging.staging_id = claimed.staging_id

      RETURNING
        events_staging.staging_id,
        events_staging.event_id,
        events_staging.name,
        events_staging.occurred_at,
        events_staging.received_at,
        events_staging.properties,
        events_staging.retry_count;
    `,
      [BATCH_SIZE],
    );

    if( rowCount > 0 ){
    logger.info({
      service: 'worker',
      component: 'processor',
      msg: 'claimed_for_processing',
      work: 'state_transistion',
      from_state: 'pending',
      to_state: 'processing',
        claimed_count: rowCount,
        claimed_events: rows.map((evt)=> evt.event_id)
    })
    }
    return rows;
  } finally {
    client.release();
  }
}

// Add dead letter to unrecoverable events
async function applyDeadLetter() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      UPDATE events_staging
      SET dead = true
      WHERE 
        status = 'failed' 
        AND retry_count >= $1 
        AND dead = false

      RETURNING events_staging.event_id
      `,
      [MAX_RETRIES],
    );
    if (res.rowCount > 0) {
    logger.error({
      service: 'worker',
      component: 'dead_letter',
      msg: 'events_marked_dead',
      work: 'state_transistion',
      from_state: 'failed',
      to_state: 'dead',
      dead_count: res.rowCount,
        dead_events: res.rows.map((evt)=> evt.event_id)
    })
    }
    eventsDeadTotal.inc(res.rowCount)
  } finally {
    client.release();
  }
}

async function loop() {
  while (true) {
    try {
      await recoverStuckProcessing();
      await retryFailed();

      const rows = await promoteBatch();

      if (rows.length == 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      for (const row of rows) {
        await promoteOnce(row);
      }

      await applyDeadLetter();
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: "error",
          error: error.message,
        });
      }
      // small pause to avoid tight crash loop
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

if(METRICS_PORT) {
  http.createServer(async (_req, res) => {
    res.setHeader("Content-Type", client.register.contentType)
    res.end(await client.register.metrics())
  }).listen(METRICS_PORT, ()=>console.log(`Worker ${WORKER_ID} metrics on :${METRICS_PORT}`))
}

loop().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: err.message,
    });
  }
  process.exit(1);
});
