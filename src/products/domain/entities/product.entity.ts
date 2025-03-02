import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 255 })
  name: string;

  @Index()
  @Column('decimal')
  price: number;

  @Index()
  @Column('text')
  expiration: string;

  @Column('json')
  exchangeRates: { [key: string]: number };
}
