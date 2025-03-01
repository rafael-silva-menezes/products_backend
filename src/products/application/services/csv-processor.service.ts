import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import * as sanitizeHtml from 'sanitize-html';
import { CsvError } from '../../domain/errors/csv-error';
import { IProductRepository } from '../interfaces/product-repository.interface';
import { CsvRow, Product } from '../../domain/models/csv-row.model';

@Injectable()
export class CsvProcessorService {
  private readonly logger = new Logger(CsvProcessorService.name);

  constructor(private readonly productRepository: IProductRepository) {}

  async processCsvLines(
    filePath: string,
    exchangeRates: { [key: string]: number },
  ): Promise<{ processed: number; errors: CsvError[] }> {
    this.logger.log(`Starting CSV chunk processing for file: ${filePath}`);

    const errors: CsvError[] = [];
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
          const csvRow = new CsvRow(row.name, row.price, row.expiration);
          const { product, error } = csvRow.toProduct(exchangeRates, (input) =>
            sanitizeHtml(input, {
              allowedTags: [],
              allowedAttributes: {},
            }).trim(),
          );

          if (error) {
            this.logger.error(`Line ${rowIndex}: ${error}`);
            errors.push({ line: rowIndex, error });
            continue;
          }

          if (product) {
            batch.push(product);
          }

          if (batch.length >= batchSize) {
            await this.productRepository.saveProducts(batch);
            processed += batch.length;
            batch = [];
            this.logger.log(
              `Saved batch of ${batchSize} products at row ${rowIndex}`,
            );
          }
        } catch (rowError) {
          const errorMsg = `Processing error - ${rowError.message}`;
          this.logger.error(`Line ${rowIndex}: ${errorMsg}`);
          errors.push({ line: rowIndex, error: errorMsg });
          continue;
        }
      }

      if (batch.length > 0) {
        await this.productRepository.saveProducts(batch);
        processed += batch.length;
        this.logger.log(
          `Saved batch of ${batch.length} products at row ${rowIndex}`,
        );
      }

      fs.unlinkSync(filePath);
      this.logger.log(
        `CSV chunk processing completed: ${processed} products processed, ${errors.length} errors`,
      );
    } catch (streamError) {
      this.logger.error(
        `Stream processing failed at row ${rowIndex}: ${streamError.message}`,
      );
      errors.push({
        line: rowIndex,
        error: `Stream processing failed: ${streamError.message}`,
      });
      fs.unlinkSync(filePath);
    }

    return { processed, errors };
  }
}
