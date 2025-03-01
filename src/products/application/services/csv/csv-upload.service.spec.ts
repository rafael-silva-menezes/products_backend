import { CsvUploadService } from './csv-upload.service';
import { BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Cache } from 'cache-manager';

describe('CsvUploadService', () => {
  let service: CsvUploadService;
  let mockQueue: Partial<Queue>;
  let mockCacheManager: Partial<Cache>;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job123' }),
    };
    mockCacheManager = {
      del: jest.fn().mockResolvedValue(null),
    };
    service = new CsvUploadService(
      mockQueue as Queue,
      mockCacheManager as Cache,
    );
  });

  describe('uploadCsv', () => {
    it('should throw BadRequestException if file is not provided', async () => {
      await expect(service.uploadCsv(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if file mimetype is not csv', async () => {
      const file = {
        mimetype: 'text/plain',
        path: '/some/path',
      } as Express.Multer.File;
      await expect(service.uploadCsv(file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should enqueue job and return success message and job id', async () => {
      const file = {
        mimetype: 'text/csv',
        path: '/some/path',
      } as Express.Multer.File;
      const result = await service.uploadCsv(file);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'split-csv',
        { filePath: file.path },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      expect(result).toEqual({
        message: 'File upload accepted for processing',
        jobId: 'job123',
      });
    });

    it('should invalidate cache keys if any are present', async () => {
      // Add a cache key to trigger invalidation
      const cacheKey = 'product:1';
      service.addCacheKey(cacheKey);
      const file = {
        mimetype: 'text/csv',
        path: '/some/path',
      } as Express.Multer.File;

      await service.uploadCsv(file);

      expect(mockCacheManager.del).toHaveBeenCalledWith(cacheKey);
    });

    it('should not invalidate cache if there are no cache keys', async () => {
      // Ensure no cache keys were added
      const file = {
        mimetype: 'text/csv',
        path: '/some/path',
      } as Express.Multer.File;
      await service.uploadCsv(file);
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });
  });
});
