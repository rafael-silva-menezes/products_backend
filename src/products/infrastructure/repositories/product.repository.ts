import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IProductRepository } from '../../application/interfaces/product-repository.interface';
import * as sanitizeHtml from 'sanitize-html';
import { Product } from 'src/products/domain/entities/product.entity';
import { GetProductsDto } from 'src/products/presentation/dtos/get-products.dto';

@Injectable()
export class ProductRepository implements IProductRepository {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async saveProducts(products: Product[]): Promise<void> {
    await this.productsRepository.query(
      `INSERT INTO product (name, price, expiration, "exchangeRates") VALUES ${products.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(',')}`,
      products.flatMap((p) => [
        p.name,
        p.price,
        p.expiration,
        JSON.stringify(p.exchangeRates),
      ]),
    );
  }

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
    const query = this.productsRepository.createQueryBuilder('product');
    if (name) {
      const sanitizedName = sanitizeHtml(name, {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();
      query.andWhere('product.name LIKE :name', { name: `%${sanitizedName}%` });
    }
    if (price !== undefined)
      query.andWhere('product.price = :price', { price });
    if (expiration)
      query.andWhere('product.expiration = :expiration', { expiration });
    if (sortBy)
      query.orderBy(`product.${sortBy}`, order || 'ASC', 'NULLS LAST');

    const totalQuery = query.clone();
    const total = await totalQuery.getCount();

    if (page > 1) {
      const previousPageOffset = (page - 1) * limit;
      const lastIdPreviousPage = await this.productsRepository
        .createQueryBuilder('product')
        .select('product.id')
        .orderBy('product.id', 'ASC')
        .skip(previousPageOffset - 1)
        .take(1)
        .getOne();
      if (lastIdPreviousPage) {
        query.andWhere('product.id > :lastId', {
          lastId: lastIdPreviousPage.id,
        });
      }
    }
    query.take(limit);

    const data = await query.getMany();
    const totalPages = Math.ceil(total / limit);
    return { data, total, page, limit, totalPages };
  }
}
