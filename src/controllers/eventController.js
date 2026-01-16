const { deductInflight } = require("../middleware/rateLimiter");
const stageEvents = require("../services/stageEvents");

const ingest = async (req, res) => {
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
      // TODO: Assumed single event sent, Yet to handle NDJSON of Batched events
      const event = JSON.parse(Buffer.concat(chunks));

      const { id, name, occurred_at } = event;
      if (!id || !name || !occurred_at) {
        return res.status(400).json({ error: "Invalid payload." });
      }
      const ok = await stageEvents([event])

      if (!ok) {
        return res.status(503).json({
          error: 'service unavailable.'
        })
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
}

module.exports = ingest