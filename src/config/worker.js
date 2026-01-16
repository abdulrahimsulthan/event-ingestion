const { Worker } = require("worker_threads");
const os = require("os");
const path = require("path");

const registerWorker = () => {
  const WORKER_COUNT = Math.max(1, os.cpus().length - 1);
  console.log("worker count ", WORKER_COUNT);
  const workerPath = path.resolve(__dirname, "../services/worker.js");

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(workerPath);

    worker.on("message", (msg) => {
      if (msg.type === "error") {
        console.error("Worker error:", msg.error);
      }
    });

    worker.on("exit", (code) => {
      console.error("Worker exited", code);
    });
  }
};

module.exports = registerWorker;
