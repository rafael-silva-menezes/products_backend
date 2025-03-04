import { Product } from '../../domain/entities/product.entity';

export class CsvRow {
  constructor(
    public name: string,
    public price: string | null,
    public expiration: string | null,
  ) {}

  toProduct(
    exchangeRates: Record<string, number>,
    sanitize: (input: string) => string,
  ): { product?: Product; error?: string } {
    const sanitizedName = sanitize(this.name).trim();
    const priceStr = (this.price || '').replace('$', '').trim();
    const expiration = this.expiration ? this.expiration.trim() : '';

    if (!sanitizedName) {
      return { error: "'name' is missing or empty after sanitization" };
    }

    const priceRegex = /^\d+(\.\d{1,2})?$/;
    if (!priceStr || !priceRegex.test(priceStr)) {
      return {
        error: `'price' must be a valid non-negative number (e.g., 123 or 123.45), got '${priceStr || 'empty'}'`,
      };
    }
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      return {
        error: `'price' must be a valid non-negative number (e.g., 123 or 123.45), got '${priceStr}'`,
      };
    }

    if (!expiration || !this.isValidDate(expiration)) {
      return {
        error: `'expiration' must be a valid date in YYYY-MM-DD format (e.g., 2023-12-31), got '${expiration || 'empty'}'`,
      };
    }

    const convertedExchangeRates: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(exchangeRates)) {
      convertedExchangeRates[currency] = parseFloat((price * rate).toFixed(2));
    }

    const product = new Product();
    product.name = sanitizedName;
    product.price = price;
    product.expiration = expiration;
    product.exchangeRates = convertedExchangeRates;
    return { product };
  }

  private isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (!regex.test(dateStr)) return false;

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      !isNaN(date.getTime())
    );
  }
}
