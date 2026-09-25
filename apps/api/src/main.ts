import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('raw', { type: 'audio/*', limit: '10mb' });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Anchor is running on http://localhost:${port}`);
}

bootstrap();
