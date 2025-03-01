// src/products/infrastructure/external/exchange-rate.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRateService } from './exchange-rate.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockCacheManager: jest.Mocked<Cache>;

  const mockRates = {
    usd: { usd: 1, eur: 0.85, gbp: 0.75, jpy: 110, brl: 5.5 },
  };
  const expectedRates = { USD: 1, EUR: 0.85, GBP: 0.75, JPY: 110, BRL: 5.5 };

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

    (axios.get as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);
  });

  describe('fetchExchangeRates', () => {
    it('should return cached exchange rates if available', async () => {
      mockCacheManager.get.mockResolvedValue(expectedRates);

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(axios.get).not.toHaveBeenCalled();
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should fetch from primary API and cache rates when no cache exists', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockRates });

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(axios.get).toHaveBeenCalledWith(primaryUrl, expect.any(Object));
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        expectedRates,
      );
    });

    it('should fetch from fallback API when primary fails and cache rates', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      (axios.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Primary API error'))
        .mockResolvedValueOnce({ data: mockRates });

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(axios.get).toHaveBeenCalledWith(primaryUrl, expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith(fallbackUrl, expect.any(Object));
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        expectedRates,
      );
    });

    it('should throw BadRequestException when both APIs fail', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      (axios.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Primary API error'))
        .mockRejectedValueOnce(new Error('Fallback API error'));

      await expect(service.fetchExchangeRates()).rejects.toThrow(
        new BadRequestException('Failed to fetch exchange rates'),
      );

      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(axios.get).toHaveBeenCalledWith(primaryUrl, expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith(fallbackUrl, expect.any(Object));
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should return rates even if caching fails', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockRates });
      mockCacheManager.set.mockRejectedValueOnce(new Error('Cache error'));

      const result = await service.fetchExchangeRates();

      expect(result).toEqual(expectedRates);
      expect(mockCacheManager.get).toHaveBeenCalledWith('exchange_rates');
      expect(axios.get).toHaveBeenCalledWith(primaryUrl, expect.any(Object));
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'exchange_rates',
        expectedRates,
      );
    });
  });
});
