import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';
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
  ],
  controllers: [ScraperController],
  providers: [WebtoonsScraperService],
})
export class ScraperModule {}
