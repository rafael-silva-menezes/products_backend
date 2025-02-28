import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { AppDataSource } from './config/data-source';
import { Logger } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async () => {
        const dataSource = await AppDataSource.initialize();
        return dataSource.options;
      },
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get('REDIS_PORT') || '6379', 10),
          password: configService.get('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisConfig = {
          store: redisStore,
          host: String(configService.get('REDIS_HOST')) || 'localhost',
          port: parseInt(configService.get('REDIS_PORT') || '6379', 10),
          password: String(configService.get('REDIS_PASSWORD')) || undefined,
          ttl: parseInt(configService.get('CACHE_TTL_PRODUCTS') || '3600', 10),
        };
        Logger.log(
          `Initializing CacheModule with Redis config: ${JSON.stringify(redisConfig)}`,
          'CacheModule',
        );
        return redisConfig;
      },
      inject: [ConfigService],
    }),
    ProductsModule,
  ],
})
export class AppModule {}
