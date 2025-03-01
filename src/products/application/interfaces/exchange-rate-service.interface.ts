export interface IExchangeRateService {
  fetchExchangeRates(): Promise<{ [key: string]: number }>;
}
