import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ProductsService } from './products.service';
import { Product } from './product.entity';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('upload')
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
    await this.productsService.uploadCsv(file);
    return { message: 'File uploaded successfully' };
  }

  @Get()
  async getProducts(
    @Query('name') name: string,
    @Query('price') priceStr: string,
    @Query('expiration') expiration: string,
    @Query('sortBy') sortBy: 'name' | 'price' | 'expiration',
    @Query('order') order: 'ASC' | 'DESC',
  ): Promise<Product[]> {
    const price = priceStr ? parseFloat(priceStr) : undefined;
    if (priceStr && isNaN(price as number)) {
      throw new BadRequestException('Invalid price filter');
    }
    return this.productsService.getProducts(
      name,
      price,
      expiration,
      sortBy,
      order,
    );
  }
}
