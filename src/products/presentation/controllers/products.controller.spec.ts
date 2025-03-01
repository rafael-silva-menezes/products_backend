import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { CsvUploadService } from '../../application/services/csv/csv-upload.service';
import { ProductQueryService } from '../../application/services/products/product-query.service';
import { CsvQueueService } from '../../infrastructure/queue/csv-queue.service';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';

describe('ProductsController', () => {
  let controller: ProductsController;
  let csvUploadService: Partial<CsvUploadService>;
  let productQueryService: Partial<ProductQueryService>;
  let csvQueueService: Partial<CsvQueueService>;

  beforeEach(async () => {
    csvUploadService = {
      uploadCsv: jest
        .fn()
        .mockResolvedValue({ message: 'accepted', jobId: '123' }),
    };
    productQueryService = {
      getProducts: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }),
    };
    csvQueueService = {
      getJobStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: CsvUploadService, useValue: csvUploadService },
        { provide: ProductQueryService, useValue: productQueryService },
        { provide: CsvQueueService, useValue: csvQueueService },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  describe('uploadFile', () => {
    it('should return job info when file is provided', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'test.csv',
        encoding: '7bit',
        mimetype: 'text/csv',
        size: 100,
        destination: '',
        filename: '',
        path: '/tmp/test.csv',
        buffer: Buffer.from('data'),
        stream: new Readable({ read() {} }),
      } as unknown as Express.Multer.File;
      const result = await controller.uploadFile(file);
      expect(csvUploadService.uploadCsv).toHaveBeenCalledWith(file);
      expect(result).toEqual({ message: 'accepted', jobId: '123' });
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProducts', () => {
    it('should return products list from query service', async () => {
      const dto = { page: 1, limit: 10 };
      const expected = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      const result = await controller.getProducts(dto as any);
      expect(productQueryService.getProducts).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('getUploadStatus', () => {
    it('should return upload status from queue service', async () => {
      const jobId = '123';
      const result = await controller.getUploadStatus(jobId);
      expect(csvQueueService.getJobStatus).toHaveBeenCalledWith(jobId);
      expect(result).toEqual({ status: 'completed' });
    });
  });
});
