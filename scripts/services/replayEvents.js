require("dotenv").config();
const { eventRetriesTotal } = require("../../src/observability/metrics");
const logger = require("../../src/observability/logger");
const { pool, checkDBError } = require("../../src/config/db");


async function replay(from, to) {
  if (!from) {
    throw new Error("from date is required");
  }

  const toDate = to || new Date().toISOString();

  try {
    const result = await pool.query(
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
      
      RETURNING events_staging.event_id
      `,
      [from, toDate]
    );

    const replayedEvents = result.rows.map(({event_id})=>event_id)
    eventRetriesTotal.inc(result.rowCount)
    logger.info({
      component: 'replay',
      msg: 'events_replayed',
      from,
      to: toDate,
      replay_count: result.rowCount,
      replay_events: replayedEvents
    })
    return true
  } catch (error) {
    if (checkDBError(error, {service: 'replay-endpoint', component: 'replay'})){}
    else {
      logger.fatal({
        service: 'replay-endpoint',
        component: 'replay',
        msg: 'unknown_error',
        error_code: error.code,
        error: error.message,
      })
    }
    return false
  }
}

module.exports = replay