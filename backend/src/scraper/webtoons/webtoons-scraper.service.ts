import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpClient } from '../http-client';
import { WebtoonsParser } from './webtoons-parser';
import { SourceSite } from '../../entities/source-site.entity';
import { Resource } from '../../entities/resource.entity';
import { ResourceSource } from '../../entities/resource-source.entity';
import { Chapter } from '../../entities/chapter.entity';
import { ChapterImage } from '../../entities/chapter-image.entity';
import { Author, AuthorType } from '../../entities/author.entity';
import { ResourceAuthor } from '../../entities/resource-author.entity';
import { Category } from '../../entities/category.entity';
import { ResourceCategory } from '../../entities/resource-category.entity';
import { SiteResourceType } from '../../entities/source-site.entity';
import { ResourceType, ChapterType } from '../../constants/resource-type';
import { TaskService } from '../../task/task.service';
import { SettingsService } from '../../settings/settings.service';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

export interface ScrapeResult {
  resource: { id: number; title: string };
  chapters: { id: number; title: string; imageCount: number }[];
}

@Injectable()
export class WebtoonsScraperService {
  private readonly logger = new Logger(WebtoonsScraperService.name);
  private readonly http: HttpClient;
  private readonly parser: WebtoonsParser;
  private readonly BASE_URL = 'https://www.webtoons.com/zh-hant';
  private readonly RATE_LIMIT_MS = 1500;
  private readonly COVER_MAX_RETRIES = 3;
  private readonly COVER_RETRY_DELAY_MS = 1000;

  constructor(
    @InjectRepository(SourceSite)
    private readonly sourceSiteRepo: Repository<SourceSite>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceSource)
    private readonly resourceSourceRepo: Repository<ResourceSource>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(ChapterImage)
    private readonly chapterImageRepo: Repository<ChapterImage>,
    @InjectRepository(Author)
    private readonly authorRepo: Repository<Author>,
    @InjectRepository(ResourceAuthor)
    private readonly resourceAuthorRepo: Repository<ResourceAuthor>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(ResourceCategory)
    private readonly resourceCategoryRepo: Repository<ResourceCategory>,
    private readonly taskService: TaskService,
    private readonly settingsService: SettingsService,
  ) {
    this.http = new HttpClient();
    this.parser = new WebtoonsParser();
  }

  async scrapeOne(titleNo: number, maxChapters = 0): Promise<ScrapeResult> {
    const site = await this.ensureSourceSite();
    const task = await this.taskService.create({
      sourceSiteId: site.id,
      config: { titleNo, maxChapters },
    });
    return this.scrapeOneWithTask(task.id, titleNo, maxChapters);
  }

  async scrapeByResourceId(resourceId: number, maxChapters = 0): Promise<ScrapeResult> {
    const site = await this.ensureSourceSite();
    const rs = await this.resourceSourceRepo.findOne({
      where: { resourceId, sourceSiteId: site.id },
    });
    if (!rs) {
      throw new Error(`资源 ${resourceId} 没有关联的来源记录`);
    }
    const titleNo = parseInt(rs.sourceId, 10);
    const task = await this.taskService.create({
      resourceId,
      sourceSiteId: site.id,
      config: { titleNo, maxChapters },
    });
    return this.scrapeOneWithTask(task.id, titleNo, maxChapters);
  }

  async scrapeByResourceIdAsync(resourceId: number, maxChapters = 0): Promise<{ taskId: number }> {
    const site = await this.ensureSourceSite();
    const rs = await this.resourceSourceRepo.findOne({
      where: { resourceId, sourceSiteId: site.id },
    });
    if (!rs) {
      throw new Error(`资源 ${resourceId} 没有关联的来源记录`);
    }
    const titleNo = parseInt(rs.sourceId, 10);
    const task = await this.taskService.create({
      resourceId,
      sourceSiteId: site.id,
      config: { titleNo, maxChapters },
    });
    this.scrapeOneWithTask(task.id, titleNo, maxChapters).catch(() => {});
    return { taskId: task.id };
  }

  async scrapeOneWithTask(
    taskId: number,
    titleNo: number,
    maxChapters = 0,
  ): Promise<ScrapeResult> {
    this.logger.log(`[任务 ${taskId}] 开始抓取 title_no=${titleNo}`);
    await this.taskService.markRunning(taskId);

    try {
      const result = await this.doScrape(taskId, titleNo, maxChapters);
      await this.taskService.markSuccess(
        taskId,
        result.chapters.length,
        result.chapters.reduce((s, c) => s + c.imageCount, 0),
      );
      this.logger.log(`[任务 ${taskId}] 抓取完成`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[任务 ${taskId}] 抓取失败: ${msg}`);
      await this.taskService.markFailed(taskId, msg);
      throw err;
    }
  }

  private async doScrape(
    taskId: number,
    titleNo: number,
    maxChapters: number,
  ): Promise<ScrapeResult> {
    this.checkCancelled(taskId);
    const site = await this.ensureSourceSite();

    const listUrl = await this.findListUrl(site, titleNo);
    if (!listUrl) {
      throw new Error(`无法找到 title_no=${titleNo} 的列表页 URL`);
    }
    this.logger.log(`[任务 ${taskId}] 列表页: ${listUrl}`);
    await this.taskService.log(taskId, 'info', `找到列表页: ${listUrl}`);

    const { html: listHtml, url: finalUrl } = await this.fetchPage(listUrl);
    const detail = this.parser.parseDetail(listHtml);
    this.logger.log(`[任务 ${taskId}] 漫画: ${detail.title}, 作者: ${detail.authors.join(', ')}`);

    const resource = await this.saveResource(detail);
    await this.saveResourceSource(site, resource, titleNo, listUrl);
    await this.saveAuthors(resource, detail.authors);
    await this.saveCategory(resource, detail.genre);

    await this.taskService['taskRepo'].update(taskId, { resourceId: resource.id });

    const episodes = this.parser.parseEpisodeList(listHtml);
    const allEpisodes = [...episodes];
    const seenEpisodeNos = new Set(episodes.map((e) => e.episodeNo));
    let page = 2;
    while (episodes.length > 0) {
      this.checkCancelled(taskId);
      if (maxChapters > 0 && allEpisodes.length >= maxChapters) {
        this.logger.log(`[任务 ${taskId}] 已收集 ${allEpisodes.length} 章,停止翻页`);
        break;
      }
      const pageUrl = this.buildPageUrl(finalUrl, page);
      this.logger.log(`[任务 ${taskId}] 抓取第 ${page} 页`);
      const { html: pageHtml } = await this.fetchPage(pageUrl);
      const pageEpisodes = this.parser.parseEpisodeList(pageHtml);
      if (pageEpisodes.length === 0) break;

      const hasNew = pageEpisodes.some((e) => !seenEpisodeNos.has(e.episodeNo));
      if (!hasNew) {
        this.logger.log(`[任务 ${taskId}] 第 ${page} 页章节重复,已到最后一页,停止翻页`);
        break;
      }

      for (const ep of pageEpisodes) {
        if (!seenEpisodeNos.has(ep.episodeNo)) {
          seenEpisodeNos.add(ep.episodeNo);
          allEpisodes.push(ep);
        }
      }
      page++;
    }
    this.logger.log(`[任务 ${taskId}] 总章节数: ${allEpisodes.length}`);

    const chaptersToScrape =
      maxChapters > 0
        ? allEpisodes.sort((a, b) => a.episodeNo - b.episodeNo).slice(0, maxChapters)
        : allEpisodes.sort((a, b) => a.episodeNo - b.episodeNo);

    this.logger.log(`[任务 ${taskId}] 准备抓取 ${chaptersToScrape.length} 章`);
    await this.taskService.log(taskId, 'info', `准备抓取 ${chaptersToScrape.length} 章`);
    await this.taskService['taskRepo'].update(taskId, { totalItems: chaptersToScrape.length });

    const result: ScrapeResult = {
      resource: { id: resource.id, title: resource.title },
      chapters: [],
    };

    for (let i = 0; i < chaptersToScrape.length; i++) {
      this.checkCancelled(taskId);
      const ep = chaptersToScrape[i];
      this.logger.log(`[任务 ${taskId}] (${i + 1}/${chaptersToScrape.length}) ${ep.title}`);
      const chapter = await this.saveChapter(resource, site, ep);
      if (chapter) {
        const images = await this.scrapeChapterImages(taskId, titleNo, chapter, ep.viewerUrl);
        result.chapters.push({ id: chapter.id, title: chapter.title, imageCount: images });
        await this.taskService['taskRepo'].update(taskId, {
          doneItems: i + 1,
          totalItems: chaptersToScrape.length,
        });
      }
    }

    resource.chapterCount = chaptersToScrape.length;
    await this.resourceRepo.save(resource);
    return result;
  }

  private checkCancelled(taskId: number): void {
    if (this.taskService.isCancelled(taskId)) {
      throw new Error('任务已被用户停止');
    }
  }

  async discoverCatalog(taskId?: number): Promise<{ discovered: number; new: number }> {
    this.logger.log('开始抓取目录...');
    const site = await this.ensureSourceSite();

    const genreSlugs = [
      'action', 'adaptation', 'bl_gl', 'city_office', 'comedy', 'drama',
      'eastern_palace', 'epub', 'fantasy', 'heartwarming', 'horror',
      'local', 'martial_arts', 'mystery', 'romance', 'romance_m',
      'school', 'shonen', 'slice_of_life', 'thriller', 'time_slip',
      'web_novel', 'western_palace',
    ];

    let discovered = 0;
    let newCount = 0;
    const seenTitleNos = new Set<number>();

    for (const slug of genreSlugs) {
      if (taskId) this.checkCancelled(taskId);
      const genreUrl = `${this.BASE_URL}/genres/${slug}?sortOrder=UPDATE`;
      this.logger.log(`抓取分类: ${slug}`);
      if (taskId) await this.taskService.log(taskId, 'info', `抓取分类: ${slug}`);

      const { html } = await this.fetchPage(genreUrl);
      const cards = this.parser.parseGenreCards(html);

      for (const card of cards) {
        if (seenTitleNos.has(card.titleNo)) continue;
        seenTitleNos.add(card.titleNo);
        discovered++;

        const existing = await this.resourceSourceRepo.findOne({
          where: { sourceSiteId: site.id, sourceId: String(card.titleNo) },
        });

        if (!existing) {
          let resource = await this.resourceRepo.findOne({
            where: { title: card.title, type: ResourceType.COMIC },
          });
          if (!resource) {
            const genreName = this.slugToGenreName(slug);
            const localCover = await this.downloadCover(card.titleNo, card.coverUrl, genreName || 'other');

            resource = this.resourceRepo.create({
              type: ResourceType.COMIC,
              title: card.title,
              coverUrl: card.coverUrl,
              localCoverPath: localCover,
              status: 'unknown',
              language: card.languageCode || 'zh-hant',
              isComplete: 0,
              category: genreName || null,
              extra: { likeCount: card.likeCount, adult: card.adult, genre: card.genre },
            });
            resource = await this.resourceRepo.save(resource);
          } else if (!resource.localCoverPath && resource.coverUrl) {
            const genreName = this.slugToGenreName(slug);
            const localCover = await this.downloadCover(card.titleNo, card.coverUrl, genreName || 'other');
            if (localCover) {
              resource.localCoverPath = localCover;
              await this.resourceRepo.save(resource);
            }
          }

          await this.resourceSourceRepo.save({
            resourceId: resource.id,
            sourceSiteId: site.id,
            sourceUrl: card.listUrl,
            sourceId: String(card.titleNo),
            rawTitle: card.title,
            scrapeStatus: 'idle',
          });

          if (card.author) {
            await this.saveAuthors(resource, [card.author]);
          }

          const genreName2 = this.slugToGenreName(slug);
          if (genreName2) {
            await this.saveCategory(resource, genreName2);
          }

          newCount++;
        } else {
          if (existing.resourceId) {
            const res = await this.resourceRepo.findOne({ where: { id: existing.resourceId } });
            if (res && !res.localCoverPath && card.coverUrl) {
              const genreName = this.slugToGenreName(slug);
              const localCover = await this.downloadCover(card.titleNo, card.coverUrl, genreName || 'other');
              if (localCover) {
                res.localCoverPath = localCover;
                if (!res.coverUrl) res.coverUrl = card.coverUrl;
                await this.resourceRepo.save(res);
              }
            }
          }
        }
      }
      this.logger.log(`分类 ${slug}: 发现 ${cards.length} 部作品`);
    }

    this.logger.log(`目录抓取完成: 共发现 ${discovered} 部, 新增 ${newCount} 部`);
    return { discovered, new: newCount };
  }

  private slugToGenreName(slug: string): string {
    const map: Record<string, string> = {
      action: '動作', adaptation: '改編', bl_gl: 'BL/GL',
      city_office: '都市/職場', comedy: '喜劇', drama: '劇情',
      eastern_palace: '東方宮廷', epub: '電子書', fantasy: '奇幻',
      heartwarming: '治癒', horror: '恐怖', local: '在地',
      martial_arts: '武俠', mystery: '推理', romance: '戀愛',
      romance_m: '戀愛(男向)', school: '校園', shonen: '少年',
      slice_of_life: '日常', thriller: '驚悚', time_slip: '穿越',
      web_novel: '網路小說', western_palace: '西方宮廷',
    };
    return map[slug] || slug;
  }

  private async downloadCover(
    titleNo: number,
    coverUrl: string,
    genre: string,
  ): Promise<string | null> {
    if (!coverUrl) return null;

    const ext = extname(new URL(coverUrl).pathname).split('?')[0] || '.jpg';
    const dir = join(this.settingsService.resourcePath, 'covers', genre || 'other');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filename = `${titleNo}${ext}`;
    const filepath = join(dir, filename);
    const webPath = `/resourceFiles/covers/${genre || 'other'}/${filename}`;

    if (existsSync(filepath)) {
      return webPath;
    }

    for (let attempt = 1; attempt <= this.COVER_MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`下载封面: ${titleNo}, ${coverUrl} (第 ${attempt}/${this.COVER_MAX_RETRIES} 次)`);
        const result = await this.http.download(coverUrl, filepath, {
          Referer: 'https://www.webtoons.com',
        });

        if (result.status === 200 && result.size && result.size > 0) {
          return webPath;
        }

        this.logger.warn(
          `封面下载失败: ${titleNo} (第 ${attempt} 次), status=${result.status}${result.error ? ', error=' + result.error : ''}`,
        );
      } catch (e) {
        this.logger.warn(`封面下载异常: ${titleNo} (第 ${attempt} 次): ${e}`);
      }

      if (attempt < this.COVER_MAX_RETRIES) {
        await this.sleep(this.COVER_RETRY_DELAY_MS * attempt);
      }
    }

    this.logger.error(`封面下载最终失败: ${titleNo}, 已重试 ${this.COVER_MAX_RETRIES} 次`);
    return null;
  }

  private async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({ where: { domain: 'www.webtoons.com' } });
    if (!site) {
      site = this.sourceSiteRepo.create({
        name: 'Webtoons', domain: 'www.webtoons.com',
        resourceType: SiteResourceType.COMIC,
        config: { baseUrl: this.BASE_URL, genresPath: '/genres' },
        rateLimit: this.RATE_LIMIT_MS, status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
    }
    return site;
  }

  private async findListUrl(site: SourceSite, titleNo: number): Promise<string | null> {
    const existing = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: String(titleNo) },
    });
    if (existing) return existing.sourceUrl;

    this.logger.log('从分类页搜索作品...');
    const { html } = await this.fetchPage(`${this.BASE_URL}/genres`);
    const cards = this.parser.parseGenreCards(html);
    const card = cards.find((c) => c.titleNo === titleNo);
    return card?.listUrl || null;
  }

  private async fetchPage(url: string): Promise<{ html: string; url: string }> {
    const result = await this.http.fetch(url);
    if (result.status !== 200 || result.body.length < 1000) {
      throw new Error(`抓取失败: ${url}, status=${result.status}, size=${result.body.length}`);
    }
    await this.sleep(this.RATE_LIMIT_MS);
    return { html: result.body, url: result.url || url };
  }

  private buildPageUrl(listUrl: string, page: number): string {
    const url = new URL(listUrl);
    url.searchParams.set('page', String(page));
    return url.toString();
  }

  private async saveResource(detail: ReturnType<WebtoonsParser['parseDetail']>): Promise<Resource> {
    let resource = await this.resourceRepo.findOne({
      where: { title: detail.title, type: ResourceType.COMIC },
    });
    const extra = {
      viewCount: detail.viewCount, subscribeCount: detail.subscribeCount, updateDay: detail.updateDay,
    };
    if (!resource) {
      resource = this.resourceRepo.create({
        type: ResourceType.COMIC, title: detail.title, summary: detail.summary,
        coverUrl: detail.coverUrl, status: detail.status, language: 'zh-hant',
        rating: detail.rating ? parseFloat(detail.rating) : undefined,
        isComplete: detail.status === 'completed' ? 1 : 0,
        category: detail.genre || null, extra,
      });
      resource = await this.resourceRepo.save(resource);
      this.logger.log(`创建资源: ${resource.title} (id=${resource.id})`);
    } else {
      resource.summary = detail.summary;
      resource.coverUrl = detail.coverUrl;
      resource.status = detail.status;
      resource.category = detail.genre || resource.category;
      resource.extra = extra;
      resource = await this.resourceRepo.save(resource);
    }
    return resource;
  }

  private async saveResourceSource(site: SourceSite, resource: Resource, titleNo: number, listUrl: string): Promise<void> {
    let rs = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: String(titleNo) },
    });
    if (!rs) {
      rs = this.resourceSourceRepo.create({
        resourceId: resource.id, sourceSiteId: site.id,
        sourceUrl: listUrl, sourceId: String(titleNo), rawTitle: resource.title,
      });
    }
    rs.lastScrapedAt = new Date();
    rs.scrapeStatus = 'running';
    await this.resourceSourceRepo.save(rs);
  }

  private async saveAuthors(resource: Resource, authorNames: string[]): Promise<void> {
    for (const name of authorNames) {
      if (!name) continue;
      let author = await this.authorRepo.findOne({ where: { name, type: AuthorType.AUTHOR } });
      if (!author) {
        author = this.authorRepo.create({ name, type: AuthorType.AUTHOR });
        author = await this.authorRepo.save(author);
      }
      const exists = await this.resourceAuthorRepo.findOne({
        where: { resourceId: resource.id, authorId: author.id },
      });
      if (!exists) {
        await this.resourceAuthorRepo.save({ resourceId: resource.id, authorId: author.id });
      }
    }
  }

  private async saveCategory(resource: Resource, genreName: string): Promise<void> {
    if (!genreName) return;
    let category = await this.categoryRepo.findOne({
      where: { name: genreName, resourceType: ResourceType.COMIC },
    });
    if (!category) {
      category = this.categoryRepo.create({ name: genreName, resourceType: ResourceType.COMIC });
      category = await this.categoryRepo.save(category);
    }
    const exists = await this.resourceCategoryRepo.findOne({
      where: { resourceId: resource.id, categoryId: category.id },
    });
    if (!exists) {
      await this.resourceCategoryRepo.save({ resourceId: resource.id, categoryId: category.id });
    }
  }

  private async saveChapter(resource: Resource, site: SourceSite, ep: ReturnType<WebtoonsParser['parseEpisodeList']>[0]): Promise<Chapter | null> {
    let chapter = await this.chapterRepo.findOne({
      where: { resourceId: resource.id, sourceSiteId: site.id, orderIndex: ep.episodeNo },
    });
    if (!chapter) {
      chapter = this.chapterRepo.create({
        resourceId: resource.id, sourceSiteId: site.id, orderIndex: ep.episodeNo,
        title: ep.title, chapterType: ChapterType.IMAGE, sourceUrl: ep.viewerUrl,
        extra: { thumbnail: ep.thumbnail, likeCount: ep.likeCount, publishedDate: ep.publishedDate },
      });
      chapter = await this.chapterRepo.save(chapter);
    }
    return chapter;
  }

  private async scrapeChapterImages(
    taskId: number,
    titleNo: number,
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

    // 清除旧记录,避免重复抓取产生重复图片
    await this.chapterImageRepo.delete({ chapterId: chapter.id });

    // Insert image records
    const imageEntities: Partial<ChapterImage>[] = images.map((img) => ({
      chapterId: chapter.id, orderIndex: img.orderIndex, sourceUrl: img.imageUrl, status: 'pending',
    }));
    await this.chapterImageRepo.createQueryBuilder().insert().into(ChapterImage).values(imageEntities).execute();

    // Download images to local storage
    let downloadedCount = 0;
    for (const img of images) {
      this.checkCancelled(taskId);
      const localPath = await this.downloadChapterImage(
        titleNo,
        chapter.orderIndex,
        img.orderIndex,
        img.imageUrl,
      );

      if (localPath) {
        await this.chapterImageRepo.update(
          { chapterId: chapter.id, orderIndex: img.orderIndex },
          { localPath, status: 'downloaded', fileSize: 0 },
        );
        downloadedCount++;
      } else {
        await this.chapterImageRepo.update(
          { chapterId: chapter.id, orderIndex: img.orderIndex },
          { status: 'failed' },
        );
      }
    }

    chapter.pageCount = images.length;
    chapter.isDownloaded = downloadedCount === images.length ? 1 : 0;
    chapter.downloadedAt = new Date();
    await this.chapterRepo.save(chapter);

    this.logger.log(
      `[任务 ${taskId}] 章节 ${chapter.title}: ${downloadedCount}/${images.length} 张图片已下载`,
    );
    return downloadedCount;
  }

  private async downloadChapterImage(
    titleNo: number,
    episodeNo: number,
    orderIndex: number,
    imageUrl: string,
  ): Promise<string | null> {
    if (!imageUrl) return null;

    const dir = join(
      this.settingsService.resourcePath,
      'images',
      String(titleNo),
      String(episodeNo),
    );
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const ext = extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg';
    const filename = `${String(orderIndex).padStart(4, '0')}${ext}`;
    const filepath = join(dir, filename);
    const webPath = `/resourceFiles/images/${titleNo}/${episodeNo}/${filename}`;

    if (existsSync(filepath)) {
      return webPath;
    }

    for (let attempt = 1; attempt <= this.COVER_MAX_RETRIES; attempt++) {
      try {
        const result = await this.http.download(imageUrl, filepath, {
          Referer: 'https://www.webtoons.com',
        });

        if (result.status === 200 && result.size && result.size > 0) {
          return webPath;
        }
      } catch (e) {
        // retry
      }

      if (attempt < this.COVER_MAX_RETRIES) {
        await this.sleep(this.COVER_RETRY_DELAY_MS * attempt);
      }
    }

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
