import { Test, TestingModule } from '@nestjs/testing';
import { ProductQueryService } from './product-query.service';
import { IProductRepository } from '../../interfaces/product-repository.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Logger } from '@nestjs/common';
import { CsvUploadService } from '../csv/csv-upload.service';
import { GetProductsDto } from '../../../presentation/dtos/get-products.dto';
import { Product } from '../../../domain/entities/product.entity';

describe('ProductQueryService', () => {
  let service: ProductQueryService;
  let mockProductRepository: jest.Mocked<IProductRepository>;
  let mockCacheManager: jest.Mocked<Cache>;
  let mockCsvUploadService: jest.Mocked<CsvUploadService>;

  const mockProducts: Product[] = [
    {
      id: 1,
      name: 'Apple',
      price: 1.99,
      expiration: '2023-12-31',
      exchangeRates: { USD: 1 },
    },
    {
      id: 2,
      name: 'Banana',
      price: 2.5,
      expiration: '2023-12-31',
      exchangeRates: { USD: 1 },
    },
  ];

  const mockResult = {
    data: mockProducts,
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const mockEmptyResult = {
    data: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  };

  beforeEach(async () => {
    mockProductRepository = {
      saveProducts: jest.fn(),
      getProducts: jest.fn().mockResolvedValue(mockResult),
    } as any;

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockCsvUploadService = {
      uploadCsv: jest.fn(),
      addCacheKey: jest.fn(),
      invalidateProductCache: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductQueryService,
        { provide: IProductRepository, useValue: mockProductRepository },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: CsvUploadService, useValue: mockCsvUploadService },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProductQueryService>(ProductQueryService);
  });

  describe('getProducts', () => {
    it('should get products without cache and save to cache when data is non-empty', async () => {
      const dto: GetProductsDto = { limit: 10, page: 1 };
      const cacheKey = `products:${JSON.stringify(dto)}`;

      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getProducts(dto);

      expect(result).toEqual(mockResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCacheManager.set).toHaveBeenCalledWith(cacheKey, mockResult);
      expect(mockCsvUploadService.addCacheKey).toHaveBeenCalledWith(cacheKey);
    });

    it('should get products without cache and not save to cache when data is empty', async () => {
      const dto: GetProductsDto = { limit: 10, page: 1 };
      const cacheKey = `products:${JSON.stringify(dto)}`;

      mockCacheManager.get.mockResolvedValue(null);
      mockProductRepository.getProducts.mockResolvedValue(mockEmptyResult);

      const result = await service.getProducts(dto);

      expect(result).toEqual(mockEmptyResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
      expect(mockCsvUploadService.addCacheKey).not.toHaveBeenCalled();
    });

    it('should get products from cache when available', async () => {
      const dto: GetProductsDto = { limit: 10, page: 1 };
      const cacheKey = `products:${JSON.stringify(dto)}`;

      mockCacheManager.get.mockResolvedValue(mockResult);

      const result = await service.getProducts(dto);

      expect(result).toEqual(mockResult);
      expect(mockProductRepository.getProducts).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
      expect(mockCsvUploadService.addCacheKey).not.toHaveBeenCalled();
    });

    it('should handle cache set error and still return products', async () => {
      const dto: GetProductsDto = { limit: 10, page: 1 };
      const cacheKey = `products:${JSON.stringify(dto)}`;

      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getProducts(dto);

      expect(result).toEqual(mockResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCacheManager.set).toHaveBeenCalledWith(cacheKey, mockResult);
      expect(mockCsvUploadService.addCacheKey).toHaveBeenCalledWith(cacheKey);
    });

    it('should filter products by name', async () => {
      const dto: GetProductsDto = { name: 'Zu', limit: 10, page: 1 };
      const filteredResult = {
        data: [
          {
            id: 3,
            name: 'Zucchini',
            price: 3.0,
            expiration: '2023-12-31',
            exchangeRates: { USD: 1 },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockProductRepository.getProducts.mockResolvedValue(filteredResult);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getProducts(dto);

      expect(result).toEqual(filteredResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `products:${JSON.stringify(dto)}`,
        filteredResult,
      );
    });

    it('should sort products by name in descending order', async () => {
      const dto: GetProductsDto = {
        sortBy: 'name',
        order: 'DESC',
        limit: 10,
        page: 1,
      };
      const sortedResult = {
        data: [
          {
            id: 2,
            name: 'Banana',
            price: 2.5,
            expiration: '2023-12-31',
            exchangeRates: { USD: 1 },
          },
          {
            id: 1,
            name: 'Apple',
            price: 1.99,
            expiration: '2023-12-31',
            exchangeRates: { USD: 1 },
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockProductRepository.getProducts.mockResolvedValue(sortedResult);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getProducts(dto);

      expect(result).toEqual(sortedResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `products:${JSON.stringify(dto)}`,
        sortedResult,
      );
    });

    it('should paginate products', async () => {
      const dto: GetProductsDto = { limit: 1, page: 2 };
      const paginatedResult = {
        data: [
          {
            id: 2,
            name: 'Banana',
            price: 2.5,
            expiration: '2023-12-31',
            exchangeRates: { USD: 1 },
          },
        ],
        total: 2,
        page: 2,
        limit: 1,
        totalPages: 2,
      };

      mockProductRepository.getProducts.mockResolvedValue(paginatedResult);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getProducts(dto);

      expect(result).toEqual(paginatedResult);
      expect(mockProductRepository.getProducts).toHaveBeenCalledWith(dto);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `products:${JSON.stringify(dto)}`,
        paginatedResult,
      );
    });
  });
});
