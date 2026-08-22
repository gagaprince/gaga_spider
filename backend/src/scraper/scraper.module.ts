import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';
import { DongmanhiScraperService } from './dongmanhi/dongmanhi-scraper.service';
import { ManhuazhanScraperService } from './manhuazhan/manhuazhan-scraper.service';
import { NniaoomanScraperService } from './nniaooman/nniaooman-scraper.service';
import { Manhwa18ScraperService } from './manhwa18/manhwa18-scraper.service';
import { DongmanmanhuaScraperService } from './dongmanmanhua/dongmanmanhua-scraper.service';
import { AcgnScraperService } from './acgn/acgn-scraper.service';
import { AntbywScraperService } from './antbyw/antbyw-scraper.service';
import { JcomicScraperService } from './jcomic/jcomic-scraper.service';
import { ScraperInitializer } from './scraper-initializer.service';
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
  providers: [
    WebtoonsScraperService,
    DongmanhiScraperService,
    ManhuazhanScraperService,
    NniaoomanScraperService,
    Manhwa18ScraperService,
    DongmanmanhuaScraperService,
    AcgnScraperService,
    AntbywScraperService,
    JcomicScraperService,
    ScraperInitializer,
  ],
  exports: [
    WebtoonsScraperService,
    DongmanhiScraperService,
    ManhuazhanScraperService,
    NniaoomanScraperService,
    Manhwa18ScraperService,
    DongmanmanhuaScraperService,
    AcgnScraperService,
    AntbywScraperService,
    JcomicScraperService,
  ],
})
export class ScraperModule {}
