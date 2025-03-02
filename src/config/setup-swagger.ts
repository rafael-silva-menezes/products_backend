import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, Logger } from '@nestjs/common';

export function setupSwagger(app: INestApplication, logger: Logger): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Products API')
    .setDescription('API para upload e consulta de produtos')
    .setVersion('1.0')
    .addTag('products')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'swagger/json',
  });
  logger.log('Swagger documentation available at /api');
}
