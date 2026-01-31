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

pool.on("error", (err) => {
  logger.error({
    service: 'worker',
    component: 'db',
    msg: 'pg_pool_error',
    error: err.message,
  });
});

const errorLevels = {
  'ECONNREFUSED': 'error',
  'ENOTFOUND': 'error',
  'ETIMEDOUT': 'warn',
  'PROTOCOL_CONNECTION_LOST': 'warn',
  42601: 'error' // generic Syntax Error
};
const dbErrorCodes = Object.keys(errorLevels)
const abstractDBErrors = (error, data) => {

  logger[errorLevels[error.code]]({
    msg: 'db_error',
    error_code: error.code,
    error: error.message,
    ...data,
  });
  return true;
};

const checkDBError = (error, data = {}) => {
  if(dbErrorCodes.find((errorCode) => errorCode == error.code)) {
    return abstractDBErrors(error, data)
  }

  return false
}

module.exports = { pool, checkDBError };