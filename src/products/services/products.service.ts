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

@Injectable()
@Processor('csv-processing', { concurrency: 4 })
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
  ): Promise<{ message: string; jobIds: string[] }> {
    if (!file || !file.mimetype.includes('csv')) {
      throw new BadRequestException('Please upload a valid CSV file');
    }

    const chunkSize = parseInt(
      this.configService.get('CHUNK_SIZE') || '1000000',
      10,
    );
    const chunkDir = path.join(__dirname, '../../uploads/chunks');
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir);

    const jobs: string[] = [];
    let lineCount = 0;
    let chunkIndex = 0;
    let currentChunk: string[] = [];
    let writeStream: fs.WriteStream | undefined; // Inicializado como undefined

    const stream = fs
      .createReadStream(file.path)
      .pipe(parse({ delimiter: ';' }));

    for await (const row of stream) {
      const rowString = row.join(';');
      if (lineCount === 0) {
        // Header row
        currentChunk.push(rowString);
        lineCount++;
        continue;
      }

      if (lineCount % chunkSize === 1) {
        // Finalizar o chunk anterior, se existir
        if (writeStream) {
          writeStream.end();
          const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
          jobs.push(await this.enqueueChunk(chunkPath));
          chunkIndex++;
        }
        // Iniciar novo chunk com o header
        currentChunk = [currentChunk[0]]; // Header
        writeStream = fs.createWriteStream(
          path.join(chunkDir, `chunk-${chunkIndex}.csv`),
        );
      }

      currentChunk.push(rowString);
      writeStream!.write(rowString + '\n'); // Usar ! pois writeStream é garantido após a inicialização
      lineCount++;
    }

    // Finalizar o último chunk, se houver linhas
    if (currentChunk.length > 1 && writeStream) {
      writeStream.end();
      const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
      jobs.push(await this.enqueueChunk(chunkPath));
    }

    fs.unlinkSync(file.path); // Remove o arquivo original
    this.logger.log(`CSV split into ${jobs.length} chunks and enqueued`);
    return { message: 'File upload accepted for processing', jobIds: jobs };
  }

  private async enqueueChunk(chunkPath: string): Promise<string> {
    const job = await this.csvQueue.add(
      'process-csv-chunk',
      { filePath: chunkPath },
      {
        priority: 1,
        attempts: parseInt(this.configService.get('JOB_ATTEMPTS') || '3', 10),
        backoff: {
          type: 'exponential',
          delay: parseInt(
            this.configService.get('JOB_BACKOFF_DELAY') || '1000',
            10,
          ),
        },
      },
    );
    return job.id as string;
  }

  async process(
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
    const batchSize = parseInt(
      this.configService.get('BATCH_SIZE') || '1000',
      10,
    );
    let batch: Product[] = [];
    let rowIndex = 0;

    const stream = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, delimiter: ';' }));

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
          batch.push(product);

          if (batch.length >= batchSize) {
            await this.saveBatch(batch, rowIndex, errors);
            processed += batch.length;
            batch = [];
          }
        } catch (rowError) {
          errors.push(
            `Row ${rowIndex}: Processing error - ${rowError.message}`,
          );
          this.logger.error(
            `Error processing row ${rowIndex}: ${rowError.message}`,
          );
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
      await this.productsRepository.save(batch);
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
    const primaryUrl =
      this.configService.get('EXCHANGE_RATE_PRIMARY_URL') ||
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
    const fallbackUrl =
      this.configService.get('EXCHANGE_RATE_FALLBACK_URL') ||
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
