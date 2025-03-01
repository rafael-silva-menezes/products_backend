// src/products/application/services/csv-upload.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CsvUploadService } from './csv-upload.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Logger } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';

describe('CsvUploadService', () => {
  let service: CsvUploadService;
  let mockQueue: jest.Mocked<Queue>;
  let mockCacheManager: jest.Mocked<Cache>;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 100,
    destination: './uploads',
    filename: 'test.csv',
    path: './uploads/test.csv',
    buffer: Buffer.from(''),
    stream: Readable.from([]),
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: '123' }),
    } as any;

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          connection: {
            host: 'localhost',
            port: 6379,
          },
        }),
      ],
      providers: [
        CsvUploadService,
        { provide: getQueueToken('csv-processing'), useValue: mockQueue },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<CsvUploadService>(CsvUploadService);
  });

  describe('uploadCsv', () => {
    it('should upload a valid CSV and invalidate cache', async () => {
      const result = await service.uploadCsv(mockFile);

      expect(result).toEqual({
        message: 'File upload accepted for processing',
        jobId: '123',
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'split-csv',
        { filePath: mockFile.path },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-CSV file', async () => {
      const invalidFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'text/plain',
      };

      await expect(service.uploadCsv(invalidFile)).rejects.toThrow(
        new BadRequestException('Please upload a valid CSV file'),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for undefined file', async () => {
      await expect(service.uploadCsv(undefined as any)).rejects.toThrow(
        new BadRequestException('Please upload a valid CSV file'),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });
  });

  describe('invalidateProductCache', () => {
    it('should invalidate cache with keys', async () => {
      service['addCacheKey']('key1');
      service['addCacheKey']('key2');

      await service['invalidateProductCache']();

      expect(mockCacheManager.del).toHaveBeenCalledWith('key1');
      expect(mockCacheManager.del).toHaveBeenCalledWith('key2');
      expect(mockCacheManager.del).toHaveBeenCalledTimes(2);
      expect(service['productCacheKeys'].size).toBe(0);
    });

    it('should log and return when no cache keys exist', async () => {
      await service['invalidateProductCache']();

      expect(mockCacheManager.del).not.toHaveBeenCalled();
      expect(service['productCacheKeys'].size).toBe(0);
    });

    it('should handle cache invalidation error', async () => {
      service['addCacheKey']('key1');
      mockCacheManager.del.mockRejectedValueOnce(new Error('Cache error'));

      await service['invalidateProductCache']();

      expect(mockCacheManager.del).toHaveBeenCalledWith('key1');
      expect(mockCacheManager.del).toHaveBeenCalledTimes(1);
      expect(service['productCacheKeys'].size).toBe(1);
    });
  });
});
