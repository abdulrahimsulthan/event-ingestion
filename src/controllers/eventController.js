const { deductInflight } = require("../middleware/rateLimiter");
const { ingestRequestsTotal, ingestRequestsRejectedTotal, ingestRequestDuration } = require("../observability/metrics");
const stageEvents = require("../services/stageEvents");

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
        return res.status(400).json({ error: "Invalid payload." });
      }
      const ok = await stageEvents([event])

      if (!ok) {
        ingestRequestsRejectedTotal.inc()
        return res.status(503).json({
          error: 'service unavailable.'
        })
      }

      res.status(202).json({message: 'event registered'})
    } catch (error) {
      ingestRequestsRejectedTotal.inc()
      console.log("ingest error:", error);
      return res.status(400).json({ error: "Invalid JSON." });
    } finally {
      ingestRequestDuration.observe(Date.now() - start)
      deductInflight();
    }
  });

  req.on('error', (error) => {
    console.log('request error: ', error)
    deductInflight()
  })

  req.on('close', deductInflight)
}

module.exports = ingest