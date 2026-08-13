import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseComicScraper, ScrapeResult } from '../base-comic-scraper';
import { DongmanhiParser } from './dongmanhi-parser';
import { SourceSite } from '../../entities/source-site.entity';
import { Resource } from '../../entities/resource.entity';
import { ResourceSource } from '../../entities/resource-source.entity';
import { Chapter } from '../../entities/chapter.entity';
import { ChapterImage } from '../../entities/chapter-image.entity';
import { Author } from '../../entities/author.entity';
import { ResourceAuthor } from '../../entities/resource-author.entity';
import { Category } from '../../entities/category.entity';
import { ResourceCategory } from '../../entities/resource-category.entity';
import { SiteResourceType } from '../../entities/source-site.entity';
import { ResourceType, ChapterType } from '../../constants/resource-type';
import { TaskService } from '../../task/task.service';
import { SettingsService } from '../../settings/settings.service';
import { existsSync } from 'fs';

@Injectable()
export class DongmanhiScraperService extends BaseComicScraper {
  protected readonly logger = new Logger(DongmanhiScraperService.name);
  private readonly parser: DongmanhiParser;

  protected get baseUrl(): string {
    return 'https://www.dongmanhi.com';
  }
  protected get rateLimitMs(): number {
    return 1000;
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
    this.parser = new DongmanhiParser();
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
    const comicId = rs.sourceId;
    const task = await this.taskService.create({
      resourceId,
      sourceSiteId: site.id,
      config: { comicId, maxChapters },
    });
    this.scrapeOneWithTask(task.id, comicId, maxChapters).catch(() => {});
    return { taskId: task.id };
  }

  async scrapeOneWithTask(
    taskId: number,
    comicId: string,
    maxChapters = 0,
  ): Promise<ScrapeResult> {
    this.logger.log(`[任务 ${taskId}] 开始抓取 comicId=${comicId}`);
    await this.taskService.markRunning(taskId);

    try {
      const result = await this.doScrape(taskId, comicId, maxChapters);
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
    comicId: string,
    maxChapters: number,
  ): Promise<ScrapeResult> {
    this.checkCancelled(taskId);
    const site = await this.ensureSourceSite();

    const detailUrl = `${this.baseUrl}/manhua/${comicId}/`;
    this.logger.log(`[任务 ${taskId}] 详情页: ${detailUrl}`);
    await this.taskService.log(taskId, 'info', `抓取详情页: ${detailUrl}`);

    const { html: detailHtml } = await this.fetchPage(detailUrl);
    const detail = this.parser.parseDetail(detailHtml);
    this.logger.log(
      `[任务 ${taskId}] 漫画: ${detail.title}, 作者: ${detail.authors.join(', ')}`,
    );

    const resource = await this.saveResource(detail);
    await this.saveResourceSource(
      site,
      resource,
      comicId,
      detailUrl,
      detail.status,
    );
    await this.saveAuthors(resource, detail.authors);
    for (const genre of detail.genres) {
      await this.saveCategory(resource, genre);
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
          comicId,
          chapter,
          ch.viewerUrl,
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
    this.logger.log('开始抓取动漫嗨目录...');
    const site = await this.ensureSourceSite();

    // URL 格式 /list/--{filter}-{sort}/{page}.html
    // 全站发现: 遍历所有组合 region(0-6) × filter(0-2) × sort(0-1) = 42 个分类
    let discovered = 0;
    let newCount = 0;
    const seenComicIds = new Set<string>();

    const regions = ['0', '1', '2', '3', '4', '5', '6'];
    const filters = ['0', '1', '2'];
    const sorts = ['0', '1'];

    for (const region of regions) {
      for (const filter of filters) {
        for (const sort of sorts) {
          if (taskId) this.checkCancelled(taskId);

          const comboKey = `${region}-0-${filter}-${sort}`;
          const listBaseUrl = `${this.baseUrl}/list/${comboKey}/`;
          this.logger.log(`抓取分类: ${comboKey}`);
          if (taskId)
            await this.taskService.log(taskId, 'info', `抓取分类: ${comboKey}`);

          let totalPages = 1;
          try {
            const { html: firstHtml } = await this.fetchPage(listBaseUrl);
            totalPages = this.parser.parsePagination(firstHtml).totalPages;
            const firstCards = this.parser.parseComicCards(firstHtml);
            for (const card of firstCards) {
              if (taskId) this.checkCancelled(taskId);
              const result = await this.processCard(card, site, seenComicIds);
              if (result === 'new') newCount++;
              if (result !== 'dup') discovered++;
            }
          } catch (e) {
            this.logger.warn(`分类 ${comboKey} 首页抓取失败,跳过: ${e}`);
            continue;
          }

          this.logger.log(`分类 ${comboKey}: 共 ${totalPages} 页`);

          for (let page = 2; page <= totalPages; page++) {
            if (taskId) this.checkCancelled(taskId);
            const pageUrl = `${listBaseUrl}${page}.html`;
            this.logger.log(`分类 ${comboKey} 第 ${page}/${totalPages} 页`);
            if (taskId)
              await this.taskService.log(
                taskId,
                'info',
                `分类 ${comboKey} 第 ${page}/${totalPages} 页`,
              );

            try {
              const { html } = await this.fetchPage(pageUrl);
              const cards = this.parser.parseComicCards(html);
              for (const card of cards) {
                if (taskId) this.checkCancelled(taskId);
                const result = await this.processCard(card, site, seenComicIds);
                if (result === 'new') newCount++;
                if (result !== 'dup') discovered++;
              }
            } catch (e) {
              this.logger.warn(
                `分类 ${comboKey} 第 ${page} 页抓取失败,跳过: ${e}`,
              );
            }
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
    card: ReturnType<DongmanhiParser['parseComicCards']>[0],
    site: SourceSite,
    seenComicIds: Set<string>,
  ): Promise<'new' | 'existing' | 'dup'> {
    if (seenComicIds.has(card.comicId)) return 'dup';
    seenComicIds.add(card.comicId);

    const existing = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: card.comicId },
    });

    if (!existing) {
      let resource = await this.resourceRepo.findOne({
        where: { title: card.title, type: ResourceType.COMIC },
      });
      if (!resource) {
        const localCover = await this.downloadCover(
          card.comicId,
          card.coverUrl,
          'other',
        );
        resource = this.resourceRepo.create({
          type: ResourceType.COMIC,
          title: card.title,
          coverUrl: card.coverUrl,
          localCoverPath: localCover,
          status:
            card.status === '完结'
              ? 'completed'
              : card.status === '连载'
                ? 'ongoing'
                : 'unknown',
          language: 'zh-cn',
          isComplete: card.status === '完结' ? 1 : 0,
          category: null,
          extra: {},
        });
        resource = await this.resourceRepo.save(resource);
      } else if (!this.coverFileExists(resource.localCoverPath) && card.coverUrl) {
        const localCover = await this.downloadCover(
          card.comicId,
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
        sourceId: card.comicId,
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
            card.comicId,
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

  protected async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({
      where: { domain: 'www.dongmanhi.com' },
    });
    if (!site) {
      site = this.sourceSiteRepo.create({
        name: '动漫嗨',
        domain: 'www.dongmanhi.com',
        resourceType: SiteResourceType.COMIC,
        config: { baseUrl: this.baseUrl, listPath: '/list/0-0-0-0/' },
        rateLimit: this.rateLimitMs,
        status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
    }
    return site;
  }

  private async saveResource(
    detail: ReturnType<DongmanhiParser['parseDetail']>,
  ): Promise<Resource> {
    let resource = await this.resourceRepo.findOne({
      where: { title: detail.title, type: ResourceType.COMIC },
    });
    const extra = { rating: detail.rating, chapterCount: detail.chapterCount };
    if (!resource) {
      resource = this.resourceRepo.create({
        type: ResourceType.COMIC,
        title: detail.title,
        summary: detail.summary,
        coverUrl: detail.coverUrl,
        status: detail.status,
        language: 'zh-cn',
        rating: detail.rating || undefined,
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
      resource.category = detail.genres[0] || resource.category;
      resource.rating = detail.rating || resource.rating;
      resource.extra = extra;
      resource.language = resource.language || 'zh-cn';
      resource = await this.resourceRepo.save(resource);
    }
    return resource;
  }

  private async saveResourceSource(
    site: SourceSite,
    resource: Resource,
    comicId: string,
    detailUrl: string,
    status: string,
  ): Promise<void> {
    let rs = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: comicId },
    });
    if (!rs) {
      rs = this.resourceSourceRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        sourceUrl: detailUrl,
        sourceId: comicId,
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
    ch: ReturnType<DongmanhiParser['parseChapterList']>[0],
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
        sourceUrl: ch.viewerUrl,
        extra: { chapterId: ch.chapterId },
      });
      chapter = await this.chapterRepo.save(chapter);
    }
    return chapter;
  }

  private async scrapeChapterImages(
    taskId: number,
    comicId: string,
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
        comicId,
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
}
