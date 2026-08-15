import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseComicScraper, ScrapeResult } from '../base-comic-scraper';
import { Manhwa18Parser } from './manhwa18-parser';
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
export class Manhwa18ScraperService extends BaseComicScraper {
  protected readonly logger = new Logger(Manhwa18ScraperService.name);
  private readonly parser: Manhwa18Parser;

  protected get baseUrl(): string {
    return 'https://manhwa18.cc';
  }
  protected get rateLimitMs(): number {
    return 1000;
  }
  protected get ageRating(): AgeRating {
    return AgeRating.ADULT;
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
    this.parser = new Manhwa18Parser();
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
    const slug = rs.sourceId;
    const task = await this.taskService.create({
      resourceId,
      sourceSiteId: site.id,
      config: { slug, maxChapters },
    });
    this.scrapeOneWithTask(task.id, slug, maxChapters).catch(() => {});
    return { taskId: task.id };
  }

  async scrapeOneWithTask(
    taskId: number,
    slug: string,
    maxChapters = 0,
  ): Promise<ScrapeResult> {
    this.logger.log(`[任务 ${taskId}] 开始抓取 slug=${slug}`);
    await this.taskService.markRunning(taskId);

    try {
      const result = await this.doScrape(taskId, slug, maxChapters);
      await this.taskService.markSuccess(
        taskId,
        result.chapters.length,
        result.chapters.reduce((s, c) => s + c.imageCount, 0),
      );
      this.logger.log(`[任务 ${taskId}] 抓取完成`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.taskService.isCancelled(taskId)) {
        this.logger.log(`[任务 ${taskId}] 任务已停止`);
      } else {
        this.logger.error(`[任务 ${taskId}] 抓取失败: ${msg}`);
        await this.taskService.markFailed(taskId, msg);
      }
      throw err;
    }
  }

  private async doScrape(
    taskId: number,
    slug: string,
    maxChapters: number,
  ): Promise<ScrapeResult> {
    this.checkCancelled(taskId);
    const site = await this.ensureSourceSite();

    const detailUrl = `${this.baseUrl}/webtoon/${slug}`;
    this.logger.log(`[任务 ${taskId}] 详情页: ${detailUrl}`);
    await this.taskService.log(taskId, 'info', `抓取详情页: ${detailUrl}`);

    const { html: detailHtml } = await this.fetchPage(detailUrl);
    const detail = this.parser.parseDetail(detailHtml);
    this.logger.log(
      `[任务 ${taskId}] 漫画: ${detail.title}, 作者: ${detail.authors.join(', ')}`,
    );

    const resource = await this.saveResource(detail, detailUrl, slug);
    await this.saveResourceSource(
      site,
      resource,
      slug,
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

    const chapters = this.parser.parseChapterList(detailHtml);
    this.logger.log(`[任务 ${taskId}] 总章节数: ${chapters.length}`);

    const chaptersToScrape =
      maxChapters > 0 ? chapters.slice(0, maxChapters) : chapters;

    this.logger.log(`[任务 ${taskId}] 准备抓取 ${chaptersToScrape.length} 章`);
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

    for (let i = 0; i < chaptersToScrape.length; i++) {
      this.checkCancelled(taskId);
      const ch = chaptersToScrape[i];
      this.logger.log(
        `[任务 ${taskId}] (${i + 1}/${chaptersToScrape.length}) ${ch.title}`,
      );
      const chapter = await this.saveChapter(resource, site, i + 1, ch);
      if (chapter) {
        const images = await this.scrapeChapterImages(
          taskId,
          slug,
          chapter,
          this.buildViewerUrl(ch.viewerUrl),
        );
        result.chapters.push({
          id: chapter.id,
          title: chapter.title,
          imageCount: images,
        });
        await this.taskService['taskRepo'].update(taskId, {
          doneItems: i + 1,
          totalItems: chaptersToScrape.length,
        });
      }
    }

    resource.chapterCount = await this.chapterRepo.count({
      where: { resourceId: resource.id },
    });
    await this.resourceRepo.save(resource);
    return result;
  }

  async discoverCatalog(
    taskId?: number,
  ): Promise<{ discovered: number; new: number }> {
    this.logger.log('开始抓取 Manhwa18 目录...');
    const site = await this.ensureSourceSite();

    let discovered = 0;
    let newCount = 0;
    const seenSlugs = new Set<string>();

    let page = 1;
    let hasNext = true;
    while (hasNext) {
      if (taskId) this.checkCancelled(taskId);
      const pageUrl =
        page === 1 ? `${this.baseUrl}/webtoons` : `${this.baseUrl}/webtoons/${page}`;
      this.logger.log(`第 ${page} 页: ${pageUrl}`);
      if (taskId)
        await this.taskService.log(taskId, 'info', `第 ${page} 页`);

      try {
        const { html } = await this.fetchPage(pageUrl);
        const cards = this.parser.parseComicCards(html);
        for (const card of cards) {
          if (taskId) this.checkCancelled(taskId);
          const result = await this.processCard(card, site, seenSlugs);
          if (result === 'new') newCount++;
          if (result !== 'dup') discovered++;
        }
        hasNext = this.parser.hasNextPage(html) && cards.length > 0;
      } catch (e) {
        this.logger.warn(`第 ${page} 页抓取失败,停止翻页: ${e}`);
        hasNext = false;
      }
      page++;
    }

    this.logger.log(`目录抓取完成: 共发现 ${discovered} 部, 新增 ${newCount} 部`);
    return { discovered, new: newCount };
  }

  private async processCard(
    card: ReturnType<Manhwa18Parser['parseComicCards']>[0],
    site: SourceSite,
    seenSlugs: Set<string>,
  ): Promise<'new' | 'existing' | 'dup'> {
    if (seenSlugs.has(card.slug)) return 'dup';
    seenSlugs.add(card.slug);

    const existing = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: card.slug },
    });

    if (!existing) {
      let resource = await this.resourceRepo.findOne({
        where: { title: card.title, type: ResourceType.COMIC },
      });
      if (!resource) {
        const localCover = await this.downloadCover(
          card.slug,
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
          language: 'en',
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
          card.slug,
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
        sourceId: card.slug,
        rawTitle: card.title,
        scrapeStatus: 'idle',
      });

      return 'new';
    } else {
      if (existing.resourceId) {
        const res = await this.resourceRepo.findOne({
          where: { id: existing.resourceId },
        });
        if (res && !this.coverFileExists(res.localCoverPath) && card.coverUrl) {
          const localCover = await this.downloadCover(
            card.slug,
            card.coverUrl,
            'other',
          );
          if (localCover) {
            res.localCoverPath = localCover;
            if (!res.coverUrl) res.coverUrl = card.coverUrl;
            await this.resourceRepo.save(res);
          }
        }
      }
      return 'existing';
    }
  }

  private async saveResource(
    detail: ReturnType<Manhwa18Parser['parseDetail']>,
    detailUrl: string,
    slug: string,
  ): Promise<Resource> {
    let resource = await this.resourceRepo.findOne({
      where: { title: detail.title, type: ResourceType.COMIC },
    });
    const extra = { detailUrl };
    if (!resource) {
      const localCover = await this.downloadCover(
        slug,
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
        language: 'en',
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
      if (
        !this.coverFileExists(resource.localCoverPath) &&
        detail.coverUrl
      ) {
        const localCover = await this.downloadCover(
          slug,
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
    slug: string,
    detailUrl: string,
    status: string,
  ): Promise<void> {
    let rs = await this.resourceSourceRepo.findOne({
      where: { resourceId: resource.id, sourceSiteId: site.id },
    });
    if (!rs) {
      rs = this.resourceSourceRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        sourceUrl: detailUrl,
        sourceId: slug,
        rawTitle: resource.title,
      });
    }
    rs.lastScrapedAt = new Date();
    rs.scrapeStatus = 'running';
    rs.isCompleted = status === 'completed' ? 1 : 0;
    await this.resourceSourceRepo.save(rs);
  }

  private async saveChapter(
    resource: Resource,
    site: SourceSite,
    orderIndex: number,
    ch: ReturnType<Manhwa18Parser['parseChapterList']>[0],
  ): Promise<Chapter | null> {
    let chapter = await this.chapterRepo.findOne({
      where: { resourceId: resource.id, sourceSiteId: site.id, orderIndex },
    });
    if (!chapter) {
      chapter = this.chapterRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        orderIndex,
        title: ch.title,
        chapterType: ChapterType.IMAGE,
        sourceUrl: this.buildViewerUrl(ch.viewerUrl),
        extra: { chapterId: ch.chapterId },
      });
      chapter = await this.chapterRepo.save(chapter);
    }
    return chapter;
  }

  private buildViewerUrl(viewerUrl: string): string {
    if (viewerUrl.startsWith('http')) return viewerUrl;
    if (viewerUrl.startsWith('/')) return `${this.baseUrl}${viewerUrl}`;
    return `${this.baseUrl}/${viewerUrl}`;
  }

  private async scrapeChapterImages(
    taskId: number,
    slug: string,
    chapter: Chapter,
    viewerUrl: string,
  ): Promise<number> {
    if (chapter.isDownloaded) {
      const count = await this.chapterImageRepo.count({
        where: { chapterId: chapter.id, status: 'downloaded' },
      });
      return count;
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
    const existingMap = new Map(existingImages.map((e) => [e.orderIndex, e]));

    let downloadedCount = 0;
    let skippedCount = 0;
    const toInsert: Partial<ChapterImage>[] = [];

    for (const img of images) {
      this.checkCancelled(taskId);

      const { filepath, webPath } = this.computeImagePath(
        slug,
        chapter.orderIndex,
        img.orderIndex,
        img.imageUrl,
      );

      if (existsSync(filepath)) {
        skippedCount++;
        const existing = existingMap.get(img.orderIndex);
        if (existing) {
          if (
            existing.status !== 'downloaded' ||
            existing.localPath !== webPath
          ) {
            await this.chapterImageRepo.update(existing.id, {
              localPath: webPath,
              status: 'downloaded',
              sourceUrl: img.imageUrl,
            });
          }
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: img.orderIndex,
            sourceUrl: img.imageUrl,
            localPath: webPath,
            status: 'downloaded',
          });
        }
        existingMap.delete(img.orderIndex);
        continue;
      }

      const localPath = await this.downloadChapterImage(
        filepath,
        webPath,
        img.imageUrl,
      );

      if (localPath) {
        downloadedCount++;
        const existing = existingMap.get(img.orderIndex);
        if (existing) {
          await this.chapterImageRepo.update(existing.id, {
            localPath: webPath,
            status: 'downloaded',
            sourceUrl: img.imageUrl,
          });
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: img.orderIndex,
            sourceUrl: img.imageUrl,
            localPath: webPath,
            status: 'downloaded',
          });
        }
      } else {
        const existing = existingMap.get(img.orderIndex);
        if (existing) {
          await this.chapterImageRepo.update(existing.id, { status: 'failed' });
        } else {
          toInsert.push({
            chapterId: chapter.id,
            orderIndex: img.orderIndex,
            sourceUrl: img.imageUrl,
            status: 'failed',
          });
        }
      }
      existingMap.delete(img.orderIndex);
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
          .filter((e) => existingMap.has(e.orderIndex))
          .map((e) => e.id),
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

  public async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({
      where: { domain: 'manhwa18.cc' },
    });
    if (!site) {
      site = this.sourceSiteRepo.create({
        name: 'Manhwa18',
        domain: 'manhwa18.cc',
        resourceType: SiteResourceType.COMIC,
        ageRating: this.ageRating,
        config: {
          baseUrl: this.baseUrl,
          listPath: '/webtoons',
        },
        rateLimit: this.rateLimitMs,
        status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
    }
    return site;
  }
}
