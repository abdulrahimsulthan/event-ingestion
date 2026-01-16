require("dotenv").config();
const express = require("express");
const { pool } = require("./config/db");
const { startMetrics } = require("./services/metrics");
const { trackInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");

const app = express();
startMetrics("ingest");

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
