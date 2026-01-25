require("dotenv").config();
const express = require("express");
const { pool } = require("./config/db");
const { startMetrics } = require("./services/metrics");
const { trackInflight, deductInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");
const registerWorker = require("./config/worker");
const { client } = require("./observability/metrics");

const app = express();
startMetrics("ingest");
if (process.env.WORKERS_ENABLED === "true") {
  registerWorker();
}

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.use(trackInflight);

app.get("/count-events", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM events;");
    res.json({ result });
  } catch (error) {
    return res.json(503).json({ error: "service unavailable." });
  } finally {
    deductInflight();
  }
});

app.post("/ingest", ingest);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
