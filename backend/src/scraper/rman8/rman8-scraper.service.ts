import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseComicScraper, ScrapeResult } from '../base-comic-scraper';
import { Rman8Parser } from './rman8-parser';
import {
  SourceSite,
  SiteResourceType,
} from '../../entities/source-site.entity';
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
export class Rman8ScraperService extends BaseComicScraper {
  protected readonly logger = new Logger(Rman8ScraperService.name);
  private readonly parser: Rman8Parser;

  protected get baseUrl(): string {
    return 'https://rman8.com';
  }

  protected get rateLimitMs(): number {
    return 800;
  }

  protected get ageRating(): AgeRating {
    return AgeRating.ADULT;
  }

  protected get referer(): string {
    return 'https://rman8.com/';
  }

  constructor(
    @InjectRepository(SourceSite)
    sourceSiteRepo: Repository<SourceSite>,
    @InjectRepository(Resource)
    resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceSource)
    resourceSourceRepo: Repository<ResourceSource>,
    @InjectRepository(Chapter)
    chapterRepo: Repository<Chapter>,
    @InjectRepository(ChapterImage)
    chapterImageRepo: Repository<ChapterImage>,
    @InjectRepository(Author)
    authorRepo: Repository<Author>,
    @InjectRepository(ResourceAuthor)
    resourceAuthorRepo: Repository<ResourceAuthor>,
    @InjectRepository(Category)
    categoryRepo: Repository<Category>,
    @InjectRepository(ResourceCategory)
    resourceCategoryRepo: Repository<ResourceCategory>,
    taskService: TaskService,
    settingsService: SettingsService,
  ) {
    super(
      sourceSiteRepo,
      resourceRepo,
      resourceSourceRepo,
      chapterRepo,
      chapterImageRepo,
      authorRepo,
      resourceAuthorRepo,
      categoryRepo,
      resourceCategoryRepo,
      taskService,
      settingsService,
    );
    this.parser = new Rman8Parser();
  }

  protected async fetchPage(
    url: string,
  ): Promise<{ html: string; url: string }> {
    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.http.fetch(url, {
          Referer: this.referer,
        });
        if (result.status === 200 && result.body.length >= 1000) {
          await this.sleep(this.rateLimitMs);
          return { html: result.body, url: result.url || url };
        }
        lastError = `status=${result.status}, size=${result.body.length}${
          result.error ? `, error=${result.error}` : ''
        }`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < 3) await this.sleep(1000 * attempt);
    }

    throw new Error(`抓取失败: ${url}, ${lastError}`);
  }

  async scrapeByResourceIdAsync(
    resourceId: number,
    maxChapters = 0,
  ): Promise<{ taskId: number }> {
    const site = await this.ensureSourceSite();
    const stopped = await this.taskService.stopRunningTasks(
      resourceId,
      undefined,
      site.id,
    );
    if (stopped.length > 0) {
      this.logger.log(
        `已停止 ${stopped.length} 个旧任务,重新开始抓取 resourceId=${resourceId}`,
      );
    }

    const rs = await this.resourceSourceRepo.findOne({
      where: { resourceId, sourceSiteId: site.id },
    });
    if (!rs) {
      throw new Error(`资源 ${resourceId} 没有关联的来源记录`);
    }

    const bookId = rs.sourceId;
    const task = await this.taskService.create({
      resourceId,
      sourceSiteId: site.id,
      config: { bookId, maxChapters },
    });
    this.scrapeOneWithTask(task.id, bookId, maxChapters).catch(() => {});
    return { taskId: task.id };
  }

  async scrapeOneWithTask(
    taskId: number,
    bookId: string,
    maxChapters = 0,
  ): Promise<ScrapeResult> {
    this.logger.log(`[任务 ${taskId}] 开始抓取 bookId=${bookId}`);
    await this.taskService.markRunning(taskId);

    try {
      const result = await this.doScrape(taskId, bookId, maxChapters);
      await this.taskService.markSuccess(
        taskId,
        result.chapters.length,
        result.chapters.reduce((sum, chapter) => sum + chapter.imageCount, 0),
      );
      this.logger.log(`[任务 ${taskId}] 抓取完成`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.taskService.isCancelled(taskId)) {
        this.logger.log(`[任务 ${taskId}] 任务已停止`);
      } else {
        this.logger.error(`[任务 ${taskId}] 抓取失败: ${message}`);
        await this.taskService.markFailed(taskId, message);
      }
      throw error;
    }
  }

  async discoverCatalog(
    taskId?: number,
  ): Promise<{ discovered: number; new: number }> {
    this.logger.log('开始抓取肉漫屋目录...');
    const site = await this.ensureSourceSite();

    let discovered = 0;
    let newCount = 0;
    const seenIds = new Set<string>();

    const firstUrl = `${this.baseUrl}/bookcatalog/all/ob/time/st/all`;
    const { html: firstHtml } = await this.fetchPage(firstUrl);
    const totalPages = this.parser.parseLastPage(firstHtml);
    this.logger.log(`共 ${totalPages} 页`);
    if (taskId) {
      await this.taskService.log(taskId, 'info', `共 ${totalPages} 页`);
    }

    for (let page = 1; page <= totalPages; page++) {
      if (taskId) this.checkCancelled(taskId);
      const pageUrl =
        page === 1
          ? firstUrl
          : `${this.baseUrl}/bookcatalog/all/ob/time/st/all/page/${page}`;
      this.logger.log(`第 ${page}/${totalPages} 页: ${pageUrl}`);

      let html: string;
      try {
        const result =
          page === 1 ? { html: firstHtml } : await this.fetchPage(pageUrl);
        html = result.html;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`第 ${page} 页抓取失败,跳过继续: ${message}`);
        if (taskId) {
          await this.taskService.log(
            taskId,
            'warn',
            `第 ${page} 页抓取失败,已跳过: ${message}`,
          );
        }
        continue;
      }

      const cards = this.parser.parseComicCards(html);
      for (const card of cards) {
        if (taskId) this.checkCancelled(taskId);
        try {
          const result = await this.processCard(card, site, seenIds);
          if (result === 'new') newCount++;
          if (result !== 'dup') discovered++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`作品 ${card.bookId} 处理失败,跳过: ${message}`);
          if (taskId) {
            await this.taskService.log(
              taskId,
              'warn',
              `作品 ${card.bookId} 处理失败: ${message}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `目录抓取完成: 共发现 ${discovered} 部, 新增 ${newCount} 部`,
    );
    return { discovered, new: newCount };
  }

  private async processCard(
    card: ReturnType<Rman8Parser['parseComicCards']>[0],
    site: SourceSite,
    seenIds: Set<string>,
  ): Promise<'new' | 'existing' | 'dup'> {
    if (seenIds.has(card.bookId)) return 'dup';
    seenIds.add(card.bookId);

    const existing = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: card.bookId },
    });

    if (!existing) {
      let resource = await this.resourceRepo.findOne({
        where: { title: card.title, type: ResourceType.COMIC },
      });

      if (!resource) {
        const localCover = await this.downloadCover(
          card.bookId,
          card.coverUrl,
          'other',
        );
        resource = this.resourceRepo.create({
          type: ResourceType.COMIC,
          ageRating: this.ageRating,
          title: card.title,
          coverUrl: card.coverUrl,
          localCoverPath: localCover,
          status: 'unknown',
          language: 'zh-cn',
          isComplete: 0,
          category: null,
          extra: { updateDate: card.updateDate },
        });
        resource = await this.resourceRepo.save(resource);
      } else if (
        !this.coverFileExists(resource.localCoverPath) &&
        card.coverUrl
      ) {
        const localCover = await this.downloadCover(
          card.bookId,
          card.coverUrl,
          'other',
        );
        if (localCover) {
          resource.localCoverPath = localCover;
          if (!resource.coverUrl) resource.coverUrl = card.coverUrl;
          await this.resourceRepo.save(resource);
        }
      }

      await this.resourceSourceRepo.save({
        resourceId: resource.id,
        sourceSiteId: site.id,
        sourceUrl: card.detailUrl,
        sourceId: card.bookId,
        rawTitle: card.title,
        scrapeStatus: 'idle',
      });

      return 'new';
    }

    if (existing.resourceId) {
      const resource = await this.resourceRepo.findOne({
        where: { id: existing.resourceId },
      });
      if (
        resource &&
        !this.coverFileExists(resource.localCoverPath) &&
        card.coverUrl
      ) {
        const localCover = await this.downloadCover(
          card.bookId,
          card.coverUrl,
          'other',
        );
        if (localCover) {
          resource.localCoverPath = localCover;
          if (!resource.coverUrl) resource.coverUrl = card.coverUrl;
          await this.resourceRepo.save(resource);
        }
      }
    }

    return 'existing';
  }

  private async doScrape(
    taskId: number,
    bookId: string,
    maxChapters: number,
  ): Promise<ScrapeResult> {
    this.checkCancelled(taskId);
    const site = await this.ensureSourceSite();
    const detailUrl = `${this.baseUrl}/readbooks/${bookId}.html`;

    this.logger.log(`[任务 ${taskId}] 详情页: ${detailUrl}`);
    await this.taskService.log(taskId, 'info', `抓取详情页: ${detailUrl}`);

    const { html: detailHtml } = await this.fetchPage(detailUrl);
    const detail = this.parser.parseDetail(detailHtml);
    this.logger.log(
      `[任务 ${taskId}] 漫画: ${detail.title}, 作者: ${detail.authors.join(', ')}, 标签: ${detail.genres.join(', ')}`,
    );

    const resource = await this.saveResource(detail, detailUrl, bookId);
    await this.saveResourceSource(
      site,
      resource,
      bookId,
      detailUrl,
      detail.status,
    );
    await this.saveAuthors(resource, detail.authors);
    for (const genre of detail.genres) {
      await this.saveCategory(resource, genre);
    }
    if (detail.genres.length > 0) {
      resource.category = detail.genres[0];
      await this.resourceRepo.save(resource);
    }

    await this.taskService['taskRepo'].update(taskId, {
      resourceId: resource.id,
    });

    const chapters = this.parser.parseChapterList(detailHtml, detail.title);
    this.logger.log(`[任务 ${taskId}] 总章节数: ${chapters.length}`);

    const chaptersToScrape =
      maxChapters > 0 ? chapters.slice(0, maxChapters) : chapters;

    await this.taskService.log(
      taskId,
      'info',
      `准备抓取 ${chaptersToScrape.length} 章`,
    );
    await this.taskService['taskRepo'].update(taskId, {
      totalItems: chaptersToScrape.length,
    });

    const result: ScrapeResult = {
      resource: { id: resource.id, title: resource.title },
      chapters: [],
    };

    for (let index = 0; index < chaptersToScrape.length; index++) {
      this.checkCancelled(taskId);
      const chapterItem = chaptersToScrape[index];
      this.logger.log(
        `[任务 ${taskId}] (${index + 1}/${chaptersToScrape.length}) ${chapterItem.title}`,
      );

      const chapter = await this.saveChapter(
        resource,
        site,
        index + 1,
        chapterItem,
      );
      if (!chapter) continue;

      const imageCount = await this.scrapeChapterImages(
        taskId,
        bookId,
        chapter,
        this.buildViewerUrl(chapterItem.viewerUrl),
      );
      result.chapters.push({
        id: chapter.id,
        title: chapter.title,
        imageCount,
      });
      await this.taskService['taskRepo'].update(taskId, {
        doneItems: index + 1,
        totalItems: chaptersToScrape.length,
      });
    }

    resource.chapterCount = await this.chapterRepo.count({
      where: { resourceId: resource.id },
    });
    await this.resourceRepo.save(resource);
    return result;
  }

  private async saveResource(
    detail: ReturnType<Rman8Parser['parseDetail']>,
    detailUrl: string,
    bookId: string,
  ): Promise<Resource> {
    let resource = await this.resourceRepo.findOne({
      where: { title: detail.title, type: ResourceType.COMIC },
    });
    const extra = {
      detailUrl,
      broadCategory: detail.broadCategory || undefined,
    };

    if (!resource) {
      const localCover = await this.downloadCover(
        bookId,
        detail.coverUrl,
        detail.genres[0] || 'other',
      );
      resource = this.resourceRepo.create({
        type: ResourceType.COMIC,
        ageRating: this.ageRating,
        title: detail.title,
        summary: detail.summary,
        coverUrl: detail.coverUrl,
        localCoverPath: localCover,
        status: detail.status,
        language: 'zh-cn',
        isComplete: detail.status === 'completed' ? 1 : 0,
        category: detail.genres[0] || null,
        extra,
      });
      resource = await this.resourceRepo.save(resource);
      this.logger.log(`创建资源: ${resource.title} (id=${resource.id})`);
    } else {
      resource.summary = detail.summary;
      resource.coverUrl = detail.coverUrl;
      resource.status = detail.status;
      resource.isComplete = detail.status === 'completed' ? 1 : 0;
      resource.category = detail.genres[0] || resource.category;
      resource.extra = { ...(resource.extra || {}), ...extra };
      if (!this.coverFileExists(resource.localCoverPath) && detail.coverUrl) {
        const localCover = await this.downloadCover(
          bookId,
          detail.coverUrl,
          detail.genres[0] || 'other',
        );
        if (localCover) resource.localCoverPath = localCover;
      }
      resource = await this.resourceRepo.save(resource);
    }

    return resource;
  }

  private async saveResourceSource(
    site: SourceSite,
    resource: Resource,
    bookId: string,
    detailUrl: string,
    status: string,
  ): Promise<void> {
    let source = await this.resourceSourceRepo.findOne({
      where: { resourceId: resource.id, sourceSiteId: site.id },
    });

    if (!source) {
      source = this.resourceSourceRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        sourceUrl: detailUrl,
        sourceId: bookId,
        rawTitle: resource.title,
      });
    }

    source.lastScrapedAt = new Date();
    source.scrapeStatus = 'running';
    source.isCompleted = status === 'completed' ? 1 : 0;
    await this.resourceSourceRepo.save(source);
  }

  private async saveChapter(
    resource: Resource,
    site: SourceSite,
    orderIndex: number,
    chapterItem: ReturnType<Rman8Parser['parseChapterList']>[0],
  ): Promise<Chapter | null> {
    let entity = await this.chapterRepo.findOne({
      where: { resourceId: resource.id, sourceSiteId: site.id, orderIndex },
    });

    if (!entity) {
      entity = this.chapterRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        orderIndex,
        title: chapterItem.title,
        chapterType: ChapterType.IMAGE,
        sourceUrl: this.buildViewerUrl(chapterItem.viewerUrl),
        extra: { chapterId: chapterItem.chapterId },
      });
      entity = await this.chapterRepo.save(entity);
    }

    return entity;
  }

  private buildViewerUrl(viewerUrl: string): string {
    if (viewerUrl.startsWith('http')) return viewerUrl;
    if (viewerUrl.startsWith('/')) return `${this.baseUrl}${viewerUrl}`;
    return `${this.baseUrl}/${viewerUrl}`;
  }

  private async scrapeChapterImages(
    taskId: number,
    bookId: string,
    chapter: Chapter,
    viewerUrl: string,
  ): Promise<number> {
    if (chapter.isDownloaded) {
      return this.chapterImageRepo.count({
        where: { chapterId: chapter.id, status: 'downloaded' },
      });
    }

    this.logger.log(`[任务 ${taskId}] 抓取图片: ${chapter.title}`);
    const { html } = await this.fetchPage(viewerUrl);
    const images = this.parser.parseViewerImages(html);

    if (images.length === 0) {
      this.logger.warn(`[任务 ${taskId}] 章节 ${chapter.title} 无图片`);
      return 0;
    }

    const existingImages = await this.chapterImageRepo.find({
      where: { chapterId: chapter.id },
    });
    const existingMap = new Map(
      existingImages.map((image) => [image.orderIndex, image]),
    );

    let downloadedCount = 0;
    let skippedCount = 0;
    const toInsert: Partial<ChapterImage>[] = [];

    for (const image of images) {
      this.checkCancelled(taskId);

      const { filepath, webPath } = this.computeImagePath(
        bookId,
        chapter.orderIndex,
        image.orderIndex,
        image.imageUrl,
      );

      if (existsSync(filepath)) {
        skippedCount++;
        const existing = existingMap.get(image.orderIndex);
        if (existing) {
          if (
            existing.status !== 'downloaded' ||
            existing.localPath !== webPath
          ) {
            await this.chapterImageRepo.update(existing.id, {
              localPath: webPath,
              status: 'downloaded',
              sourceUrl: image.imageUrl,
            });
          }
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: image.orderIndex,
            sourceUrl: image.imageUrl,
            localPath: webPath,
            status: 'downloaded',
          });
        }
        existingMap.delete(image.orderIndex);
        continue;
      }

      const localPath = await this.downloadChapterImage(
        filepath,
        webPath,
        image.imageUrl,
      );

      if (localPath) {
        downloadedCount++;
        const existing = existingMap.get(image.orderIndex);
        if (existing) {
          await this.chapterImageRepo.update(existing.id, {
            localPath: webPath,
            status: 'downloaded',
            sourceUrl: image.imageUrl,
          });
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: image.orderIndex,
            sourceUrl: image.imageUrl,
            localPath: webPath,
            status: 'downloaded',
          });
        }
      } else {
        const existing = existingMap.get(image.orderIndex);
        if (existing) {
          await this.chapterImageRepo.update(existing.id, {
            status: 'failed',
          });
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: image.orderIndex,
            sourceUrl: image.imageUrl,
            status: 'failed',
          });
        }
      }
      existingMap.delete(image.orderIndex);
    }

    if (toInsert.length > 0) {
      await this.chapterImageRepo
        .createQueryBuilder()
        .insert()
        .into(ChapterImage)
        .values(toInsert)
        .execute();
    }

    if (existingMap.size > 0) {
      await this.chapterImageRepo.delete(
        existingImages
          .filter((image) => existingMap.has(image.orderIndex))
          .map((image) => image.id),
      );
    }

    chapter.pageCount = images.length;
    chapter.isDownloaded =
      downloadedCount + skippedCount === images.length ? 1 : 0;
    chapter.downloadedAt = new Date();
    await this.chapterRepo.save(chapter);

    this.logger.log(
      `[任务 ${taskId}] 章节 ${chapter.title}: 新下载 ${downloadedCount}, 跳过 ${skippedCount}, 共 ${images.length} 张`,
    );
    return downloadedCount + skippedCount;
  }

  async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({
      where: { domain: 'rman8.com' },
    });

    if (!site) {
      site = this.sourceSiteRepo.create({
        name: '肉漫屋',
        domain: 'rman8.com',
        resourceType: SiteResourceType.COMIC,
        ageRating: this.ageRating,
        config: {
          baseUrl: this.baseUrl,
          listPath: '/bookcatalog/all/ob/time/st/all',
        },
        rateLimit: this.rateLimitMs,
        status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
    }

    return site;
  }
}
