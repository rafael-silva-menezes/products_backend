import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { CsvError } from '../../domain/errors/csv-error';

@Injectable()
export class CsvQueueService {
  constructor(
    @InjectQueue('csv-processing') private readonly csvQueue: Queue,
  ) {}

  async enqueueSplitCsv(filePath: string): Promise<string> {
    const job = await this.csvQueue.add(
      'split-csv',
      { filePath },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
    return job.id as string;
  }

  async enqueueProcessChunk(chunkPath: string): Promise<string> {
    const job = await this.csvQueue.add(
      'process-csv-chunk',
      { filePath: chunkPath },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return job.id as string;
  }

  async getJobStatus(
    jobId: string,
  ): Promise<{ status: string; processed?: number; errors?: CsvError[] }> {
    const job = await this.csvQueue.getJob(jobId);
    if (!job) {
      throw new BadRequestException(`Job ${jobId} not found`);
    }

    const state = await (job as Job).getState();
    if (state === 'completed') {
      const result = await job.returnvalue;
      return {
        status: 'completed',
        processed: result.processed ?? 0,
        errors: result.errors ?? [],
      };
    }
    if (state === 'failed') {
      return {
        status: 'failed',
        processed: 0,
        errors: [{ line: 0, error: job.failedReason ?? 'Unknown failure' }],
      };
    }
    return { status: state };
  }
}
