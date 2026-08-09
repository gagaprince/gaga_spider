import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { Chapter } from '../entities/chapter.entity';
import { ChapterImage } from '../entities/chapter-image.entity';
import { Author } from '../entities/author.entity';
import { ResourceAuthor } from '../entities/resource-author.entity';
import { Category } from '../entities/category.entity';
import { ResourceCategory } from '../entities/resource-category.entity';
import { SourceSite } from '../entities/source-site.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceSource,
      Chapter,
      ChapterImage,
      Author,
      ResourceAuthor,
      Category,
      ResourceCategory,
      SourceSite,
    ]),
    SettingsModule,
  ],
  controllers: [ResourceController],
  providers: [ResourceService],
})
export class ResourceModule {}
