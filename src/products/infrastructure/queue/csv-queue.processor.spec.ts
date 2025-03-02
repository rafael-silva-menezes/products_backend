import { CsvQueueProcessor } from './csv-queue.processor';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

describe('CsvQueueProcessor', () => {
  let csvQueueProcessor: CsvQueueProcessor;
  let csvProcessorService: { processCsvLines: jest.Mock };
  let exchangeRateService: { fetchExchangeRates: jest.Mock };
  let csvQueueService: { enqueueProcessChunk: jest.Mock };
  let configService: { get: jest.Mock };

  const uploadsDir = path.join(process.cwd(), 'uploads', 'chunks');

  beforeEach(() => {
    csvProcessorService = {
      processCsvLines: jest.fn(),
    };
    exchangeRateService = {
      fetchExchangeRates: jest.fn(),
    };
    csvQueueService = {
      enqueueProcessChunk: jest.fn().mockResolvedValue('dummy-job-id'),
    };
    configService = {
      get: jest.fn().mockReturnValue('2'),
    };

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    csvQueueProcessor = new CsvQueueProcessor(
      csvProcessorService as any,
      exchangeRateService as any,
      csvQueueService as any,
      configService as any,
    );

    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  describe('process', () => {
    it('should throw an error for unknown job name', async () => {
      const job = { name: 'unknown-job', data: {} } as Job<any>;
      await expect(csvQueueProcessor.process(job)).rejects.toThrowError(
        'Unknown job name: unknown-job',
      );
    });

    it('should process split-csv job and return jobIds', async () => {
      const tempFilePath = path.join(process.cwd(), 'temp-test.csv');
      const csvContent = [
        'header1;header2',
        'row1col1;row1col2',
        'row2col1;row2col2',
      ].join('\n');

      fs.writeFileSync(tempFilePath, csvContent, 'utf8');

      const job = {
        name: 'split-csv',
        data: { filePath: tempFilePath },
      } as Job<{ filePath: string }>;

      const result = await csvQueueProcessor.process(job);
      expect(csvQueueService.enqueueProcessChunk).toHaveBeenCalledTimes(1);
      expect('jobIds' in result).toBeTruthy();
      expect((result as { jobIds: string[] }).jobIds).toEqual(['dummy-job-id']);
      expect(fs.existsSync(tempFilePath)).toBeFalsy();
    });

    it('should process process-csv-chunk job and return processed count and errors', async () => {
      const dummyExchangeRates = { USD: 1, EUR: 0.9 };
      exchangeRateService.fetchExchangeRates.mockResolvedValue(
        dummyExchangeRates,
      );

      const expectedResult = { processed: 2, errors: [] };
      csvProcessorService.processCsvLines.mockResolvedValue(expectedResult);

      const job = {
        name: 'process-csv-chunk',
        data: { filePath: 'dummy-chunk-file.csv' },
      } as Job<{ filePath: string }>;

      const result = await csvQueueProcessor.process(job);

      expect(exchangeRateService.fetchExchangeRates).toHaveBeenCalled();
      expect(csvProcessorService.processCsvLines).toHaveBeenCalledWith(
        'dummy-chunk-file.csv',
        dummyExchangeRates,
      );
      expect('processed' in result && 'errors' in result).toBeTruthy();
      expect(result).toEqual(expectedResult);
    });
  });
});
