import { Queue } from 'bullmq';

const connection = {
  host: 'localhost',
  port: 6379,
};

export const csvQueue = new Queue('csv-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 48 * 3600 },
  },
});
