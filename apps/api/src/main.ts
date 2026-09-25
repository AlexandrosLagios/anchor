import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app/app.module';

function loadEnv() {
  for (const file of [resolve(process.cwd(), 'apps/api/.env.local'), resolve(process.cwd(), '.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '12mb' });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Anchor is running on http://localhost:${port}`);
}

bootstrap();
