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
import { ProductsService } from './products.service';
import { Product } from './product.entity';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    await this.productsService.uploadCsv(file);
    return { message: 'File uploaded successfully' };
  }

  @Get()
  async getProducts(
    @Query('name') name: string,
    @Query('sortBy') sortBy: 'name' | 'price' | 'expiration',
    @Query('order') order: 'ASC' | 'DESC',
  ): Promise<Product[]> {
    return this.productsService.getProducts(name, sortBy, order);
  }
}
