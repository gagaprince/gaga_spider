import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SettingsService } from './settings/settings.service';
import { join, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api', {
    exclude: ['resourceFiles/(.*)'],
  });

  // Serve static resource files (covers, images, etc.)
  const settingsService = app.get(SettingsService);
  const resourcePath = settingsService.resourcePath;
  if (!existsSync(resourcePath)) {
    mkdirSync(resourcePath, { recursive: true });
  }
  app.useStaticAssets(resourcePath, { prefix: '/resourceFiles/' });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
