import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Product } from '../products/entities/product.entity';

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('DATABASE_HOST') || 'postgres',
  port: parseInt(configService.get('DATABASE_PORT') || '5432', 10),
  username: configService.get('DATABASE_USERNAME') || 'postgres',
  password: configService.get('DATABASE_PASSWORD') || 'postgres',
  database: configService.get('DATABASE_NAME') || 'products_db',
  entities: [Product],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
