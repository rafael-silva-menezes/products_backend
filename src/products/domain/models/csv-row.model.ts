import { Product } from '../../domain/entities/product.entity';

export class CsvRow {
  constructor(
    public name: string,
    public price: string | null,
    public expiration: string | null,
  ) {}

  toProduct(
    exchangeRates: { [key: string]: number },
    sanitize: (input: string) => string,
  ): { product?: Product; error?: string } {
    const sanitizedName = sanitize(this.name);
    const priceStr = (this.price || '').replace('$', '').trim();
    const price = priceStr !== '' ? parseFloat(priceStr) : null;
    const expiration = this.expiration ? this.expiration.trim() : null;

    if (!sanitizedName) {
      return { error: "'name' is missing or empty after sanitization" };
    }

    if (priceStr !== '' && (price === null || isNaN(price) || price < 0)) {
      return {
        error: `'price' must be a valid non-negative number, got '${priceStr}'`,
      };
    }

    if (expiration && !this.isValidDate(expiration)) {
      return {
        error: `'expiration' must be a valid date (YYYY-MM-DD), got '${expiration}'`,
      };
    }

    const product = new Product();
    product.name = sanitizedName;
    product.price = price;
    product.expiration = expiration || null;
    product.exchangeRates = exchangeRates;
    return { product };
  }

  private isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return (
      !isNaN(date.getTime()) && dateStr === date.toISOString().split('T')[0]
    );
  }
}
