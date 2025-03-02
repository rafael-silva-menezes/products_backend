import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import {
  CurrencyRateMap,
  ExchangeRateResponse,
  IExchangeRateService,
} from '../../application/interfaces/exchange-rate-service.interface';

@Injectable()
export class ExchangeRateService implements IExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async fetchExchangeRates(): Promise<CurrencyRateMap> {
    const cacheKey = 'exchange_rates';
    const cachedRates = await this.cacheManager.get<CurrencyRateMap>(cacheKey);
    if (cachedRates) {
      this.logger.log(
        `Returning cached exchange rates: ${JSON.stringify(cachedRates).slice(0, 100)}...`,
      );
      return cachedRates;
    } else {
      this.logger.log(`No cached exchange rates found for key: ${cacheKey}`);
    }

    const primaryUrl = this.configService.get<string>(
      'EXCHANGE_RATE_PRIMARY_URL',
    );
    const fallbackUrl = this.configService.get<string>(
      'EXCHANGE_RATE_FALLBACK_URL',
    );

    if (!primaryUrl || !fallbackUrl) {
      throw new BadRequestException(
        'Exchange rate URLs are not properly configured',
      );
    }

    let exchangeRates: CurrencyRateMap;
    try {
      exchangeRates = await this.fetchRatesFromUrl(primaryUrl);
    } catch (primaryError) {
      this.logger.error(
        `Primary URL failed: ${primaryError instanceof Error ? primaryError.message : primaryError}`,
      );
      try {
        exchangeRates = await this.fetchRatesFromUrl(fallbackUrl);
      } catch (fallbackError) {
        this.logger.error(
          `Fallback URL also failed: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`,
        );
        throw new BadRequestException('Failed to fetch exchange rates');
      }
    }

    try {
      await this.cacheManager.set(cacheKey, exchangeRates);
      this.logger.log(
        `Successfully cached exchange rates with key: ${cacheKey}`,
      );
    } catch (cacheError) {
      this.logger.error(
        `Failed to cache exchange rates: ${cacheError instanceof Error ? cacheError.message : cacheError}`,
      );
    }
    return exchangeRates;
  }

  private async fetchRatesFromUrl(url: string): Promise<CurrencyRateMap> {
    const response = await this.fetchFromApi(url);
    if (!response.data?.usd) {
      throw new Error('Invalid response structure');
    }
    return this.extractRates(response.data.usd);
  }

  private async fetchFromApi(
    url: string,
  ): Promise<AxiosResponse<ExchangeRateResponse>> {
    return axios.get<ExchangeRateResponse>(url, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  }

  private extractRates(rates: ExchangeRateResponse['usd']): CurrencyRateMap {
    return {
      USD: rates.usd || 1,
      EUR: rates.eur,
      GBP: rates.gbp,
      JPY: rates.jpy,
      BRL: rates.brl,
    };
  }
}
