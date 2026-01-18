require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

async function replay(from, to) {
  if (!from) {
    throw new Error("from date is required");
  }

  const toDate = to || new Date().toISOString();

  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      INSERT INTO events_staging (event_id, name, occurred_at, properties, received_at)
      SELECT
        id,
        name,
        occurred_at,
        properties,
        now()
      FROM events
      WHERE occurred_at >= $1
        AND occurred_at <= $2
      `,
      [from, toDate]
    );

    console.log(`Replayed ${result.rowCount} events`);
  } finally {
    client.release();
    await pool.end();
  }
}

const [, , from, to] = process.argv;

replay(from, to).catch(err => {
  console.error(err.message);
  process.exit(1);
});
