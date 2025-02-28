import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import axios from 'axios';
import * as https from 'https';
import * as sanitizeHtml from 'sanitize-html';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Processor } from '@nestjs/bullmq';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as path from 'path';
import { GetProductsDto } from '../dto/get-products.dto';

@Injectable()
@Processor('csv-processing', {
  concurrency: 4,
  limiter: { max: 2, duration: 1000 },
})
export class ProductsService extends WorkerHost {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectQueue('csv-processing') private csvQueue: Queue,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super();
  }

  async uploadCsv(
    file: Express.Multer.File,
  ): Promise<{ message: string; jobId: string }> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const job = await this.csvQueue.add(
      'split-csv',
      { filePath: file.path },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    this.logger.log(`CSV upload job enqueued with ID: ${job.id}`);
    return {
      message: 'File upload accepted for processing',
      jobId: job.id as string,
    };
  }

  async process(job: Job<any>): Promise<any> {
    switch (job.name) {
      case 'split-csv':
        return this.processSplitCsv(job as Job<{ filePath: string }>);
      case 'process-csv-chunk':
        return this.processChunk(job as Job<{ filePath: string }>);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async processSplitCsv(
    job: Job<{ filePath: string }>,
  ): Promise<{ jobIds: string[] }> {
    const { filePath } = job.data;
    this.logger.log(`Starting CSV split for file: ${filePath}`);

    const chunkSize = parseInt(
      this.configService.get('CHUNK_SIZE') || '1000000',
      10,
    );
    const chunkDir = path.join(process.cwd(), 'uploads', 'chunks');
    fs.mkdirSync(chunkDir, { recursive: true });

    const jobs: string[] = [];
    let lineCount = 0;
    let chunkIndex = 0;
    let currentChunk: string[] = [];
    let writeStream: fs.WriteStream | undefined;

    const stream = fs
      .createReadStream(filePath)
      .pipe(parse({ delimiter: ';' }));

    for await (const row of stream) {
      const rowString = row.join(';');
      if (lineCount === 0) {
        currentChunk.push(rowString);
        lineCount++;
        continue;
      }

      if (lineCount % chunkSize === 1) {
        if (writeStream) {
          writeStream.end();
          const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
          jobs.push(await this.enqueueChunk(chunkPath));
          chunkIndex++;
        }
        currentChunk = [currentChunk[0]];
        writeStream = fs.createWriteStream(
          path.join(chunkDir, `chunk-${chunkIndex}.csv`),
        );
      }

      currentChunk.push(rowString);
      writeStream!.write(rowString + '\n');
      lineCount++;
    }

    if (currentChunk.length > 1 && writeStream) {
      writeStream.end();
      const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
      jobs.push(await this.enqueueChunk(chunkPath));
    }

    fs.unlinkSync(filePath);
    this.logger.log(`CSV split into ${jobs.length} chunks and enqueued`);
    return { jobIds: jobs };
  }

  private async enqueueChunk(chunkPath: string): Promise<string> {
    const job = await this.csvQueue.add(
      'process-csv-chunk',
      { filePath: chunkPath },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return job.id as string;
  }

  private async processChunk(
    job: Job<{ filePath: string }>,
  ): Promise<{ processed: number; errors: string[] }> {
    const { filePath } = job.data;
    this.logger.log(`Starting CSV chunk processing for file: ${filePath}`);

    let exchangeRates: { [key: string]: number };
    const cacheKey = 'exchange_rates';
    const cachedRates = await this.cacheManager.get<{ [key: string]: number }>(
      cacheKey,
    );
    if (cachedRates) {
      exchangeRates = cachedRates;
      this.logger.log('Using cached exchange rates');
    } else {
      try {
        exchangeRates = await this.fetchExchangeRates();
        await this.cacheManager.set(cacheKey, exchangeRates, 3600);
        this.logger.log('Fetched and cached exchange rates');
      } catch (error) {
        this.logger.error(`Failed to fetch exchange rates: ${error.message}`);
        throw new BadRequestException(
          `Failed to fetch exchange rates: ${error.message}`,
        );
      }
    }

    const errors: string[] = [];
    let processed = 0;
    const batchSize = 10000;
    let batch: Product[] = [];
    let rowIndex = 0;

    const stream = fs.createReadStream(filePath).pipe(
      parse({
        delimiter: ';',
        columns: ['name', 'price', 'expiration'],
        trim: true,
        quote: '"',
      }),
    );

    try {
      for await (const row of stream) {
        rowIndex++;
        try {
          const sanitizedName = sanitizeHtml(row.name || '', {
            allowedTags: [],
            allowedAttributes: {},
          }).trim();

          const priceStr = (row.price || '').replace('$', '').trim();
          const price = parseFloat(priceStr);
          const expiration = (row.expiration || '').trim();

          if (!sanitizedName) {
            const errorMsg = `Row ${rowIndex}: 'name' is missing or empty after sanitization`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
            continue;
          }
          if (isNaN(price) || price < 0) {
            const errorMsg = `Row ${rowIndex}: 'price' must be a valid positive number, got '${priceStr}'`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
            continue;
          }
          if (!this.isValidDate(expiration)) {
            const errorMsg = `Row ${rowIndex}: 'expiration' must be a valid date (YYYY-MM-DD), got '${expiration}'`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
            continue;
          }

          const product = new Product();
          product.name = sanitizedName;
          product.price = price;
          product.expiration = expiration;
          product.exchangeRates = exchangeRates;
          batch.push(product);

          if (batch.length >= batchSize) {
            await this.saveBatch(batch, rowIndex, errors);
            processed += batch.length;
            batch = [];
          }
        } catch (rowError) {
          const errorMsg = `Row ${rowIndex}: Processing error - ${rowError.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
          continue;
        }
      }

      if (batch.length > 0) {
        await this.saveBatch(batch, rowIndex, errors);
        processed += batch.length;
      }

      fs.unlinkSync(filePath);
      this.logger.log(
        `CSV chunk processing completed: ${processed} products, ${errors.length} errors`,
      );
    } catch (streamError) {
      this.logger.error(
        `Stream processing failed at row ${rowIndex}: ${streamError.message}`,
      );
      errors.push(
        `Stream processing failed at row ${rowIndex}: ${streamError.message}`,
      );
      fs.unlinkSync(filePath);
    }

    return { processed, errors };
  }

  private async saveBatch(
    batch: Product[],
    rowIndex: number,
    errors: string[],
  ): Promise<void> {
    try {
      await this.productsRepository.query(
        `INSERT INTO product (name, price, expiration, "exchangeRates") VALUES ${batch.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(',')}`,
        batch.flatMap((p) => [
          p.name,
          p.price,
          p.expiration,
          JSON.stringify(p.exchangeRates),
        ]),
      );
      this.logger.log(
        `Saved batch of ${batch.length} products at row ${rowIndex}`,
      );
    } catch (saveError) {
      this.logger.error(
        `Failed to save batch at row ${rowIndex}: ${saveError.message}`,
      );
      errors.push(
        `Failed to save batch at row ${rowIndex}: ${saveError.message}`,
      );
    }
  }

  private isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return (
      !isNaN(date.getTime()) && dateStr === date.toISOString().split('T')[0]
    );
  }

  async fetchExchangeRates(): Promise<{ [key: string]: number }> {
    const cacheKey = 'exchange_rates';
    const cachedRates = await this.cacheManager.get<{ [key: string]: number }>(
      cacheKey,
    );
    if (cachedRates) {
      this.logger.log(
        `Returning cached exchange rates: ${JSON.stringify(cachedRates).slice(0, 100)}...`,
      );
      return cachedRates;
    } else {
      this.logger.log(`No cached exchange rates found for key: ${cacheKey}`);
    }

    const primaryUrl =
      this.configService.get('EXCHANGE_RATE_PRIMARY_URL') ||
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
    const fallbackUrl =
      this.configService.get('EXCHANGE_RATE_FALLBACK_URL') ||
      'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

    let exchangeRates: { [key: string]: number };
    try {
      const response = await axios.get(primaryUrl, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const rates = response.data.usd;
      exchangeRates = {
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
        exchangeRates = {
          USD: rates.usd || 1,
          EUR: rates.eur,
          GBP: rates.gbp,
          JPY: rates.jpy,
          BRL: rates.brl,
        };
      } catch (fallbackError) {
        this.logger.error(
          `Failed to fetch exchange rates: ${fallbackError.message}`,
        );
        throw new BadRequestException('Failed to fetch exchange rates');
      }
    }

    try {
      await this.cacheManager.set(cacheKey, exchangeRates, 3600); // TTL como número
      this.logger.log(
        `Successfully cached exchange rates with key: ${cacheKey}`,
      );
    } catch (cacheError) {
      this.logger.error(
        `Failed to cache exchange rates: ${cacheError.message}`,
      );
    }
    return exchangeRates;
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

    const query = this.productsRepository.createQueryBuilder('product');

    if (name) {
      const sanitizedName = sanitizeHtml(name, {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();
      query.andWhere('product.name LIKE :name', { name: `%${sanitizedName}%` });
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

    this.logger.log(`Executing query with limit=${limit}, page=${page}`);
    const data = await query.getMany();
    const totalPages = Math.ceil(total / limit);
    const result = { data, total, page, limit, totalPages };

    this.logger.log(`Query completed. Total items: ${total}. Saving to cache.`);
    try {
      await this.cacheManager.set(cacheKey, result, 300);
      this.logger.log(`Successfully saved to cache with key: ${cacheKey}`);
      // Verificar se o valor foi realmente salvo
      const cachedAfterSet = await this.cacheManager.get(cacheKey);
      this.logger.log(
        `Cache verification after set: ${cachedAfterSet ? 'Found' : 'Not found'}`,
      );
    } catch (cacheError) {
      this.logger.error(`Failed to save to cache: ${cacheError.message}`);
    }
    return result;
  }

  async getUploadStatus(
    jobId: string,
  ): Promise<{ status: string; result?: any }> {
    const job = await this.csvQueue.getJob(jobId);
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
