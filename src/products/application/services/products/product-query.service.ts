import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { IProductRepository } from '../../interfaces/product-repository.interface';
import { CsvUploadService } from '../csv/csv-upload.service';
import { Product } from '../../../domain/entities/product.entity';
import { GetProductsDto } from '../../../presentation/dtos/get-products.dto';

@Injectable()
export class ProductQueryService {
  private readonly logger = new Logger(ProductQueryService.name);

  constructor(
    @Inject(IProductRepository)
    private readonly productRepository: IProductRepository,
    private readonly csvUploadService: CsvUploadService, // Para rastrear chaves de cache
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getProducts(dto: GetProductsDto): Promise<{
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      name,
      price,
      expiration,
      sortBy,
      order,
      limit = 10,
      page = 1,
    } = dto;
    const cacheKey = `products:${JSON.stringify(dto)}`;
    const cached = await this.cacheManager.get<{
      data: Product[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(cacheKey);
    this.logger.log(`Checking cache with key: ${cacheKey}`);
    if (cached) {
      this.logger.log(
        `Returning cached data: ${JSON.stringify(cached).slice(0, 100)}...`,
      );
      return cached;
    } else {
      this.logger.log(`No cache found for key: ${cacheKey}`);
    }

    const result = await this.productRepository.getProducts(dto);
    try {
      await this.cacheManager.set(cacheKey, result);
      this.logger.log(`Successfully saved to cache with key: ${cacheKey}`);
      this.csvUploadService.addCacheKey(cacheKey); // Rastrear chave para invalidação
      const cachedAfterSet = await this.cacheManager.get(cacheKey);
      this.logger.log(
        `Cache verification after set: ${cachedAfterSet ? 'Found' : 'Not found'}`,
      );
    } catch (cacheError) {
      this.logger.error(`Failed to save to cache: ${cacheError.message}`);
    }
    return result;
  }
}
