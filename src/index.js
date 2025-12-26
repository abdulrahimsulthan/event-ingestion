require("dotenv").config();
const express = require("express");
const { v7: uuid } = require("uuid");
const { pool } = require("./db");
const { startMetrics } = require("../metircs");

const app = express();
startMetrics("ingest");

const MAX_INFLIGHT = 50; // hard limit
let inflight = 0;

app.get("/health", async (req, res) => {
  const result = await pool.query("SELECT 1");
  res.json({ status: "ok", db: result.rows[0] });
});

app.get("/count_events", async (req, res)=>{
  const result = await pool.query("SELECT COUNT(*) FROM events;")
  res.json({result})
})

app.post("/ingest", async (req, res) => {
  if (inflight > MAX_INFLIGHT) {
    console.log('overloaded')
    return res.status(429).send("overloaded");
  }

  inflight++;

  const MAX_SIZE = 1024 * 1024 * 25; //25MB
  const chunks = [];
  let size = 0;

  const cleanup = () => {
    if (inflight > 0) inflight--;
  };

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      req.destroy();
    } else {
      chunks.push(chunk);
    }
  });

  req.on("end", async () => {
    try {
      const buf = Buffer.concat(chunks);
      const str = buf.toString("utf8");
      let evt;
      try {
        evt = JSON.parse(str);
      } catch (error) {
        res.status(400).json({ error: "Invalid JSON." });
      }

      const { name, occurredAt, properties } = evt;
      if (!name || !occurredAt) {
        return res.status(400).json({ error: "Invalid payload." });
      }

      const data = await pool.query(
        `
          INSERT INTO events (id, name, occurred_at, properties) 
          VALUES ($1,$2,$3,$4) 
          RETURNING *
        `,
        [uuid(), name, occurredAt, properties]
      );
      res.status(200).json({ data: data.rows });
    } catch (error) {
      console.log("ingest error:", error);
      res.status(500).json({ error: "Internal error." });
    } finally {
      cleanup();
    }
  });

  req.on('error', (error) => {
    console.log('request error: ', error)
    cleanup()
  })

  req.on('close', cleanup)
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
