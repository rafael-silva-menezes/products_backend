import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column('decimal', { nullable: true })
  price: number | null;

  @Column('text', { nullable: true })
  expiration: string | null;

  @Column('json')
  exchangeRates: { [key: string]: number };
}
