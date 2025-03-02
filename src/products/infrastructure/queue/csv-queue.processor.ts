import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { ConfigService } from '@nestjs/config';
import { CsvProcessorService } from '../../application/services/csv/csv-processor.service';
import { IExchangeRateService } from '../../application/interfaces/exchange-rate-service.interface';
import { CsvQueueService } from './csv-queue.service';
import { CsvError } from '../../domain/errors/csv-error';

interface SplitCsvJobData {
  filePath: string;
}

interface ChunkJobData {
  filePath: string;
}

interface SplitCsvResult {
  jobIds: string[];
}

interface ChunkResult {
  processed: number;
  errors: CsvError[];
}

@Processor('csv-processing', {
  concurrency: 4,
  limiter: { max: 2, duration: 1000 },
})
export class CsvQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(CsvQueueProcessor.name);
  private readonly chunkSize: number;

  constructor(
    private readonly csvProcessorService: CsvProcessorService,
    @Inject(IExchangeRateService)
    private readonly exchangeRateService: IExchangeRateService,
    private readonly csvQueueService: CsvQueueService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.chunkSize = parseInt(
      this.configService.get<string>('CHUNK_SIZE', '1000000'),
      10,
    );
  }

  async process(
    job: Job<SplitCsvJobData | ChunkJobData>,
  ): Promise<SplitCsvResult | ChunkResult> {
    switch (job.name) {
      case 'split-csv':
        return this.processSplitCsv(job as Job<SplitCsvJobData>);
      case 'process-csv-chunk':
        return this.processChunk(job as Job<ChunkJobData>);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async processSplitCsv(
    job: Job<SplitCsvJobData>,
  ): Promise<SplitCsvResult> {
    const { filePath } = job.data;
    this.logger.log(`Starting CSV split for file: ${filePath}`);

    const chunkDir = this.ensureChunkDirectory();
    const stream = this.createCsvStream(filePath);
    const jobIds: string[] = [];

    let lineCount = 0;
    let chunkIndex = 0;
    let currentChunk: string[] = [];
    let writeStream: fs.WriteStream | null = null;

    try {
      for await (const row of stream as AsyncIterable<string[]>) {
        const rowString = row.join(';');

        if (lineCount === 0) {
          currentChunk.push(rowString);
          lineCount++;
          continue;
        }

        if (lineCount % this.chunkSize === 1) {
          await this.finishChunk(
            writeStream,
            currentChunk,
            chunkDir,
            chunkIndex,
            jobIds,
          );
          currentChunk = [currentChunk[0]];
          writeStream = this.createWriteStream(chunkDir, chunkIndex);
          chunkIndex++;
        }

        currentChunk.push(rowString);
        writeStream!.write(`${rowString}\n`);
        lineCount++;
      }

      await this.finishChunk(
        writeStream,
        currentChunk,
        chunkDir,
        chunkIndex,
        jobIds,
      );
      fs.unlinkSync(filePath);
      this.logger.log(`CSV split into ${jobIds.length} chunks and enqueued`);

      return { jobIds };
    } catch (error) {
      this.logger.error(`Failed to split CSV: ${error.message}`);
      throw error;
    }
  }

  private async processChunk(job: Job<ChunkJobData>): Promise<ChunkResult> {
    const { filePath } = job.data;
    const exchangeRates = await this.exchangeRateService.fetchExchangeRates();
    return this.csvProcessorService.processCsvLines(filePath, exchangeRates);
  }

  private ensureChunkDirectory(): string {
    const chunkDir = path.join(process.cwd(), 'uploads', 'chunks');
    fs.mkdirSync(chunkDir, { recursive: true });
    return chunkDir;
  }

  private createCsvStream(filePath: string): NodeJS.ReadableStream {
    return fs.createReadStream(filePath).pipe(
      parse({
        delimiter: ';',
        cast: false, // Garante que os valores sejam strings
      }),
    );
  }

  private createWriteStream(
    chunkDir: string,
    chunkIndex: number,
  ): fs.WriteStream {
    return fs.createWriteStream(path.join(chunkDir, `chunk-${chunkIndex}.csv`));
  }

  private async finishChunk(
    writeStream: fs.WriteStream | null,
    currentChunk: string[],
    chunkDir: string,
    chunkIndex: number,
    jobIds: string[],
  ): Promise<void> {
    if (writeStream && currentChunk.length > 1) {
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });
      const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
      const jobId = await this.csvQueueService.enqueueProcessChunk(chunkPath);
      jobIds.push(jobId);
    }
  }
}
