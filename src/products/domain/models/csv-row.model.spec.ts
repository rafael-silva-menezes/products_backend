import { CsvRow } from './csv-row.model';
import { Product } from '../../domain/entities/product.entity';

describe('CsvRow', () => {
  const exchangeRates = { USD: 1, EUR: 0.85, GBP: 0.73, JPY: 110, BRL: 5.2 };
  const sanitize = (input: string) => input.replace(/<[^>]+>/g, '').trim(); // Mock simples para sanitização

  describe('toProduct', () => {
    it('should create a product with valid data', () => {
      const csvRow = new CsvRow('Test Product', '123.45', '2025-03-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.product).toEqual({
        name: 'Test Product',
        price: 123.45,
        expiration: '2025-03-01',
        exchangeRates,
      } as Partial<Product>);
    });

    it('should return an error for missing or empty name after sanitization', () => {
      const csvRow = new CsvRow('<script></script>', '123.45', '2025-03-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'name' is missing or empty after sanitization",
      );
    });

    it('should return an error for invalid price format', () => {
      const csvRow = new CsvRow('Test Product', '$abc', '2025-03-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'price' must be a valid non-negative number (e.g., 123.45), got 'abc'",
      );
    });

    it('should return an error for negative price', () => {
      const csvRow = new CsvRow('Test Product', '-123.45', '2025-03-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'price' must be a valid non-negative number (e.g., 123.45), got '-123.45'",
      );
    });

    it('should accept null or empty price as null', () => {
      const csvRow = new CsvRow('Test Product', '', '2025-03-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.product!.price).toBeNull();
    });

    it('should return an error for invalid expiration date format', () => {
      const csvRow = new CsvRow('Test Product', '123.45', '2025-13-01');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'expiration' must be a valid date in YYYY-MM-DD format, got '2025-13-01'",
      );
    });

    it('should return an error for non-existent date', () => {
      const csvRow = new CsvRow('Test Product', '123.45', '2025-02-30');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'expiration' must be a valid date in YYYY-MM-DD format, got '2025-02-30'",
      );
    });

    it('should accept null or empty expiration as null', () => {
      const csvRow = new CsvRow('Test Product', '123.45', '');
      const result = csvRow.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.product!.expiration).toBeNull();
    });
  });
});
