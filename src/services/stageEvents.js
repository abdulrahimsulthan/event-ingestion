const { pool } = require("../config/db");
const logger = require("../observability/logger");

const stageEvents = async (events) => {
  // single event
  if (events.length == 1) {
    const [{ id, name, occurred_at, properties }] = events;
    try {
      await pool.query(
        `
        INSERT INTO events_staging (event_id, name, occurred_at, properties)
        VALUES ($1, $2, $3, $4)
        `,
        [id, name, occurred_at, properties]
      );
      return true;
    } catch (error) {
      if (error.code == 'ECONNREFUSED') {
        logger.warn({
          service: 'ingestion-api',
          component: 'ingest-staging',
          msg: 'db_error',
          error_code: 'ECONNREFUSED',
          event_id: id,
        }) 
      }
      return false;
    }
  }

  // // TODO: batched events
  // else {
  //   try {
  //     await pool.query(
  //       `
  //       INSERT INTO events_staging (event_id, name, occurred_at, properties)
  //       SELECT * FROM jsonb_to_recordset($1::jsonb)
  //       AS x(id uuid, name text, occurred_at timestamptz, properties jsonb)
  //     `,
  //       [JSON.stringify(events)]
  //     );
  //     return true;
  //   } catch (error) {
  //     console.log("Error: batch staging events failed.", error);
  //     return false;
  //   }
  // }
};

module.exports = stageEvents;
