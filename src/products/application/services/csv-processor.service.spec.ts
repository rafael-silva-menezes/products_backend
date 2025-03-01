// src/products/application/services/csv-processor.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CsvProcessorService } from './csv-processor.service';
import { IProductRepository } from '../interfaces/product-repository.interface';
import * as fs from 'fs';
import { Readable } from 'stream';
import { Logger } from '@nestjs/common';
import { CsvError } from '../../domain/errors/csv-error';
import { Product } from '../../domain/entities/product.entity';

describe('CsvProcessorService', () => {
  let service: CsvProcessorService;
  let mockProductRepository: jest.Mocked<IProductRepository>;

  const exchangeRates = { USD: 1, EUR: 0.85 };
  const mockFilePath = 'test.csv';

  // Mock do ProductRepository
  const mockProductRepo = {
    saveProducts: jest.fn().mockResolvedValue(undefined),
    getProducts: jest.fn(),
  };

  // Mock do fs
  jest.mock('fs');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvProcessorService,
        { provide: IProductRepository, useValue: mockProductRepo },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<CsvProcessorService>(CsvProcessorService);
    mockProductRepository = module.get(IProductRepository);

    // Resetar mocks antes de cada teste
    jest.clearAllMocks();
  });

  describe('processCsvLines', () => {
    it('should process a valid CSV with one line', async () => {
      const mockStream = Readable.from(['Apple;1.99;2023-12-31']);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
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
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          { line: 1, error: "'name' is missing or empty after sanitization" },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should handle an invalid CSV with invalid price', async () => {
      const mockStream = Readable.from(['Banana;abc;2023-12-31']);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          {
            line: 1,
            error: "'price' must be a valid non-negative number, got 'abc'",
          },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should handle an invalid CSV with invalid expiration date', async () => {
      const mockStream = Readable.from(['Grape;2.50;invalid-date']);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({
        processed: 0,
        errors: [
          {
            line: 1,
            error:
              "'expiration' must be a valid date (YYYY-MM-DD), got 'invalid-date'",
          },
        ],
      });
      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should process multiple valid lines and save in batches', async () => {
      const csvContent = [
        'Apple;1.99;2023-12-31',
        'Banana;2.50;2023-12-31',
      ].join('\n');
      const mockStream = Readable.from(csvContent);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await service.processCsvLines(mockFilePath, exchangeRates);

      expect(result).toEqual({ processed: 2, errors: [] });
      expect(mockProductRepository.saveProducts).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Apple',
          price: 1.99,
          expiration: '2023-12-31',
        }),
        expect.objectContaining({
          name: 'Banana',
          price: 2.5,
          expiration: '2023-12-31',
        }),
      ]);
      expect(mockProductRepository.saveProducts).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should handle stream error', async () => {
      const errorMessage = 'ENOENT: no such file or directory';
      jest.spyOn(fs, 'createReadStream').mockImplementation(() => {
        throw new Error(errorMessage);
      });
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      await expect(
        service.processCsvLines(mockFilePath, exchangeRates),
      ).rejects.toMatchObject({
        message: errorMessage,
      });

      expect(mockProductRepository.saveProducts).not.toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
