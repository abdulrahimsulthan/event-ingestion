require("dotenv").config();
const express = require("express");
const { v7: uuid } = require("uuid");
const { pool } = require("./db");
const { startMetrics } = require("./services/metircs");
const { queue, takeBatch, enqueue } = require("./services/queue");

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

const MAX_INFLIGHT = 100; // hard limit
let inflight = 0;

const trackInflight = (req, res, next) => {
  if (inflight > MAX_INFLIGHT) {
    console.log('overloaded')
    return res.status(429).send("overloaded");
  }
  else {
    inflight ++
    next()
  }
}
const deductInflight = () => {
  if (inflight > 0) inflight--;
};



app.get("/health", async (req, res) => {
  const result = await pool.query("SELECT 1");
  res.json({ status: "ok", db: result.rows[0] });
});

app.get("/count_events", async (req, res)=>{
  const result = await pool.query("SELECT COUNT(*) FROM events;")
  res.json({result})
})

app.post("/ingest", trackInflight, async (req, res) => {

  const MAX_SIZE = 1024 * 1024 * 25; //25MB
  const chunks = [];
  let size = 0;

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      return req.destroy();
    } else {
      chunks.push(chunk);
    }
  });

  req.on("end", async () => {
    try {
      const event = JSON.parse(Buffer.concat(chunks));
      const { name, occurred_at } = event;
      if (!name || !occurred_at) {
        return res.status(400).json({ error: "Invalid payload." });
      }
      const ok = enqueue({id: uuid(), ...event})

      if (!ok) {
        return res.status(503).json({error: 'queue full.'})
      }

      res.status(202).json({message: 'event registered'})
    } catch (error) {
      console.log("ingest error:", error);
      return res.status(400).json({ error: "Invalid JSON." });
    } finally {
      deductInflight();
    }
  });

  req.on('error', (error) => {
    console.log('request error: ', error)
    deductInflight()
  })

  req.on('close', deductInflight)
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
