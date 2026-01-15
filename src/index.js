require("dotenv").config();
const express = require("express");
const { pool } = require("./config/db");
const { startMetrics } = require("./services/metrics");
const { queue, takeBatch } = require("./services/queue");
const { trackInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");

const app = express();
startMetrics("ingest");

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
sinkDB()

app.get("/health", async (req, res) => {
  const result = await pool.query("SELECT 1");
  res.json({ status: "ok", db: result.rows[0] });
});

app.get("/count_events", async (req, res)=>{
  const result = await pool.query("SELECT COUNT(*) FROM events;")
  res.json({result})
})

app.post("/ingest", trackInflight, ingest);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
