import { Worker } from 'bullmq';
import { NestFactory } from '@nestjs/core';

import { Logger } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { ProductsService } from '../services/products.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const productsService = app.get(ProductsService);
  const logger = new Logger('CsvWorker');

  const worker = new Worker(
    'csv-processing',
    async (job) => {
      logger.log(`Starting job ${job.id}`);
      const { filePath } = job.data;
      const result = await productsService.processCsv(filePath);
      logger.log(
        `Job ${job.id} completed with ${result.processed} products processed`,
      );
      return result;
    },
    {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${err.message}`);
  });
}

bootstrap();
