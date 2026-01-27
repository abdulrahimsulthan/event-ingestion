require("dotenv").config();
const express = require("express");
const { trackInflight } = require("./middleware/rateLimiter");
const ingest = require("./controllers/eventController");
const registerWorker = require("./config/worker");
const { client } = require("./observability/metrics");
const logger = require("./observability/logger");

const app = express();
if (process.env.WORKERS_ENABLED === "true") {
  registerWorker();
}

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.post("/ingest", trackInflight, ingest);

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
