import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const config = new DocumentBuilder()
    .setTitle('Products API')
    .setDescription('API para upload e consulta de produtos')
    .setVersion('1.0')
    .build();

  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || 'http://localhost:3000',
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const port = configService.get('PORT') || 8000;
  await app.listen(port);
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT || 8000);
  console.log(`Application is running on port ${process.env.PORT || 8000}`);
}
bootstrap();
