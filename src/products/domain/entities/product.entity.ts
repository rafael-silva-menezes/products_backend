import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 255 })
  name: string;

  @Index()
  @Column('decimal', { nullable: true })
  price: number | null;

  @Index()
  @Column('text', { nullable: true })
  expiration: string | null;

  @Column('json')
  exchangeRates: { [key: string]: number };
}
