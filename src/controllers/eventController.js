const { deductInflight } = require("../middleware/rateLimiter");
const { enqueue } = require("../services/queue");
const { v7: uuid } = require("uuid");

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
}

module.exports = ingest