import { Queue } from 'bullmq';

const connection = {
  host: 'localhost',
  port: 6379,
};

export const csvQueue = new Queue('csv-processing', { connection });
