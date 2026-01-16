const { pool } = require("../config/db")

const BATCH_SIZE = 100
const FLUSH_MS = 50

// TODO: sinkDB should sink incoming events to events staging and worker will take care of move staging to production events
const sinkDB = async () => {
  if (queue.length == 0) return setTimeout(sinkDB, FLUSH_MS)
  const batch = takeBatch(BATCH_SIZE)

  try {
    await pool.query(
      `
        INSERT INTO events (id, name, occurred_at, properties)
        SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS x(id uuid, name text, occurred_at timestamptz, properties jsonb)
      `,
      [JSON.stringify(batch)]
    )
  } catch (error) {
    console.log(queue, "queue")
    console.log('batch failed, requeueing.', error)
    queue.unshift(...batch)
    console.log(queue, "queue-after")
  }

  setImmediate(sinkDB)
}
