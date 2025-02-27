import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || 'http://localhost:3000',
  });

  const port = configService.get('PORT') || 8000;
  await app.listen(port);
  console.log(`Application is running on port ${port}`);
}
bootstrap();
