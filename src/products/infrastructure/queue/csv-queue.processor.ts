import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { CsvProcessorService } from '../../application/services/csv-processor.service';
import { IExchangeRateService } from '../../application/interfaces/exchange-rate-service.interface';
import { CsvError } from 'csv-parse/.';

@Processor('csv-processing', {
  concurrency: 4,
  limiter: { max: 2, duration: 1000 },
})
export class CsvQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(CsvQueueProcessor.name);

  constructor(
    private readonly csvProcessorService: CsvProcessorService,
    private readonly exchangeRateService: IExchangeRateService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    switch (job.name) {
      case 'split-csv':
        return this.processSplitCsv(job as Job<{ filePath: string }>);
      case 'process-csv-chunk':
        return this.processChunk(job as Job<{ filePath: string }>);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async processSplitCsv(
    job: Job<{ filePath: string }>,
  ): Promise<{ jobIds: string[] }> {
    const { filePath } = job.data;
    this.logger.log(`Starting CSV split for file: ${filePath}`);

    const chunkSize = parseInt(
      this.configService.get('CHUNK_SIZE') || '1000000',
      10,
    );
    const chunkDir = path.join(process.cwd(), 'uploads', 'chunks');
    fs.mkdirSync(chunkDir, { recursive: true });

    const jobs: string[] = [];
    let lineCount = 0;
    let chunkIndex = 0;
    let currentChunk: string[] = [];
    let writeStream: fs.WriteStream | undefined;

    const stream = fs
      .createReadStream(filePath)
      .pipe(parse({ delimiter: ';' }));

    for await (const row of stream) {
      const rowString = row.join(';');
      if (lineCount === 0) {
        currentChunk.push(rowString);
        lineCount++;
        continue;
      }

      if (lineCount % chunkSize === 1) {
        if (writeStream) {
          writeStream.end();
          const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
          jobs.push(await this.enqueueChunk(chunkPath));
          chunkIndex++;
        }
        currentChunk = [currentChunk[0]];
        writeStream = fs.createWriteStream(
          path.join(chunkDir, `chunk-${chunkIndex}.csv`),
        );
      }

      currentChunk.push(rowString);
      writeStream!.write(rowString + '\n');
      lineCount++;
    }

    if (currentChunk.length > 1 && writeStream) {
      writeStream.end();
      const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
      jobs.push(await this.enqueueChunk(chunkPath));
    }

    fs.unlinkSync(filePath);
    this.logger.log(`CSV split into ${jobs.length} chunks and enqueued`);
    return { jobIds: jobs };
  }

  private async enqueueChunk(chunkPath: string): Promise<string> {
    const job = await this.queue.add(
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

  private async processChunk(
    job: Job<{ filePath: string }>,
  ): Promise<{ processed: number; errors: CsvError[] }> {
    const exchangeRates = await this.exchangeRateService.fetchExchangeRates();
    return this.csvProcessorService.processCsvLines(
      job.data.filePath,
      exchangeRates,
    );
  }
}
