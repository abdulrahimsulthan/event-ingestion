require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

async function retryFailed () {
  const client = await pool.connect()
  try {
    const res = await client.query(`
      UPDATE events_staging
      SET
        status = 'pending',
        error = NULL
      WHERE 
        dead = false AND status = 'failed'
      `)
    console.log(`Re-enabled ${res.rowCount} failed rows`);
  } finally {
    client.release()
    await pool.end()
  }
}

retryFailed().catch((e)=>{
  console.log(e.message)
  process.exit(1)
})