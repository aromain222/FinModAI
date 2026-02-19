import { Queue } from 'bullmq';
import logger from './logger';

const connectionUrl = process.env.REDIS_URL;

export const jobQueue = connectionUrl
  ? new Queue('finmodai-jobs', {
      connection: { url: connectionUrl },
    })
  : null;

if (!connectionUrl) {
  logger.debug('[queue] REDIS_URL not set – job queue disabled');
}

export default jobQueue;
