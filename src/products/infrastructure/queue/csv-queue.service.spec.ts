import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { CsvQueueService } from './csv-queue.service';
import { CsvError } from '../../domain/errors/csv-error';

describe('CsvQueueService', () => {
  let service: CsvQueueService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvQueueService,
        {
          provide: getQueueToken('csv-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<CsvQueueService>(CsvQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueueSplitCsv', () => {
    it('should add a split-csv job to the queue', async () => {
      const jobId = 'test-job-id';
      mockQueue.add.mockResolvedValue({ id: jobId });

      const filePath = '/path/to/file.csv';
      const result = await service.enqueueSplitCsv(filePath);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'split-csv',
        { filePath },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      expect(result).toBe(jobId);
    });
  });

  describe('enqueueProcessChunk', () => {
    it('should add a process-csv-chunk job to the queue', async () => {
      const jobId = 'test-job-id';
      mockQueue.add.mockResolvedValue({ id: jobId });

      const chunkPath = '/path/to/chunk.csv';
      const result = await service.enqueueProcessChunk(chunkPath);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-csv-chunk',
        { filePath: chunkPath },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      expect(result).toBe(jobId);
    });
  });

  describe('getJobStatus', () => {
    it('should throw BadRequestException if job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      await expect(service.getJobStatus('non-existent-id')).rejects.toThrow(
        new BadRequestException('Job non-existent-id not found'),
      );
    });

    it('should return completed status with processed count and errors', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        returnvalue: { processed: 100, errors: [] },
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-id');

      expect(result).toEqual({
        status: 'completed',
        processed: 100,
        errors: [],
      });
    });

    it('should return failed status with error information', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: 'Error processing CSV',
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-id');

      expect(result).toEqual({
        status: 'failed',
        processed: 0,
        errors: [{ line: 0, error: 'Error processing CSV' }],
      });
    });

    it('should return just the status for other states', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('active'),
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-id');

      expect(result).toEqual({
        status: 'active',
      });
    });
  });
});
