const http = require('http')
const { pool, checkDBError } = require("../config/db");
const { parentPort } = require("worker_threads");
const { eventsProcessedTotal, eventsFailedTotal, eventsDeadTotal, eventRetriesTotal, client, activeWorkers, dbQueryLatencySeconds } = require("../observability/metrics");
const logger = require('../observability/logger');

const METRICS_PORT = process.env.METRICS_PORT;
const WORKER_ID = process.env.WORKER_ID;

const BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const USUAL_LIMIT = 20;
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
  const endTimer = dbQueryLatencySeconds.startTimer({query: 'recover_stuck_event'})
  try {
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

      RETURNING 
        events_staging.event_id, 
        events_staging.received_at, 
        events_staging.retry_count
      `,
      [PROCESSING_TIMEOUT_MS],
    );
    endTimer()
    if (res.rowCount > USUAL_LIMIT) {
      logger.warn({
        service: 'wroker',
        component: 'recovery',
        msg: 'unusual_volume_of_recovered_processing_events',
        work: 'state_transisition',
        from_state: 'processing',
        to_state: 'failed',
        worker_id: WORKER_ID,
        recovered_count: res.rowCount,
        recovered_events: res.rows,
      })
    }
    else if (res.rowCount > 0) {
      logger.info({
        service: 'wroker',
        component: 'recovery',
        msg: 'recovered_processing_events',
        work: 'state_transisition',
        from_state: 'processing',
        to_state: 'failed',
        worker_id: WORKER_ID,
        recovered_count: res.rowCount,
        recovered_events: res.rows,
      })
    }
  }
  finally{
    endTimer()
  }
}

// Requeue the eligible failed events.
async function retryFailed() {
  const endTimer = dbQueryLatencySeconds.startTimer({query: 'retry_failed'})
  try {
    const res = await pool.query(
      `
      UPDATE events_staging
      SET
        status = 'pending'
      WHERE
        status = 'failed' 
        AND dead = false 
        AND retry_at <= now()

      RETURNING 
        events_staging.event_id, 
        events_staging.received_at, 
        events_staging.retry_count,
        events_staging.error
      `,
    );
    endTimer()
    if (res.rowCount > USUAL_LIMIT) {
      logger.warn({
        service: 'worker',
        component: 'retry',
        msg: 'unusual_volume_of_retry_failed_events',
        work: 'state_transistion',
        from_state: 'failed',
        to_state: 'pending',
        worker_id: WORKER_ID,
        retry_events_count: res.rowCount,
        retry_events: res.rows,
      })
    }
    else if (res.rowCount > 0) {
      logger.info({
        service: 'worker',
        component: 'retry',
        msg: 'retry_failed_events',
        work: 'state_transistion',
        from_state: 'failed',
        to_state: 'pending',
        worker_id: WORKER_ID,
        retry_events_count: res.rowCount,
        retry_events: res.rows,
      })
    }
    eventRetriesTotal.inc(res.rowCount)
  } finally {
    endTimer()
  }
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
  const endTimer = dbQueryLatencySeconds.startTimer({query: 'event_promotion'})

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
      worker_id: WORKER_ID,
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
      worker_id: WORKER_ID,
      retry_count: retry_count,
      event_id: event_id
    })
    eventsFailedTotal.inc()
  } finally {
    endTimer()
    client.release();
  }
}

async function promoteBatch() {
  const client = await pool.connect();
  const endTimer = dbQueryLatencySeconds.startTimer({query: 'claimed_events'})

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
    endTimer()

    if( rowCount > 0 ){
      logger.info({
        service: 'worker',
        component: 'processor',
        msg: 'claimed_for_processing',
        work: 'state_transistion',
        from_state: 'pending',
        to_state: 'processing',
        worker_id: WORKER_ID,
        claimed_count: rowCount,
        claimed_events: rows.map(
          ({event_id, received_at, retry_count})=> 
            ({event_id, received_at, retry_count}))
      })
    }
    return rows;
  } finally {
    endTimer();
    client.release();
  }
}

// Add dead letter to unrecoverable events
async function applyDeadLetter() {
  const client = await pool.connect();
  const endTimer = dbQueryLatencySeconds.startTimer({query: 'apply_dead_letter'})
  try {
    const res = await client.query(
      `
      UPDATE events_staging
      SET dead = true
      WHERE 
        status = 'failed' 
        AND retry_count >= $1 
        AND dead = false

      RETURNING 
        events_staging.event_id, 
        events_staging.error, 
        events_staging.received_at
      `,
      [MAX_RETRIES],
    );
    endTimer()
    if (res.rowCount > USUAL_LIMIT) {
      logger.fatal({
        service: 'worker',
        component: 'dead_letter',
        msg: 'unusual_volume_of_events_marked_dead',
        work: 'state_transistion',
        from_state: 'failed',
        to_state: 'dead',
        worker_id: WORKER_ID,
        dead_count: res.rowCount,
        dead_events: res.rows,
      })
    }
    else if (res.rowCount > 0) {
      logger.error({
        service: 'worker',
        component: 'dead_letter',
        msg: 'events_marked_dead',
        work: 'state_transistion',
        from_state: 'failed',
        to_state: 'dead',
        worker_id: WORKER_ID,
        dead_count: res.rowCount,
        dead_events: res.rows,
      })
    }
    eventsDeadTotal.inc(res.rowCount)
  } finally {
    endTimer()
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
      if(checkDBError(error, {service: 'worker', component: 'worker-loop'})){}
      else if (parentPort) {
        parentPort.postMessage({
          type: "error",
          error: error,
        });

        process.exit(1)
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
  }).listen(METRICS_PORT, ()=>{
    logger.info({
      service: 'worker',
      component: 'worker',
      msg: 'worker_started',
      worker_id: WORKER_ID,
      metrics_on: ` :${METRICS_PORT}`
    });
  })
}

loop()

setInterval(() => {
  activeWorkers.set({ worker_id: WORKER_ID }, 1);
}, 5000);

process.on("uncaughtException", (err) => {
  logger.fatal({
    service: 'worker',
    worker_id: WORKER_ID,
    msg: 'uncaught_exception',
    error: err.message,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({
    service: 'worker',
    worker_id: WORKER_ID,
    msg: 'unhandled_promise_rejection',
    error: String(reason),
  });
  process.exit(1);
});