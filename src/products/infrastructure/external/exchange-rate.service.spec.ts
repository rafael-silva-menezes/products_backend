import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRateService } from './exchange-rate.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  exchangeRatePrimaryMock,
  exchangeRateFallbackMock,
} from './exchange-rate.mock';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockCacheManager: jest.Mocked<Cache>;

  const expectedRates = {
    USD: 1,
    EUR: exchangeRatePrimaryMock.usd.eur,
    GBP: exchangeRatePrimaryMock.usd.gbp,
    JPY: exchangeRatePrimaryMock.usd.jpy,
    BRL: exchangeRatePrimaryMock.usd.brl,
  };

  const primaryUrl =
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
  const fallbackUrl =
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'EXCHANGE_RATE_PRIMARY_URL') return primaryUrl;
        if (key === 'EXCHANGE_RATE_FALLBACK_URL') return fallbackUrl;
        return null;
      }),
    } as any;

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);

    jest
      .spyOn(service as any, 'fetchFromApi')
      .mockImplementation((url: string) => {
        if (url === primaryUrl)
          return Promise.resolve({ data: exchangeRatePrimaryMock });
        if (url === fallbackUrl)
          return Promise.resolve({ data: exchangeRateFallbackMock });
        return Promise.reject(new Error('Unknown URL'));
      });
  });

  describe('fetchExchangeRates', () => {
    it('should return cached exchange rates if available', async () => {
      mockCacheManager.get.mockResolvedValue(expectedRates);

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(service['fetchFromApi']).not.toHaveBeenCalled();
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should fetch from primary API and cache rates when no cache exists', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(service['fetchFromApi']).toHaveBeenCalledWith(primaryUrl);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        expectedRates,
      );
    });

    it('should fetch from fallback API when primary fails and cache rates', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      jest
        .spyOn(service as any, 'fetchFromApi')
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Primary API error')),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({ data: exchangeRateFallbackMock }),
        );

      const fallbackRates = {
        USD: 1,
        EUR: exchangeRateFallbackMock.usd.eur,
        GBP: exchangeRateFallbackMock.usd.gbp,
        JPY: exchangeRateFallbackMock.usd.jpy,
        BRL: exchangeRateFallbackMock.usd.brl,
      };

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(fallbackRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(service['fetchFromApi']).toHaveBeenCalledWith(primaryUrl);
      expect(service['fetchFromApi']).toHaveBeenCalledWith(fallbackUrl);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        fallbackRates,
      );
    });

    it('should throw BadRequestException when both APIs fail', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      jest
        .spyOn(service as any, 'fetchFromApi')
        .mockRejectedValueOnce(new Error('Primary API error'))
        .mockRejectedValueOnce(new Error('Fallback API error'));

      await expect(service.fetchExchangeRates()).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(service['fetchFromApi']).toHaveBeenCalledWith(primaryUrl);
      expect(service['fetchFromApi']).toHaveBeenCalledWith(fallbackUrl);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should return rates even if caching fails', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockRejectedValueOnce(new Error('Cache error'));

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(service['fetchFromApi']).toHaveBeenCalledWith(primaryUrl);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        expectedRates,
      );
    });
  });
});
