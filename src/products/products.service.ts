import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import axios from 'axios';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async uploadCsv(file: Express.Multer.File): Promise<void> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const products: Product[] = [];
    const exchangeRates = await this.fetchExchangeRates();

    const stream = fs
      .createReadStream(file.path)
      .pipe(parse({ columns: true, trim: true }));

    for await (const row of stream) {
      if (!row.name || !row.price || !row.expiration) {
        throw new BadRequestException('CSV is missing required fields');
      }

      const product = new Product();
      product.name = row.name;
      product.price = parseFloat(row.price);
      product.expiration = row.expiration;
      product.exchangeRates = exchangeRates;
      products.push(product);
    }

    await this.productsRepository.save(products, { chunk: 1000 });
  }

  async fetchExchangeRates(): Promise<{ [key: string]: number }> {
    try {
      const response = await axios.get(
        'https://api.exchangerate.host/latest?base=USD',
      );
      const rates = response.data.rates;
      return {
        USD: rates.USD || 1,
        EUR: rates.EUR,
        GBP: rates.GBP,
        JPY: rates.JPY,
        BRL: rates.BRL,
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch exchange rates');
    }
  }

  async getProducts(
    name?: string,
    sortBy?: 'name' | 'price' | 'expiration',
    order?: 'ASC' | 'DESC',
  ): Promise<Product[]> {
    const query = this.productsRepository.createQueryBuilder('product');

    if (name) {
      query.where('product.name LIKE :name', { name: `%${name}%` });
    }

    if (sortBy) {
      query.orderBy(`product.${sortBy}`, order || 'ASC');
    }

    return query.getMany();
  }
}
