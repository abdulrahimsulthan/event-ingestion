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

const errorLevels = {
  'ECONNREFUSED': 'error',
  'ENOTFOUND': 'error',
  'ETIMEDOUT': 'warn',
  'PROTOCOL_CONNECTION_LOST': 'warn',
};
const dbErrorCodes = Object.keys(errorLevels)
const abstractDBErrors = (errorCode, service, component) => {

  logger[errorLevels[errorCode]]({
    service,
    component,
    msg: 'db_error',
    error_code: errorCode,
  });
  return true;
};

const checkDBError = (error, {service, component}) => {
  if(dbErrorCodes.find((errorCode) => errorCode == error.code)) {
    return abstractDBErrors(error.code, service, component)
  }

  return false
}

module.exports = { pool, checkDBError };