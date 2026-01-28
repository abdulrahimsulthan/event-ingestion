require("dotenv").config();
const express = require("express");
const { trackInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");
const registerWorker = require("./config/worker");
const { client } = require("./observability/metrics");
const logger = require("./observability/logger");
const replay = require("../scripts/services/replayEvents");

const app = express();
if (process.env.WORKERS_ENABLED === "true") {
  registerWorker();
}

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.post("/ingest", trackInflight, ingest);
app.post("/replay-events", express.json(),async (req, res) => {
  const {from, to = null} = req.body
  replay(from, to)
  res.status(202).json({message: 'events_replay_scheduled'})
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({
    service: 'ingestion-api',
    component: 'ingest',
    msg: 'ingestion_service_started',
    service_port: `${PORT}`,
    metrics_on: ` :${PORT}/metrics`
  });
});

process.on("uncaughtException", (err) => {
  logger.fatal({
    service: 'ingest-api',
    msg: 'uncaught_exception',
    error: err.message,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({
    service: 'ingest-api',
    msg: 'unhandled_promise_rejection',
    error: String(reason),
  });
  process.exit(1);
});