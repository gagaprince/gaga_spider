import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseComicScraper, ScrapeResult } from '../base-comic-scraper';
import { <Site>Parser } from './<site>-parser';
import { SourceSite, SiteResourceType } from '../../entities/source-site.entity';
import { Resource } from '../../entities/resource.entity';
import { ResourceSource } from '../../entities/resource-source.entity';
import { Chapter } from '../../entities/chapter.entity';
import { ChapterImage } from '../../entities/chapter-image.entity';
import { Author } from '../../entities/author.entity';
import { ResourceAuthor } from '../../entities/resource-author.entity';
import { Category } from '../../entities/category.entity';
import { ResourceCategory } from '../../entities/resource-category.entity';
import { ResourceType, ChapterType } from '../../constants/resource-type';
import { AgeRating } from '../../constants/age-rating';
import { TaskService } from '../../task/task.service';
import { SettingsService } from '../../settings/settings.service';
import { existsSync } from 'fs';

@Injectable()
export class <Svc> extends BaseComicScraper {
  protected readonly logger = new Logger(<Svc>.name);
  private readonly parser: <Site>Parser;

  protected get baseUrl(): string { return 'https://<domain>'; }
  protected get rateLimitMs(): number { return 1000; }
  // Adult site only:
  // protected get ageRating(): AgeRating { return AgeRating.ADULT; }

  constructor(
    @InjectRepository(SourceSite) sourceSiteRepo: Repository<SourceSite>,
    @InjectRepository(Resource) resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceSource) resourceSourceRepo: Repository<ResourceSource>,
    @InjectRepository(Chapter) chapterRepo: Repository<Chapter>,
    @InjectRepository(ChapterImage) chapterImageRepo: Repository<ChapterImage>,
    @InjectRepository(Author) authorRepo: Repository<Author>,
    @InjectRepository(ResourceAuthor) resourceAuthorRepo: Repository<ResourceAuthor>,
    @InjectRepository(Category) categoryRepo: Repository<Category>,
    @InjectRepository(ResourceCategory) resourceCategoryRepo: Repository<ResourceCategory>,
    taskService: TaskService,
    settingsService: SettingsService,
  ) {
    super(sourceSiteRepo, resourceRepo, resourceSourceRepo, chapterRepo,
      chapterImageRepo, authorRepo, resourceAuthorRepo, categoryRepo,
      resourceCategoryRepo, taskService, settingsService);
    this.parser = new <Site>Parser();
  }

  // ensureSourceSite MUST be public (called by ScraperInitializer)
  public async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({ where: { domain: '<domain>' } });
    if (!site) {
      site = this.sourceSiteRepo.create({
        name: '<Name>', domain: '<domain>',
        resourceType: SiteResourceType.COMIC,
        ageRating: this.ageRating,
        config: { baseUrl: this.baseUrl },
        rateLimit: this.rateLimitMs, status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
    }
    return site;
  }

  // Implement: scrapeByResourceIdAsync, scrapeOneWithTask, doScrape,
  // discoverCatalog, processCard, saveResource (set ageRating: this.ageRating),
  // saveResourceSource, saveChapter, scrapeChapterImages.
  // Copy from backend/src/scraper/nniaooman/nniaooman-scraper.service.ts.
}
