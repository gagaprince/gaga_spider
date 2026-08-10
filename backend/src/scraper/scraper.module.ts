import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';
import { DongmanhiScraperService } from './dongmanhi/dongmanhi-scraper.service';
import { ScraperController } from './scraper.controller';
import { SourceSite } from '../entities/source-site.entity';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { Chapter } from '../entities/chapter.entity';
import { ChapterImage } from '../entities/chapter-image.entity';
import { Author } from '../entities/author.entity';
import { ResourceAuthor } from '../entities/resource-author.entity';
import { Category } from '../entities/category.entity';
import { ResourceCategory } from '../entities/resource-category.entity';
import { TaskModule } from '../task/task.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SourceSite,
      Resource,
      ResourceSource,
      Chapter,
      ChapterImage,
      Author,
      ResourceAuthor,
      Category,
      ResourceCategory,
    ]),
    forwardRef(() => TaskModule),
    SettingsModule,
  ],
  controllers: [ScraperController],
  providers: [WebtoonsScraperService, DongmanhiScraperService],
  exports: [WebtoonsScraperService, DongmanhiScraperService],
})
export class ScraperModule {}
