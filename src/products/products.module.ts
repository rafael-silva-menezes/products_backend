// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { Product } from './domain/entities/product.entity';
import { ProductsController } from './presentation/controllers/products.controller';
import { CsvUploadService } from './application/services/csv-upload.service';
import { CsvProcessorService } from './application/services/csv-processor.service';
import { ProductQueryService } from './application/services/product-query.service';
import { ProductRepository } from './infrastructure/repositories/product.repository';
import { CsvQueueService } from './infrastructure/queue/csv-queue.service';
import { CsvQueueProcessor } from './infrastructure/queue/csv-queue.processor';
import { ExchangeRateService } from './infrastructure/external/exchange-rate.service';
import { IProductRepository as IProductRepositoryToken } from './application/interfaces/product-repository.interface';
import { IExchangeRateService as IExchangeRateServiceToken } from './application/interfaces/exchange-rate-service.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    BullModule.registerQueue({
      name: 'csv-processing',
    }),
    ConfigModule,
    CacheModule.register(),
  ],
  controllers: [ProductsController],
  providers: [
    CsvUploadService,
    CsvProcessorService,
    ProductQueryService,
    CsvQueueService,
    CsvQueueProcessor,
    ExchangeRateService,
    {
      provide: IProductRepositoryToken,
      useClass: ProductRepository,
    },
    {
      provide: IExchangeRateServiceToken,
      useClass: ExchangeRateService,
    },
  ],
})
export class ProductsModule {}
