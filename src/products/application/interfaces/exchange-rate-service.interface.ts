export interface IExchangeRateService {
  fetchExchangeRates(): Promise<{ [key: string]: number }>;
}

export const IExchangeRateService = Symbol('IExchangeRateService');
