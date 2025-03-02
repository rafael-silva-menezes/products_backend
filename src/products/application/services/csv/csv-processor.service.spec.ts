import { Test, TestingModule } from '@nestjs/testing';
import { CsvProcessorService } from './csv-processor.service';
import { IProductRepository } from '../../interfaces/product-repository.interface';
import * as fs from 'fs';
import { Readable } from 'stream';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('CsvProcessorService', () => {
  let service: CsvProcessorService;
  let mockProductRepository: jest.Mocked<IProductRepository>;

  const exchangeRates: Record<string, number> = { USD: 1, EUR: 0.85 };
  const mockFilePath = 'test.csv';

  const mockProductRepo = {
    saveProducts: jest
      .fn()
      .mockImplementation(() => Promise.resolve(undefined)),
    getProducts: jest.fn().mockImplementation(() => undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvProcessorService,
        { provide: IProductRepository, useValue: mockProductRepo },
        {
          provide: Logger,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<CsvProcessorService>(CsvProcessorService);
    mockProductRepository = module.get(IProductRepository);

    jest.clearAllMocks();
  });

  describe('processCsvLines', () => {
    it('should process a valid CSV with one line', async () => {
      const mockStream = Readable.from(['Apple;1.99;2023-12-31']);
      jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(() => mockStream as fs.ReadStream);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({ processed: 1, errors: [] });
      expect(mockProductRepository.saveProducts).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Apple',
          price: 1.99,
          expiration: '2023-12-31',
          exchangeRates,
        }),
      ]);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should handle an invalid CSV with empty name', async () => {
      const mockStream = Readable.from([';1.99;2023-12-31']);
      jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(() => mockStream as fs.ReadStream);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          { line: 1, error: "'name' is missing or empty after sanitization" },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
    });

    it('should handle an invalid CSV with invalid price', async () => {
      const mockStream = Readable.from(['Banana;abc;2023-12-31']);
      jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(() => mockStream as fs.ReadStream);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          {
            line: 1,
            error:
              "'price' must be a valid non-negative number (e.g., 123 or 123.45), got 'abc'",
          },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
    });

    it('should handle an invalid CSV with invalid expiration date', async () => {
      const mockStream = Readable.from(['Cherry;2.50;invalid-date']);
      jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(() => mockStream as fs.ReadStream);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          {
            line: 1,
            error:
              "'expiration' must be a valid date in YYYY-MM-DD format (e.g., 2023-12-31), got 'invalid-date'",
          },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
    });
  });
});
