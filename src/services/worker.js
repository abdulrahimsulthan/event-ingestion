const { pool } = require("../config/db");
const { parentPort } = require("worker_threads");

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
  await pool.query(
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
      AND processing_started_at < now() - ($1 || ' milliseconds')::interval;
    `,
    [PROCESSING_TIMEOUT_MS],
  );
}

// Requeue the eligible failed events.
async function retryFailed() {
  await pool.query(
    `
    UPDATE events_staging
    SET
      status = 'pending'
    WHERE
      status = 'failed' 
      AND dead = false 
      AND retry_at <= now()
    `,
  );
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
  } finally {
    client.release();
  }
}

async function promoteBatch() {
  const client = await pool.connect();

  // Claim batch of eligible pending events and move to processing status
  try {
    const { rows } = await client.query(
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

    return rows;
  } finally {
    client.release();
  }
}

// Add dead letter to unrecoverable events
async function applyDeadLetter() {
  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE events_staging
      SET dead = true
      WHERE 
        status = 'failed' 
        AND retry_count >= $1 
        AND dead = false
      `,
      [MAX_RETRIES],
    );
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

loop().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: err.message,
    });
  }
  process.exit(1);
});
