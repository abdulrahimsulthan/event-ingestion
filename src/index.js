require("dotenv").config();
const express = require("express");
const { pool } = require("./config/db");
const { startMetrics } = require("./services/metrics");
const { trackInflight, deductInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");
const registerWorker = require("./config/worker");

const app = express();
startMetrics("ingest");
registerWorker()

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
