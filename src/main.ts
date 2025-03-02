import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { setupSwagger } from '@config/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  app.enableCors({ origin: corsOrigin });
  logger.log(`CORS enabled for origin: ${corsOrigin}`);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  setupSwagger(app, logger);

  const port = configService.get<number>('PORT', 8000);
  await app.listen(port);
  logger.log(`Application is running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('Error during bootstrap:', error);
});
