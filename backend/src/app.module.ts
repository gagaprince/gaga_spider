import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { ScraperModule } from './scraper/scraper.module';
import { ResourceModule } from './resource/resource.module';
import { TaskModule } from './task/task.module';
import { SettingsModule } from './settings/settings.module';
import { BaiduNetdiskModule } from './baidu-netdisk/baidu-netdisk.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SettingsModule,
    TaskModule,
    ScraperModule,
    ResourceModule,
    BaiduNetdiskModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
