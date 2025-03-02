import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  CsvJobData,
  CsvJobResult,
  CsvUploadResponse,
  ICsvUploadService,
} from '../../interfaces/csv-upload.interface';

@Injectable()
export class CsvUploadService implements ICsvUploadService {
  private readonly logger = new Logger(CsvUploadService.name);
  private productCacheKeys: Set<string> = new Set();
  private readonly queueEvents: QueueEvents;

  constructor(
    @InjectQueue('csv-processing')
    private csvQueue: Queue<CsvJobData, CsvJobResult>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    };
    this.queueEvents = new QueueEvents('csv-processing', {
      connection: redisConfig,
    });
  }

  async uploadCsv(file: Express.Multer.File): Promise<CsvUploadResponse> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const job = await this.csvQueue.add(
      'split-csv',
      { filePath: file.path },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    this.logger.log(`CSV upload job enqueued with ID: ${job.id}`);

    // Use CsvJobResult type explicitly:
    const result = await job.waitUntilFinished(this.queueEvents);
    const jobIds = result.jobIds;

    if (!jobIds || jobIds.length === 0) {
      throw new BadRequestException('No chunk jobs were created');
    }

    await this.invalidateProductCache();
    return {
      message: 'File upload accepted for processing',
      jobIds,
    };
  }

  private async invalidateProductCache(): Promise<void> {
    if (this.productCacheKeys.size === 0) {
      this.logger.log('No product cache keys to invalidate');
      return;
    }
    try {
      for (const key of this.productCacheKeys) {
        await this.cacheManager.del(key);
        this.logger.log(`Cache invalidated for key: ${key}`);
      }
      this.logger.log(
        `Invalidated ${this.productCacheKeys.size} product cache keys`,
      );
      this.productCacheKeys.clear();
    } catch (error: any) {
      this.logger.error(`Failed to invalidate product cache: ${error.message}`);
    }
  }

  // Add explicit return type:
  addCacheKey(key: string): void {
    this.productCacheKeys.add(key);
  }
}
