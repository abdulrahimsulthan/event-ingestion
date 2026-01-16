const { pool } = require("../config/db")

const { parentPort } = require("worker_threads");

const BATCH_SIZE = 100;

async function promoteBatch() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Claim rows
    const { rows } = await client.query(`
      SELECT id, name, occurred_at, received_at, properties
      FROM events_staging
      WHERE status = 'pending'
      ORDER BY received_at
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return 0;
    }

    for (const event of rows) {
      try {
        // 2. Insert into events (idempotent)
        await client.query(`
          INSERT INTO events (id, name, occurred_at, received_at, properties)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [
          event.id,
          event.name,
          event.occurred_at,
          event.received_at,
          event.properties,
        ]);

        // 3. Mark as processed
        await client.query(`
          UPDATE events_staging
          SET status = 'processed'
          WHERE id = $1
        `, [event.id]);

      } catch (err) {
        // 4. Mark as failed
        await client.query(`
          UPDATE events_staging
          SET status = 'failed', error = $2
          WHERE id = $1
        `, [event.id, err.message]);
      }
    }

    await client.query("COMMIT");
    return rows.length;

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function loop() {
  while (true) {
    const count = await promoteBatch();

    if (count === 0) {
      // Backoff when idle
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

loop().catch(err => {
  parentPort.postMessage({ type: "error", error: err.message });
  process.exit(1);
});
