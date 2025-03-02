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
import { ApiProperty } from '@nestjs/swagger';

export class GetProductsDto {
  @ApiProperty({ description: 'Filter by product name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Filter by product price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @ApiProperty({
    description: 'Filter by expiration date (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  expiration?: string;

  @ApiProperty({
    description: 'Sort field',
    required: false,
    enum: ['name', 'price', 'expiration'],
  })
  @IsOptional()
  @IsIn(['name', 'price', 'expiration'])
  sortBy?: 'name' | 'price' | 'expiration';

  @ApiProperty({
    description: 'Sort order',
    required: false,
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({ description: 'Page number', required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;
}
