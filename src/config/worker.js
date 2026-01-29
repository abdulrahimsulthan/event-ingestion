const { Worker } = require("worker_threads");
const os = require("os");
const path = require("path");
const logger = require("../observability/logger");
const { activeWorkers } = require("../observability/metrics");

const registerWorker = () => {
  const WORKER_COUNT = Math.max(1, os.cpus().length - 1);
  logger.info(`worker count ${WORKER_COUNT}`);
  const workerPath = path.resolve(__dirname, "../services/worker.js");

  for (let i = 1; i <= WORKER_COUNT; i++) {
    const worker_id = String(i)
    const worker = new Worker(workerPath, {
      env: {
        ...process.env,
        WORKER_ID: worker_id,
        METRICS_PORT: String(9100 + i),
      }});

    worker.on("message", (msg) => {
      if (msg.type === "error") {
        logger.fatal({
          service: 'worker',
          component: 'worker',
          msg: 'worker_message_error',
          error: msg.error,
          worker_id: worker_id,
        });
      }
    });

    worker.on("exit", (code) => {
      activeWorkers.remove({ worker_id: worker_id });
      logger.info({
        service: 'worker',
        component: 'worker',
        msg: 'worker_exited',
        error: code,
        worker_id: worker_id,
      });
    });
  }
};

module.exports = registerWorker;
