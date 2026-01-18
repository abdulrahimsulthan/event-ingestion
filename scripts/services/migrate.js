require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    // 1. Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.resolve(__dirname, "../../migrations");

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // order matters

    for (const file of migrationFiles) {
      const alreadyApplied = await client.query(
        `SELECT 1 FROM schema_migrations WHERE version = $1`,
        [file]
      );

      if (alreadyApplied.rowCount > 0) {
        console.log(`✓ Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`→ Applying ${file}`);

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [file]
        );
        await client.query("COMMIT");
        console.log(`✓ Applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed: ${file}\n${err.message}`);
      }
    }

    console.log("✅ All migrations are up to date");
  } catch (err) {
    console.error("❌ Migration error");
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
