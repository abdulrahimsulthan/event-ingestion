const fs = require("fs");
const path = require("path");

const BASE = "../../payloads";
const endpoint = "http://localhost:3000/ingest";

async function sendDir(dir) {
  const files = fs.readdirSync(path.join(__dirname, BASE, dir));

  console.log(`\n== Sending ${dir} ==`);

  for (const f of files) {
    const body = fs.readFileSync(path.join(__dirname, BASE, dir, f), "utf8");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      console.log(f, res.status);
    } catch (err) {
      console.error(f, "NETWORK ERROR", err.message);
    }
  }
}

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node sendPayloads.js <dir>");
  process.exit(1);
}

sendDir(dir);
