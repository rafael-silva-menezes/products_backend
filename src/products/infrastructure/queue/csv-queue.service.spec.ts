import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { CsvQueueService } from './csv-queue.service';
import { CsvError } from '@domain/errors/csv-error';

describe('CsvQueueService', () => {
  let service: CsvQueueService;
  let mockQueue: any;

  const mockFilePath = '/path/to/file.csv';
  const mockChunkPath = '/path/to/chunk.csv';
  const mockJobId = 'test-job-id';

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: mockJobId }),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueueSplitCsv', () => {
    it('should add a split-csv job to the queue and return job ID', async () => {
      const result = await service.enqueueSplitCsv(mockFilePath);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'split-csv',
        { filePath: mockFilePath },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      expect(result).toBe(mockJobId);
    });

    it('should handle queue addition error', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(service.enqueueSplitCsv(mockFilePath)).rejects.toThrow(
        'Queue error',
      );
    });
  });

  describe('enqueueProcessChunk', () => {
    it('should add a process-csv-chunk job to the queue and return job ID', async () => {
      const result = await service.enqueueProcessChunk(mockChunkPath);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-csv-chunk',
        { filePath: mockChunkPath },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      expect(result).toBe(mockJobId);
    });

    it('should handle queue addition error', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(service.enqueueProcessChunk(mockChunkPath)).rejects.toThrow(
        'Queue error',
      );
    });
  });

  describe('getJobStatus', () => {
    it('should throw BadRequestException if job is not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      await expect(service.getJobStatus('non-existent-id')).rejects.toThrow(
        new BadRequestException('Job non-existent-id not found'),
      );
      expect(mockQueue.getJob).toHaveBeenCalledWith('non-existent-id');
    });

    it('should return completed status with processed count and no errors', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        returnvalue: { processed: 100, errors: [] },
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus(mockJobId);

      expect(result).toEqual({
        status: 'completed',
        processed: 100,
        errors: [],
      });
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });

    it('should return completed status with processed count and errors', async () => {
      const mockErrors: CsvError[] = [{ line: 1, error: 'Invalid data' }];
      const mockJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        returnvalue: { processed: 50, errors: mockErrors },
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus(mockJobId);

      expect(result).toEqual({
        status: 'completed',
        processed: 50,
        errors: mockErrors,
      });
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });

    it('should return failed status with error information', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: 'Error processing CSV',
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus(mockJobId);

      expect(result).toEqual({
        status: 'failed',
        processed: 0,
        errors: [{ line: 0, error: 'Error processing CSV' }],
      });
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });

    it('should return active status for ongoing job', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('active'),
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus(mockJobId);

      expect(result).toEqual({ status: 'active' });
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });

    it('should return waiting status for queued job', async () => {
      const mockJob = {
        getState: jest.fn().mockResolvedValue('waiting'),
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus(mockJobId);

      expect(result).toEqual({ status: 'waiting' });
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });

    it('should handle error when getting job state', async () => {
      const mockJob = {
        getState: jest.fn().mockRejectedValue(new Error('State error')),
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      await expect(service.getJobStatus(mockJobId)).rejects.toThrow(
        'State error',
      );
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockJobId);
      expect(mockJob.getState).toHaveBeenCalled();
    });
  });
});
