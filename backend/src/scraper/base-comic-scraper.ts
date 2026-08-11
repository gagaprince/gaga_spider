import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { HttpClient } from './http-client';
import { SourceSite } from '../entities/source-site.entity';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { Chapter } from '../entities/chapter.entity';
import { ChapterImage } from '../entities/chapter-image.entity';
import { Author, AuthorType } from '../entities/author.entity';
import { ResourceAuthor } from '../entities/resource-author.entity';
import { Category } from '../entities/category.entity';
import { ResourceCategory } from '../entities/resource-category.entity';
import { ResourceType } from '../constants/resource-type';
import { TaskService } from '../task/task.service';
import { SettingsService } from '../settings/settings.service';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

export interface ScrapeResult {
  resource: { id: number; title: string };
  chapters: { id: number; title: string; imageCount: number }[];
}

export abstract class BaseComicScraper {
  protected abstract readonly logger: Logger;
  protected readonly http: HttpClient;

  protected abstract get baseUrl(): string;
  protected abstract get rateLimitMs(): number;
  protected get referer(): string {
    return this.baseUrl;
  }
  protected readonly COVER_MAX_RETRIES = 3;
  protected readonly COVER_RETRY_DELAY_MS = 1000;
  protected readonly IMAGE_DOWNLOAD_TIMEOUT_S = 10;

  constructor(
    protected readonly sourceSiteRepo: Repository<SourceSite>,
    protected readonly resourceRepo: Repository<Resource>,
    protected readonly resourceSourceRepo: Repository<ResourceSource>,
    protected readonly chapterRepo: Repository<Chapter>,
    protected readonly chapterImageRepo: Repository<ChapterImage>,
    protected readonly authorRepo: Repository<Author>,
    protected readonly resourceAuthorRepo: Repository<ResourceAuthor>,
    protected readonly categoryRepo: Repository<Category>,
    protected readonly resourceCategoryRepo: Repository<ResourceCategory>,
    protected readonly taskService: TaskService,
    protected readonly settingsService: SettingsService,
  ) {
    this.http = new HttpClient();
  }

  protected checkCancelled(taskId: number): void {
    if (this.taskService.isCancelled(taskId)) {
      throw new Error('任务已被用户停止');
    }
  }

  protected async fetchPage(
    url: string,
  ): Promise<{ html: string; url: string }> {
    const result = await this.http.fetch(url);
    if (result.status !== 200 || result.body.length < 1000) {
      throw new Error(
        `抓取失败: ${url}, status=${result.status}, size=${result.body.length}`,
      );
    }
    await this.sleep(this.rateLimitMs);
    return { html: result.body, url: result.url || url };
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async saveAuthors(
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

  protected async saveCategory(
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

  protected async downloadCover(
    sourceId: string,
    coverUrl: string,
    genre: string,
  ): Promise<string | null> {
    if (!coverUrl) return null;

    const ext = extname(new URL(coverUrl).pathname).split('?')[0] || '.jpg';
    const dir = join(
      this.settingsService.resourcePath,
      'covers',
      genre || 'other',
    );
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filename = `${sourceId}${ext}`;
    const filepath = join(dir, filename);
    const webPath = `/resourceFiles/covers/${genre || 'other'}/${filename}`;

    if (existsSync(filepath)) {
      return webPath;
    }

    for (let attempt = 1; attempt <= this.COVER_MAX_RETRIES; attempt++) {
      try {
        this.logger.log(
          `下载封面: ${sourceId}, ${coverUrl} (第 ${attempt}/${this.COVER_MAX_RETRIES} 次)`,
        );
        const result = await this.http.download(
          coverUrl,
          filepath,
          {
            Referer: this.referer,
          },
          this.IMAGE_DOWNLOAD_TIMEOUT_S,
        );

        if (result.status === 200 && result.size && result.size > 0) {
          return webPath;
        }

        this.logger.warn(
          `封面下载失败: ${sourceId} (第 ${attempt} 次), status=${result.status}${result.error ? ', error=' + result.error : ''}`,
        );
      } catch (e) {
        this.logger.warn(`封面下载异常: ${sourceId} (第 ${attempt} 次): ${e}`);
      }

      if (attempt < this.COVER_MAX_RETRIES) {
        await this.sleep(this.COVER_RETRY_DELAY_MS * attempt);
      }
    }

    this.logger.warn(
      `封面下载最终失败: ${sourceId}, 已重试 ${this.COVER_MAX_RETRIES} 次`,
    );
    return null;
  }

  protected computeImagePath(
    sourceId: string,
    chapterOrderIndex: number,
    orderIndex: number,
    imageUrl: string,
  ): { filepath: string; webPath: string } {
    const ext = extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg';
    const filename = `${String(orderIndex).padStart(4, '0')}${ext}`;
    const dir = join(
      this.settingsService.resourcePath,
      'images',
      sourceId,
      String(chapterOrderIndex),
    );
    const filepath = join(dir, filename);
    const webPath = `/resourceFiles/images/${sourceId}/${chapterOrderIndex}/${filename}`;
    return { filepath, webPath };
  }

  protected async downloadChapterImage(
    filepath: string,
    webPath: string,
    imageUrl: string,
  ): Promise<string | null> {
    if (!imageUrl) return null;

    const dir = join(filepath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(filepath)) {
      return webPath;
    }

    for (let attempt = 1; attempt <= this.COVER_MAX_RETRIES; attempt++) {
      try {
        const result = await this.http.download(
          imageUrl,
          filepath,
          { Referer: this.referer },
          this.IMAGE_DOWNLOAD_TIMEOUT_S,
        );

        if (result.status === 200 && result.size && result.size > 0) {
          return webPath;
        }

        this.logger.warn(
          `图片下载失败(第 ${attempt} 次), status=${result.status}${result.error ? ', error=' + result.error : ''}`,
        );
      } catch (e) {
        this.logger.warn(
          `图片下载异常(第 ${attempt} 次): ${e instanceof Error ? e.message : e}`,
        );
      }

      if (attempt < this.COVER_MAX_RETRIES) {
        await this.sleep(this.COVER_RETRY_DELAY_MS * attempt);
      }
    }

    return null;
  }
}
