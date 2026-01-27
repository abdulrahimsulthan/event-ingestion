const pino = require('pino')

const logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
});

module.exports = logger