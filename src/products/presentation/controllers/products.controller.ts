// src/products/presentation/controllers/products.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Get,
  Query,
  BadRequestException,
  HttpCode,
  Param,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { CsvUploadService } from '../../application/services/csv-upload.service';
import { ProductQueryService } from '../../application/services/product-query.service';
import { CsvQueueService } from '../../infrastructure/queue/csv-queue.service';
import { Product } from '../../domain/entities/product.entity';
import { GetProductsDto } from '../dtos/get-products.dto';
import { CsvError } from '../../domain/errors/csv-error'; // Tipagem correta

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly csvUploadService: CsvUploadService,
    private readonly productQueryService: ProductQueryService,
    private readonly csvQueueService: CsvQueueService,
  ) {}

  @Post('upload')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.originalname}-${uniqueSuffix}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.includes('csv')) {
          return cb(
            new BadRequestException('Please upload a valid CSV file'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    console.log('File received:', file);
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.csvUploadService.uploadCsv(file);
  }

  @Get()
  async getProducts(@Query(ValidationPipe) dto: GetProductsDto): Promise<{
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.productQueryService.getProducts(dto);
  }

  @Get('upload-status/:id')
  async getUploadStatus(
    @Param('id') jobId: string,
  ): Promise<{ status: string; processed?: number; errors?: CsvError[] }> {
    return this.csvQueueService.getJobStatus(jobId);
  }
}
