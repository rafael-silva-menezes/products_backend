import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Product {
  @ApiProperty({ description: 'Unique identifier of the product' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Name of the product', maxLength: 255 })
  @Index()
  @Column({ length: 255 })
  name: string;

  @ApiProperty({ description: 'Price of the product' })
  @Index()
  @Column('decimal')
  price: number;

  @ApiProperty({ description: 'Expiration date in YYYY-MM-DD format' })
  @Index()
  @Column('text')
  expiration: string;

  @ApiProperty({ description: 'Exchange rates for different currencies' })
  @Column('json')
  exchangeRates: { [key: string]: number };
}
