import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import axios from 'axios';
import * as https from 'https';
import { IExchangeRateService } from '../../application/interfaces/exchange-rate-service.interface';

@Injectable()
export class ExchangeRateService implements IExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async fetchExchangeRates(): Promise<{ [key: string]: number }> {
    const cacheKey = 'exchange_rates';
    const cachedRates = await this.cacheManager.get<{ [key: string]: number }>(
      cacheKey,
    );
    if (cachedRates) {
      this.logger.log(
        `Returning cached exchange rates: ${JSON.stringify(cachedRates).slice(0, 100)}...`,
      );
      return cachedRates;
    } else {
      this.logger.log(`No cached exchange rates found for key: ${cacheKey}`);
    }

    const primaryUrl = this.configService.get('EXCHANGE_RATE_PRIMARY_URL');
    const fallbackUrl = this.configService.get('EXCHANGE_RATE_FALLBACK_URL');

    let exchangeRates: { [key: string]: number };
    try {
      const response = await axios.get(primaryUrl, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const rates = response.data.usd;
      exchangeRates = {
        USD: rates.usd || 1,
        EUR: rates.eur,
        GBP: rates.gbp,
        JPY: rates.jpy,
        BRL: rates.brl,
      };
    } catch (error) {
      try {
        const response = await axios.get(fallbackUrl, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });
        const rates = response.data.usd;
        exchangeRates = {
          USD: rates.usd || 1,
          EUR: rates.eur,
          GBP: rates.gbp,
          JPY: rates.jpy,
          BRL: rates.brl,
        };
      } catch (fallbackError) {
        this.logger.error(
          `Failed to fetch exchange rates: ${fallbackError.message}`,
        );
        throw new BadRequestException('Failed to fetch exchange rates');
      }
    }

    try {
      await this.cacheManager.set(cacheKey, exchangeRates);
      this.logger.log(
        `Successfully cached exchange rates with key: ${cacheKey}`,
      );
    } catch (cacheError: any) {
      this.logger.error(
        `Failed to cache exchange rates: ${cacheError.message}`,
      );
    }
    return exchangeRates;
  }
}
