import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import * as sanitizeHtml from 'sanitize-html';
import { CsvError } from '../../../domain/errors/csv-error';
import { IProductRepository } from '../../interfaces/product-repository.interface';
import { CsvRow } from '../../../domain/models/csv-row.model';
import { Product } from '../../../domain/entities/product.entity';
import { Readable } from 'stream';

type ProcessResult = {
  processed: number;
  errors: CsvError[];
};

type RawCsvRow = {
  name: string;
  price: string;
  expiration: string;
};

@Injectable()
export class CsvProcessorService {
  private readonly logger = new Logger(CsvProcessorService.name);
  private readonly batchSize = 10000;

  constructor(
    @Inject(IProductRepository)
    private readonly productRepository: IProductRepository,
  ) {}

  async processCsvLines(
    filePath: string,
    exchangeRates: Record<string, number>,
  ): Promise<ProcessResult> {
    this.logger.log(`Starting CSV chunk processing for file: ${filePath}`);
    const result: ProcessResult = { processed: 0, errors: [] };

    const stream = this.createCsvStream(filePath);
    await this.processStream(stream, exchangeRates, result);
    this.cleanupFile(filePath);

    this.logger.log(
      `CSV chunk processing completed: ${result.processed} products processed, ${result.errors.length} errors`,
    );
    return result;
  }

  private createCsvStream(filePath: string): Readable {
    return fs.createReadStream(filePath).pipe(
      parse({
        delimiter: ';',
        columns: ['name', 'price', 'expiration'],
        trim: true,
        quote: '"',
      }),
    );
  }

  private async processStream(
    stream: Readable,
    exchangeRates: Record<string, number>,
    result: ProcessResult,
  ): Promise<void> {
    let batch: Product[] = [];
    let rowIndex = 0;

    try {
      for await (const row of stream as AsyncIterable<RawCsvRow>) {
        rowIndex++;
        this.processRow(row, exchangeRates, rowIndex, batch, result);

        if (batch.length >= this.batchSize) {
          await this.saveBatch(batch, result, rowIndex);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await this.saveBatch(batch, result, rowIndex);
      }
    } catch (streamError) {
      this.handleStreamError(streamError as Error, rowIndex, result);
    }
  }

  private processRow(
    row: RawCsvRow,
    exchangeRates: Record<string, number>,
    rowIndex: number,
    batch: Product[],
    result: ProcessResult,
  ): void {
    try {
      const csvRow = new CsvRow(row.name, row.price, row.expiration);
      const { product, error } = csvRow.toProduct(
        exchangeRates,
        this.sanitizeInput,
      );

      if (error) {
        this.logger.warn(`Line ${rowIndex}: ${error}`);
        result.errors.push({ line: rowIndex, error }); // Sempre adicionar o erro
        return;
      }

      if (product) {
        batch.push(product);
      }
    } catch (rowError) {
      const errorMsg = `Processing error - ${(rowError as Error).message}`;
      this.logger.error(`Line ${rowIndex}: ${errorMsg}`);
      result.errors.push({ line: rowIndex, error: errorMsg }); // Sempre adicionar o erro
    }
  }

  private async saveBatch(
    batch: Product[],
    result: ProcessResult,
    rowIndex: number,
  ): Promise<void> {
    await this.productRepository.saveProducts(batch);
    result.processed += batch.length;
    this.logger.log(
      `Saved batch of ${batch.length} products at row ${rowIndex}`,
    );
  }

  private handleStreamError(
    error: Error,
    rowIndex: number,
    result: ProcessResult,
  ): void {
    const errorMsg = `Stream processing failed: ${error.message}`;
    this.logger.error(
      `Stream processing failed at row ${rowIndex}: ${error.message}`,
    );
    result.errors.push({ line: rowIndex, error: errorMsg }); // Sempre adicionar o erro
  }

  private cleanupFile(filePath: string): void {
    fs.unlinkSync(filePath);
  }

  private sanitizeInput(this: void, input: string): string {
    return sanitizeHtml(input, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();
  }
}
