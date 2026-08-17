import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaiduNetdiskService } from './baidu-netdisk.service';
import { BaiduNetdiskController } from './baidu-netdisk.controller';
import { SettingsModule } from '../settings/settings.module';
import { Resource } from '../entities/resource.entity';
import { ResourceCategory } from '../entities/resource-category.entity';
import { Category } from '../entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceCategory, Category]),
    SettingsModule,
  ],
  controllers: [BaiduNetdiskController],
  providers: [BaiduNetdiskService],
  exports: [BaiduNetdiskService],
})
export class BaiduNetdiskModule {}
