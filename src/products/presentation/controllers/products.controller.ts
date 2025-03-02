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
import { CsvUploadService } from '../../application/services/csv/csv-upload.service';
import { ProductQueryService } from '../../application/services/products/product-query.service';
import { CsvQueueService } from '../../infrastructure/queue/csv-queue.service';
import { Product } from '../../domain/entities/product.entity';
import { GetProductsDto } from '../dtos/get-products.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { CsvError } from '@domain/errors/csv-error';
import { ConfigService } from '@nestjs/config';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

@ApiTags('products')
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
  @ApiOperation({ summary: 'Upload a CSV file with product data' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 202,
    description: 'File upload accepted',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or no file uploaded',
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.csvUploadService.uploadCsv(file);
  }

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of products' })
  @ApiResponse({ status: 200, description: 'List of products', type: Object })
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
  @ApiOperation({ summary: 'Get the status of a CSV upload job' })
  @ApiResponse({ status: 200, description: 'Upload status', type: Object })
  @ApiResponse({ status: 400, description: 'Job not found' })
  async getUploadStatus(
    @Param('id') jobId: string,
  ): Promise<{ status: string; processed?: number; errors?: CsvError[] }> {
    return this.csvQueueService.getJobStatus(jobId);
  }
}
