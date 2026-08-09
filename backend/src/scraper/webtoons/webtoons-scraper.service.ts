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
  ) {
    this.http = new HttpClient();
    this.parser = new WebtoonsParser();
  }

  async scrapeOne(titleNo: number, maxChapters = 0): Promise<ScrapeResult> {
    this.logger.log(`开始抓取 title_no=${titleNo}`);

    const site = await this.ensureSourceSite();

    const listUrl = await this.findListUrl(site, titleNo);
    if (!listUrl) {
      throw new Error(`无法找到 title_no=${titleNo} 的列表页 URL`);
    }
    this.logger.log(`找到列表页: ${listUrl}`);

    const { html: listHtml, url: finalUrl } = await this.fetchPage(listUrl);
    const detail = this.parser.parseDetail(listHtml);
    this.logger.log(`漫画: ${detail.title}, 作者: ${detail.authors.join(', ')}`);

    const resource = await this.saveResource(detail, titleNo);
    await this.saveResourceSource(site, resource, titleNo, listUrl, listHtml);
    await this.saveAuthors(resource, detail.authors);
    await this.saveCategory(resource, detail.genre);

    const episodes = this.parser.parseEpisodeList(listHtml);
    this.logger.log(`第一页章节数: ${episodes.length}`);

    const allEpisodes = [...episodes];
    let page = 2;
    while (episodes.length > 0) {
      if (maxChapters > 0 && allEpisodes.length >= maxChapters) {
        this.logger.log(`已收集 ${allEpisodes.length} 章,达到上限停止翻页`);
        break;
      }
      const pageUrl = this.buildPageUrl(finalUrl, page);
      this.logger.log(`抓取第 ${page} 页: ${pageUrl}`);
      const { html: pageHtml } = await this.fetchPage(pageUrl);
      const pageEpisodes = this.parser.parseEpisodeList(pageHtml);
      if (pageEpisodes.length === 0) break;
      allEpisodes.push(...pageEpisodes);
      page++;
    }
    this.logger.log(`总章节数: ${allEpisodes.length}`);

    const result: ScrapeResult = {
      resource: { id: resource.id, title: resource.title },
      chapters: [],
    };

    const sortedEpisodes = allEpisodes.sort(
      (a, b) => a.episodeNo - b.episodeNo,
    );

    const chaptersToScrape =
      maxChapters > 0 ? sortedEpisodes.slice(0, maxChapters) : sortedEpisodes;
    this.logger.log(
      `准备抓取 ${chaptersToScrape.length}/${sortedEpisodes.length} 章${maxChapters > 0 ? ` (限制 ${maxChapters} 章)` : ''}`,
    );

    for (const ep of chaptersToScrape) {
      const chapter = await this.saveChapter(resource, site, ep);
      if (chapter) {
        const images = await this.scrapeChapterImages(chapter, ep.viewerUrl);
        result.chapters.push({
          id: chapter.id,
          title: chapter.title,
          imageCount: images,
        });
      }
    }

    resource.chapterCount = sortedEpisodes.length;
    await this.resourceRepo.save(resource);

    this.logger.log(
      `抓取完成: ${resource.title}, ${result.chapters.length} 章, 共 ${result.chapters.reduce((s, c) => s + c.imageCount, 0)} 张图`,
    );

    return result;
  }

  private async ensureSourceSite(): Promise<SourceSite> {
    let site = await this.sourceSiteRepo.findOne({
      where: { domain: 'www.webtoons.com' },
    });
    if (!site) {
      site = this.sourceSiteRepo.create({
        name: 'Webtoons',
        domain: 'www.webtoons.com',
        resourceType: SiteResourceType.COMIC,
        config: {
          baseUrl: this.BASE_URL,
          genresPath: '/genres',
        },
        rateLimit: this.RATE_LIMIT_MS,
        status: 1,
      });
      site = await this.sourceSiteRepo.save(site);
      this.logger.log(`创建源站记录: ${site.name} (id=${site.id})`);
    }
    return site;
  }

  private async findListUrl(
    site: SourceSite,
    titleNo: number,
  ): Promise<string | null> {
    const existing = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: String(titleNo) },
    });
    if (existing) {
      return existing.sourceUrl;
    }

    const genreUrl = `${this.BASE_URL}/genres`;
    this.logger.log('从分类页搜索作品...');
    const { html } = await this.fetchPage(genreUrl);
    const cards = this.parser.parseGenreCards(html);
    const card = cards.find((c) => c.titleNo === titleNo);
    if (card) {
      this.logger.log(`在分类页找到: ${card.title}`);
      return card.listUrl;
    }
    return null;
  }

  private async fetchPage(url: string): Promise<{ html: string; url: string }> {
    const result = await this.http.fetch(url);
    if (result.status !== 200 || result.body.length < 1000) {
      throw new Error(
        `抓取失败: ${url}, status=${result.status}, size=${result.body.length}`,
      );
    }
    await this.sleep(this.RATE_LIMIT_MS);
    return { html: result.body, url: result.url || url };
  }

  private buildPageUrl(listUrl: string, page: number): string {
    const url = new URL(listUrl);
    url.searchParams.set('page', String(page));
    return url.toString();
  }

  private async saveResource(
    detail: ReturnType<WebtoonsParser['parseDetail']>,
    titleNo: number,
  ): Promise<Resource> {
    let resource = await this.resourceRepo.findOne({
      where: { title: detail.title, type: ResourceType.COMIC },
    });

    if (!resource) {
      resource = this.resourceRepo.create({
        type: ResourceType.COMIC,
        title: detail.title,
        summary: detail.summary,
        coverUrl: detail.coverUrl,
        status: detail.status,
        language: 'zh-hant',
        rating: detail.rating ? parseFloat(detail.rating) : undefined,
        isComplete: detail.status === 'completed' ? 1 : 0,
        extra: {
          viewCount: detail.viewCount,
          subscribeCount: detail.subscribeCount,
          updateDay: detail.updateDay,
        },
      });
      resource = await this.resourceRepo.save(resource);
      this.logger.log(`创建资源: ${resource.title} (id=${resource.id})`);
    } else {
      resource.summary = detail.summary;
      resource.coverUrl = detail.coverUrl;
      resource.status = detail.status;
      resource.extra = {
        viewCount: detail.viewCount,
        subscribeCount: detail.subscribeCount,
        updateDay: detail.updateDay,
      };
      resource = await this.resourceRepo.save(resource);
    }

    return resource;
  }

  private async saveResourceSource(
    site: SourceSite,
    resource: Resource,
    titleNo: number,
    listUrl: string,
    html: string,
  ): Promise<void> {
    let rs = await this.resourceSourceRepo.findOne({
      where: { sourceSiteId: site.id, sourceId: String(titleNo) },
    });
    if (!rs) {
      rs = this.resourceSourceRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        sourceUrl: listUrl,
        sourceId: String(titleNo),
        rawTitle: resource.title,
      });
    }
    rs.lastScrapedAt = new Date();
    rs.scrapeStatus = 'running';
    rs = await this.resourceSourceRepo.save(rs);
  }

  private async saveAuthors(
    resource: Resource,
    authorNames: string[],
  ): Promise<void> {
    for (const name of authorNames) {
      if (!name) continue;
      let author = await this.authorRepo.findOne({
        where: { name, type: AuthorType.AUTHOR },
      });
      if (!author) {
        author = this.authorRepo.create({ name, type: AuthorType.AUTHOR });
        author = await this.authorRepo.save(author);
      }
      const exists = await this.resourceAuthorRepo.findOne({
        where: { resourceId: resource.id, authorId: author.id },
      });
      if (!exists) {
        await this.resourceAuthorRepo.save({
          resourceId: resource.id,
          authorId: author.id,
        });
      }
    }
  }

  private async saveCategory(
    resource: Resource,
    genreName: string,
  ): Promise<void> {
    if (!genreName) return;
    let category = await this.categoryRepo.findOne({
      where: { name: genreName, resourceType: ResourceType.COMIC },
    });
    if (!category) {
      category = this.categoryRepo.create({
        name: genreName,
        resourceType: ResourceType.COMIC,
      });
      category = await this.categoryRepo.save(category);
    }
    const exists = await this.resourceCategoryRepo.findOne({
      where: { resourceId: resource.id, categoryId: category.id },
    });
    if (!exists) {
      await this.resourceCategoryRepo.save({
        resourceId: resource.id,
        categoryId: category.id,
      });
    }
  }

  private async saveChapter(
    resource: Resource,
    site: SourceSite,
    ep: ReturnType<WebtoonsParser['parseEpisodeList']>[0],
  ): Promise<Chapter | null> {
    let chapter = await this.chapterRepo.findOne({
      where: {
        resourceId: resource.id,
        sourceSiteId: site.id,
        orderIndex: ep.episodeNo,
      },
    });

    if (!chapter) {
      chapter = this.chapterRepo.create({
        resourceId: resource.id,
        sourceSiteId: site.id,
        orderIndex: ep.episodeNo,
        title: ep.title,
        chapterType: ChapterType.IMAGE,
        sourceUrl: ep.viewerUrl,
        extra: {
          thumbnail: ep.thumbnail,
          likeCount: ep.likeCount,
          publishedDate: ep.publishedDate,
        },
      });
      chapter = await this.chapterRepo.save(chapter);
    }

    return chapter;
  }

  private async scrapeChapterImages(
    chapter: Chapter,
    viewerUrl: string,
  ): Promise<number> {
    if (chapter.isDownloaded) {
      const count = await this.chapterImageRepo.count({
        where: { chapterId: chapter.id },
      });
      return count;
    }

    this.logger.log(`抓取章节图片: ${chapter.title} -> ${viewerUrl}`);
    const { html } = await this.fetchPage(viewerUrl);
    const images = this.parser.parseViewerImages(html);
    this.logger.log(`章节 ${chapter.title}: ${images.length} 张图片`);

    const imageEntities: Partial<ChapterImage>[] = images.map((img) => ({
      chapterId: chapter.id,
      orderIndex: img.orderIndex,
      sourceUrl: img.imageUrl,
      status: 'pending',
    }));
    await this.chapterImageRepo
      .createQueryBuilder()
      .insert()
      .into(ChapterImage)
      .values(imageEntities)
      .orIgnore()
      .execute();

    chapter.pageCount = images.length;
    chapter.isDownloaded = 1;
    chapter.downloadedAt = new Date();
    await this.chapterRepo.save(chapter);

    return images.length;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
