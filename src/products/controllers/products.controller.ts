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
import { ProductsService } from '../services/products.service';
import { Product } from '../entities/product.entity';
import { GetProductsDto } from '../dto/get-products.dto';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('upload')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1000 * 1024 * 1024 },
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
    return this.productsService.uploadCsv(file);
  }

  @Get()
  async getProducts(
    @Query(ValidationPipe) dto: GetProductsDto,
  ): Promise<{ data: Product[]; total: number }> {
    return this.productsService.getProducts(dto);
  }

  @Get('upload-status/:id')
  async getUploadStatus(@Param('id') jobId: string) {
    return this.productsService.getUploadStatus(jobId);
  }
}
