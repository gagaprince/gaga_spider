import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { ScrapeTask } from '../entities/scrape-task.entity';
import { ScrapeLog } from '../entities/scrape-log.entity';
import { Resource } from '../entities/resource.entity';
import { SourceSite } from '../entities/source-site.entity';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScrapeTask, ScrapeLog, Resource, SourceSite]),
    forwardRef(() => ScraperModule),
  ],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
