import { CsvRow } from './csv-row.model';
import { Product } from '../entities/product.entity';

describe('CsvRow', () => {
  const exchangeRates = { USD: 1, EUR: 0.85, GBP: 0.75, JPY: 110, BRL: 5.5 };
  const sanitize = jest.fn((input: string) => input);

  beforeEach(() => {
    sanitize.mockClear();
  });

  describe('toProduct', () => {
    it('should transform a valid row into a Product', () => {
      const row = new CsvRow('Apple', '1.99', '2023-12-31');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.product).toMatchObject({
        name: 'Apple',
        price: 1.99,
        expiration: '2023-12-31',
        exchangeRates,
      } as Partial<Product>);
      expect(sanitize).toHaveBeenCalledWith('Apple');
    });

    it('should return an error for an empty name', () => {
      const row = new CsvRow('', '1.99', '2023-12-31');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'name' is missing or empty after sanitization",
      );
      expect(sanitize).toHaveBeenCalledWith('');
    });

    it('should return an error for an invalid price', () => {
      const row = new CsvRow('Banana', 'abc', '2023-12-31');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'price' must be a valid non-negative number, got 'abc'",
      );
      expect(sanitize).toHaveBeenCalledWith('Banana');
    });

    it('should return an error for a negative price', () => {
      const row = new CsvRow('Orange', '-1', '2023-12-31');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'price' must be a valid non-negative number, got '-1'",
      );
      expect(sanitize).toHaveBeenCalledWith('Orange');
    });

    it('should return an error for an invalid expiration date', () => {
      const row = new CsvRow('Grape', '2.50', 'invalid-date');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeUndefined();
      expect(result.error).toBe(
        "'expiration' must be a valid date (YYYY-MM-DD), got 'invalid-date'",
      );
      expect(sanitize).toHaveBeenCalledWith('Grape');
    });

    it('should handle optional empty price and expiration', () => {
      const row = new CsvRow('Pear', '', '');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.product).toMatchObject({
        name: 'Pear',
        price: null,
        expiration: null,
        exchangeRates,
      } as Partial<Product>);
      expect(sanitize).toHaveBeenCalledWith('Pear');
    });

    it('should handle price with $ symbol', () => {
      const row = new CsvRow('Mango', '$3.75', '2023-12-31');
      const result = row.toProduct(exchangeRates, sanitize);

      expect(result.product).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.product).toMatchObject({
        name: 'Mango',
        price: 3.75,
        expiration: '2023-12-31',
        exchangeRates,
      } as Partial<Product>);
      expect(sanitize).toHaveBeenCalledWith('Mango');
    });
  });
});
