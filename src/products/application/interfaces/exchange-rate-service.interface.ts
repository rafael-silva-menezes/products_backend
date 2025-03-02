export interface IExchangeRateService {
  fetchExchangeRates(): Promise<{ [key: string]: number }>;
}

export const IExchangeRateService = Symbol('IExchangeRateService');

export type ExchangeRateResponse = {
  usd: {
    usd: number;
    eur: number;
    gbp: number;
    jpy: number;
    brl: number;
  };
};

export type CurrencyRateMap = {
  USD: number;
  EUR: number;
  GBP: number;
  JPY: number;
  BRL: number;
};
