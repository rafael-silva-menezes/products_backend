import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { Product } from '../products/domain/entities/product.entity';

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get<string>('DATABASE_HOST') || 'localhost',
  port: parseInt(configService.get<string>('DATABASE_PORT') || '5432', 10),
  username: configService.get<string>('DATABASE_USERNAME') || 'postgres',
  password: configService.get<string>('DATABASE_PASSWORD') || 'postgres',
  database: configService.get<string>('DATABASE_NAME') || 'products_db',
  entities: [Product],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
