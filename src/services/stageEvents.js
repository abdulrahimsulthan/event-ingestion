const { pool, checkDBError } = require("../config/db");
const { producer } = require("../kafka/producer");
const logger = require("../observability/logger");
const { dbQueryLatencySeconds } = require("../observability/metrics");

const stageEvents = async (events) => {
  // single event
  if (events.length == 1) {
    try {
      const [event] = events;
      const message =  [{
        key: event.id,
        value: JSON.stringify(event)
      }]// should be array
      const res = await producer.send({
        topic: 'events_ingest_v1',
        acks: -1,
        messages: message,
      })

      console.log('res', res)
      return true
    } catch (error) {
      return false
    }
  }
    // const [{ id, name, occurred_at, properties }] = events;
    // const endTimer = dbQueryLatencySeconds.startTimer({query: 'events_staging'})
    // try {
    //   await pool.query(
    //     `
    //     INSERT INTO events_staging (event_id, name, occurred_at, properties)
    //     VALUES ($1, $2, $3, $4)
    //     `,
    //     [id, name, occurred_at, properties]
    //   );
    //   endTimer()
    //   return true;
    // } catch (error) {
    //   if (!checkDBError(error, {
    //     service: 'ingestion-api',
    //     component: 'ingest-staging',
    //     event_id: id,
    //   })){
    //     logger.fatal({
    //       service: 'ingestion-api',
    //       component: 'ingest-staging',
    //       event_id: id,
    //       msg: 'unknown_error',
    //       error_code: error.code,
    //       error: error.message,
    //     })
    //   }
    // } finally {
    //   endTimer()
    // }
    //   return false;
    // } 
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
// };

module.exports = stageEvents;
