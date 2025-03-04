import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { IProductRepository } from '../../interfaces/product-repository.interface';
import { CsvUploadService } from '../csv/csv-upload.service';
import { Product } from '../../../domain/entities/product.entity';
import { GetProductsDto } from '../../../presentation/dtos/get-products.dto';

type ProductsResponse = {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class ProductQueryService {
  private readonly logger = new Logger(ProductQueryService.name);

  constructor(
    @Inject(IProductRepository)
    private readonly productRepository: IProductRepository,
    private readonly csvUploadService: CsvUploadService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getProducts(dto: GetProductsDto): Promise<ProductsResponse> {
    const key = `products:${JSON.stringify(dto)}`;
    const cached = await this.getProductsCached(key);
    if (cached) {
      this.logger.log(`Returning cached data for key: ${key}`);
      return cached;
    } else {
      this.logger.log(`No cache found for key: ${key}`);
    }

    const products = await this.productRepository.getProducts(dto);

    if (products.data.length > 0) {
      await this.setProductsCached(key, products);
      this.logger.log(`Cache set with non-empty result for key: ${key}`);
    } else {
      this.logger.log(`Skipping cache set for empty result at key: ${key}`);
    }

    return products;
  }

  private async getProductsCached(
    key: string,
  ): Promise<ProductsResponse | null> {
    const cached = await this.cacheManager.get<ProductsResponse>(key);
    return cached || null;
  }

  private async setProductsCached(
    key: string,
    value: ProductsResponse,
  ): Promise<void> {
    this.csvUploadService.addCacheKey(key);
    await this.cacheManager.set<ProductsResponse>(key, value);
  }
}
