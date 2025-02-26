import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import axios from 'axios';
import * as https from 'https';

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
      .pipe(parse({ columns: true, trim: true, delimiter: ';' }));

    let rowIndex = 0; // Para rastrear a linha problemática
    for await (const row of stream) {
      rowIndex++;

      // Verificar se os campos obrigatórios estão presentes e não são vazios
      if (
        !row.name ||
        row.name.trim() === '' ||
        !row.price ||
        !row.expiration
      ) {
        throw new BadRequestException(
          `CSV is missing required fields in row ${rowIndex}: ${JSON.stringify(row)}`,
        );
      }

      const product = new Product();
      product.name = row.name.trim();

      // Garantir que price seja um número válido
      const priceStr = row.price.replace('$', '').trim();
      const price = parseFloat(priceStr);
      if (isNaN(price)) {
        throw new BadRequestException(
          `Invalid price value "${priceStr}" in row ${rowIndex}`,
        );
      }
      product.price = price;

      // Garantir que expiration seja uma string não vazia
      product.expiration = row.expiration.trim();
      if (product.expiration === '') {
        throw new BadRequestException(
          `Empty expiration value in row ${rowIndex}`,
        );
      }

      product.exchangeRates = exchangeRates;
      products.push(product);
    }

    if (products.length === 0) {
      throw new BadRequestException(
        'CSV file is empty or contains no valid rows',
      );
    }

    await this.productsRepository.save(products, { chunk: 1000 });
    fs.unlinkSync(file.path); // Remove o arquivo temporário após o processamento
  }

  async fetchExchangeRates(): Promise<{ [key: string]: number }> {
    const primaryUrl =
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
    const fallbackUrl =
      'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

    try {
      const response = await axios.get(primaryUrl, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const rates = response.data.usd;
      return {
        USD: rates.usd || 1,
        EUR: rates.eur,
        GBP: rates.gbp,
        JPY: rates.jpy,
        BRL: rates.brl,
      };
    } catch (error) {
      try {
        const response = await axios.get(fallbackUrl, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });
        const rates = response.data.usd;
        return {
          USD: rates.usd || 1,
          EUR: rates.eur,
          GBP: rates.gbp,
          JPY: rates.jpy,
          BRL: rates.brl,
        };
      } catch (fallbackError) {
        throw new BadRequestException('Failed to fetch exchange rates');
      }
    }
  }

  async getProducts(
    name?: string,
    price?: number,
    expiration?: string,
    sortBy?: 'name' | 'price' | 'expiration',
    order?: 'ASC' | 'DESC',
  ): Promise<Product[]> {
    const query = this.productsRepository.createQueryBuilder('product');

    if (name) {
      query.andWhere('product.name LIKE :name', { name: `%${name}%` });
    }
    if (price !== undefined) {
      query.andWhere('product.price = :price', { price });
    }
    if (expiration) {
      query.andWhere('product.expiration = :expiration', { expiration });
    }
    if (sortBy) {
      query.orderBy(`product.${sortBy}`, order || 'ASC', 'NULLS LAST');
    }

    return query.getMany();
  }
}
