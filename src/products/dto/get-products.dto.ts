import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetProductsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsDateString()
  expiration?: string;

  @IsOptional()
  @IsIn(['name', 'price', 'expiration'])
  sortBy?: 'name' | 'price' | 'expiration';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 10; // Padrão: 10 itens por página

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  page: number = 1; // Padrão: primeira página
}
