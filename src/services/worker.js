const { pool } = require("../config/db");
const { parentPort } = require("worker_threads");

const BATCH_SIZE = 100;
const MAX_RETRIES = 5;

async function promoteOnce({
  staging_id,
  event_id,
  name,
  occurred_at,
  received_at,
  properties,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO events (id, name, occurred_at, received_at, properties)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
      `,
      [event_id, name, occurred_at, received_at, properties]
    );
    await client.query(
      `
      UPDATE events_staging
      SET status = 'processed'
      WHERE staging_id = $1
      `,
      [staging_id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    await pool.query(
      `
      UPDATE events_staging
      SET 
        status = 'failed', 
        error = $1,
        retry_count = retry_count + 1
      WHERE staging_id = $2
      `,
      [error.message, staging_id]
    );
  } finally {
    client.release();
  }
}

async function promoteBatch() {
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      SELECT staging_id, event_id, name, occurred_at, received_at, properties
      FROM events_staging
      WHERE status = 'pending' AND dead = false
      ORDER BY received_at
      FOR UPDATE SKIP LOCKED
      LIMIT $1;
    `,
      [BATCH_SIZE]
    );

    return rows;
  } finally {
    client.release();
  }
}

async function applyDeadLetter() {
  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE events_staging
      SET dead = true
      WHERE status = 'failed' AND retry_count >= $1
      `,
      [MAX_RETRIES]
    );
  } finally {
    client.release();
  }
}

async function loop() {
  while (true) {
    const rows = await promoteBatch();

    if (rows.length == 0) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    for (const row of rows) {
      await promoteOnce(row);
    }

    applyDeadLetter();
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
