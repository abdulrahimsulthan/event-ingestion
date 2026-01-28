const { deductInflight } = require("../middleware/rateLimiter");
const stageEvents = require("../services/stageEvents");
const { ingestRequestsTotal, ingestRequestsRejectedTotal, ingestRequestDuration, ingestRequestsAcceptedTotal, ingestBytesTotal } = require("../observability/metrics");
const logger = require("../observability/logger");


const ingest = async (req, res) => {
  const start = Date.now()
  const MAX_SIZE = 1024 * 1024 * 25; //25MB
  const chunks = [];
  let size = 0;
  ingestRequestsTotal.inc()

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      ingestRequestsRejectedTotal.inc()
      logger.warn({
        service: 'ingestion-api',
        component: 'ingest',
        msg: 'rejected_payload',
        size_bytes: size,
        error_code: 'exceed_payload_size'
      })
      return req.destroy();
    } else {
      chunks.push(chunk);
    }
  });

  req.on("end", async () => {
    try {
      // TODO: Assumed single event sent, Yet to handle NDJSON of Batched events
      const event = JSON.parse(Buffer.concat(chunks));

      const { id, name, occurred_at } = event;
      if (!id || !name || !occurred_at) {
        ingestRequestsRejectedTotal.inc()
        logger.warn({
          service: 'ingestion-api',
          component: 'ingest',
          msg: 'rejected_payload',
          event_id: id,
          size_bytes: size,
          error_code: 'missing_props',
        })
        return res.status(400).json({ error: 'missing required props' });
      }
      const ok = await stageEvents([event])

      if (!ok) {
        ingestRequestsRejectedTotal.inc()
        logger.error({
          service: 'ingestion-api',
          component: 'ingest',
          msg: 'service_unavailable',
          event_id: id,
          size_bytes: size,
          error_code: 'staging_db_failure',
        })
        return res.status(503).json({
          error: 'service unavailable.'
        })
      }

      ingestRequestsAcceptedTotal.inc()
      logger.info({
        service: 'ingestion-api',
        component: 'ingest',
        msg: 'event_accepted',
        event_id: id,
        size_bytes: size,
      })
      res.status(202).json({message: 'event accepted'})
    } catch (error) {
      ingestRequestsRejectedTotal.inc()
      logger.warn({
        service: 'ingestion-api',
        component: 'ingest',
        msg: 'rejected_payload',
        error_code: 'invalid_json',
        size_bytes: size
      })
      return res.status(400).json({ error: "Invalid JSON." });
    } finally {
      ingestBytesTotal.inc(size)
      ingestRequestDuration.observe(Date.now() - start)
      deductInflight();
    }
  });

  req.on('error', deductInflight)
  req.on('close', deductInflight)
}

module.exports = ingest