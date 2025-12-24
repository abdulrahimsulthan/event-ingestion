require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 5432
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    const migrationsDir = path.join(__dirname, "../migrations");
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      const sql = fs.readFileSync(
        path.join(migrationsDir, file),
        "utf8"
      );

      console.log(`Running migration: ${file}`);
      await client.query(sql);
    }

    console.log("Migrations completed successfully");
  } catch (err) {
    console.error("Migration failed", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
