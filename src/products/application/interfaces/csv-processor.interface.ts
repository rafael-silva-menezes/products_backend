import { CsvError } from '../../domain/errors/csv-error';

export interface ICsvProcessor {
  processCsvLines(
    filePath: string,
    exchangeRates: { [key: string]: number },
  ): Promise<{ processed: number; errors: CsvError[] }>;
}
