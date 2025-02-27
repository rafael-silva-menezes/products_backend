import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import axios from 'axios';
import * as https from 'https';
import * as sanitizeHtml from 'sanitize-html';
import { csvQueue } from '../queues/csv.queue';
import { Logger } from '@nestjs/common';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async uploadCsv(
    file: Express.Multer.File,
  ): Promise<{ message: string; jobId: string }> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const job = await csvQueue.add(
      'process-csv',
      { filePath: file.path },
      { priority: 1 },
    );

    this.logger.log(`CSV upload enqueued with job ID: ${job.id}`);
    return {
      message: 'File upload accepted for processing',
      jobId: job.id as string,
    };
  }

  async processCsv(
    filePath: string,
  ): Promise<{ processed: number; errors: string[] }> {
    this.logger.log(`Starting CSV processing for file: ${filePath}`);
    const products: Product[] = [];
    const exchangeRates = await this.fetchExchangeRates();
    const errors: string[] = [];
    let rowIndex = 0;

    const stream = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, delimiter: ';' }));

    for await (const row of stream) {
      rowIndex++;

      const sanitizedName = sanitizeHtml(row.name || '', {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();

      const priceStr = (row.price || '').replace('$', '').trim();
      const price = parseFloat(priceStr);
      const expiration = (row.expiration || '').trim();

      if (!sanitizedName) {
        errors.push(
          `Row ${rowIndex}: 'name' is missing or empty after sanitization`,
        );
        continue;
      }
      if (isNaN(price) || price < 0) {
        errors.push(
          `Row ${rowIndex}: 'price' must be a valid positive number, got '${priceStr}'`,
        );
        continue;
      }
      if (!this.isValidDate(expiration)) {
        errors.push(
          `Row ${rowIndex}: 'expiration' must be a valid date (YYYY-MM-DD), got '${expiration}'`,
        );
        continue;
      }

      const product = new Product();
      product.name = sanitizedName;
      product.price = price;
      product.expiration = expiration;
      product.exchangeRates = exchangeRates;
      products.push(product);
    }

    if (products.length > 0) {
      await this.productsRepository.save(products, { chunk: 1000 });
      this.logger.log(`Saved ${products.length} products successfully`);
    } else if (errors.length > 0) {
      this.logger.warn('No valid products to save');
    }

    fs.unlinkSync(filePath);
    this.logger.log(
      `CSV processing completed: ${products.length} products, ${errors.length} errors`,
    );
    return {
      processed: products.length,
      errors,
    };
  }

  // Helper to validate date format (YYYY-MM-DD)
  private isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return (
      !isNaN(date.getTime()) && dateStr === date.toISOString().split('T')[0]
    );
  }

  async fetchExchangeRates(): Promise<{ [key: string]: number }> {
    const primaryUrl = process.env.EXCHANGE_RATE_PRIMARY_URL || '';
    const fallbackUrl = process.env.EXCHANGE_RATE_FALLBACK_URL || '';

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
      const sanitizedName = sanitizeHtml(name, {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();
      if (!sanitizedName) {
        throw new BadRequestException(
          "Query parameter 'name' is invalid after sanitization",
        );
      }
      query.andWhere('product.name LIKE :name', { name: `%${sanitizedName}%` });
    }

    if (price !== undefined) {
      if (isNaN(price) || price < 0) {
        throw new BadRequestException(
          "Query parameter 'price' must be a valid positive number",
        );
      }
      query.andWhere('product.price = :price', { price });
    }

    if (expiration) {
      if (!this.isValidDate(expiration)) {
        throw new BadRequestException(
          "Query parameter 'expiration' must be a valid date (YYYY-MM-DD)",
        );
      }
      query.andWhere('product.expiration = :expiration', { expiration });
    }

    if (sortBy && !['name', 'price', 'expiration'].includes(sortBy)) {
      throw new BadRequestException(
        "Query parameter 'sortBy' must be 'name', 'price', or 'expiration'",
      );
    }
    if (order && !['ASC', 'DESC'].includes(order)) {
      throw new BadRequestException(
        "Query parameter 'order' must be 'ASC' or 'DESC'",
      );
    }
    if (sortBy) {
      query.orderBy(`product.${sortBy}`, order || 'ASC', 'NULLS LAST');
    }

    return query.getMany();
  }

  async getUploadStatus(
    jobId: string,
  ): Promise<{ status: string; result?: any }> {
    const job = await csvQueue.getJob(jobId);
    if (!job) {
      throw new BadRequestException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state === 'completed') {
      const result = await job.returnvalue;
      return { status: 'completed', result };
    }
    if (state === 'failed') {
      return { status: 'failed', result: job.failedReason };
    }
    return { status: state };
  }
}
