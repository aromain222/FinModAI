import pino from 'pino';
import pretty from 'pino-pretty';

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

// In dev, use a sync pretty stream to avoid worker-thread bundling issues in Next
const stream = isProd
  ? pino.destination(1)
  : pretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    });

export const logger = pino(
  {
    level,
  },
  stream
);

export default logger;
