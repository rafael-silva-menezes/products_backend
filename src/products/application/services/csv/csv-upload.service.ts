import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CsvUploadService {
  private readonly logger = new Logger(CsvUploadService.name);
  private productCacheKeys: Set<string> = new Set();

  constructor(
    @InjectQueue('csv-processing') private csvQueue: Queue,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async uploadCsv(
    file: Express.Multer.File,
  ): Promise<{ message: string; jobIds: string[] }> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const job = await this.csvQueue.add(
      'split-csv',
      { filePath: file.path },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    this.logger.log(`CSV upload job enqueued with ID: ${job.id}`);

    // Aguarda o job split-csv completar para obter os jobIds dos chunks
    await job.waitUntilFinished(this.csvQueue.events);
    const result = await job.returnvalue;
    const jobIds = result.jobIds as string[];

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
    } catch (error) {
      this.logger.error(`Failed to invalidate product cache: ${error.message}`);
    }
  }

  addCacheKey(key: string) {
    this.productCacheKeys.add(key);
  }
}
