const { Pool } = require("pg");
const logger = require("../observability/logger");

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT | 5432, 
  max: 12, // slightly above worker counts
  // TODO: Fix the db connection timeout 
  // idleTimeoutMillis: 30_000,
  // connectionTimeoutMillis: 2000
});

const checkDBError = (error, {service, component}) => {
  if (error.code == 'ECONNREFUSED') {
    logger.warn({
      service,
      component,
      msg: 'db_error',
      error_code: 'ECONNREFUSED',
    }) 
    return true
  }

  return false
  
}

module.exports = { pool, checkDBError };