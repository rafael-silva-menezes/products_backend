import { Product } from '../../domain/entities/product.entity';
import { GetProductsDto } from '../../presentation/dtos/get-products.dto';

export interface IProductRepository {
  saveProducts(products: Product[]): Promise<void>;
  getProducts(dto: GetProductsDto): Promise<{
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

export const IProductRepository = Symbol('IProductRepository');
