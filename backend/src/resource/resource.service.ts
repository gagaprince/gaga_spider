import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { Chapter } from '../entities/chapter.entity';
import { ChapterImage } from '../entities/chapter-image.entity';
import { Author } from '../entities/author.entity';
import { Category } from '../entities/category.entity';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
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
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(query: {
    type?: string;
    keyword?: string;
    scrapeStatus?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { type, keyword, scrapeStatus, category, page = 1, pageSize = 20 } = query;
    const qb = this.resourceRepo.createQueryBuilder('r');

    if (type) {
      qb.andWhere('r.type = :type', { type });
    }
    if (keyword) {
      qb.andWhere('r.title LIKE :keyword', { keyword: `%${keyword}%` });
    }
    if (category) {
      qb.andWhere('r.category = :category', { category });
    }

    if (scrapeStatus === 'scraped') {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(Chapter, 'ch')
          .where('ch.resource_id = r.id')
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
    } else if (scrapeStatus === 'not_scraped') {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(Chapter, 'ch')
          .where('ch.resource_id = r.id')
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      });
    }

    qb.orderBy('r.updated_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    const itemsWithChapters = await Promise.all(
      items.map(async (item) => {
        const chapterCount = await this.chapterRepo.count({
          where: { resourceId: item.id },
        });
        return { ...item, chapterCount };
      }),
    );

    return { items: itemsWithChapters, total, page, pageSize };
  }

  async findOne(id: number) {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;

    const [sources, chapters, authors, categories] = await Promise.all([
      this.resourceSourceRepo.find({ where: { resourceId: id } }),
      this.chapterRepo.find({
        where: { resourceId: id },
        order: { orderIndex: 'ASC' },
      }),
      this.getAuthors(id),
      this.getCategories(id),
    ]);

    return {
      ...resource,
      sources,
      chapters: chapters.map((c) => ({
        id: c.id,
        orderIndex: c.orderIndex,
        title: c.title,
        chapterType: c.chapterType,
        pageCount: c.pageCount,
        isDownloaded: c.isDownloaded,
        downloadedAt: c.downloadedAt,
        sourceUrl: c.sourceUrl,
      })),
      authors,
      categories,
    };
  }

  async listCategories() {
    const result = await this.resourceRepo
      .createQueryBuilder('r')
      .select('r.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('r.category IS NOT NULL')
      .groupBy('r.category')
      .orderBy('count', 'DESC')
    .getRawMany();
   return result.map((r: any) => ({ name: r.category, count: Number(r.count) }));
 }

  async getChapterWithImages(chapterId: number) {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId } });
    if (!chapter) return null;

    const images = await this.chapterImageRepo.find({
      where: { chapterId },
      order: { orderIndex: 'ASC' },
    });

    const siblings = await this.chapterRepo.find({
      where: { resourceId: chapter.resourceId },
      order: { orderIndex: 'ASC' },
    });
    const idx = siblings.findIndex((s) => s.id === chapterId);
    const prevChapter = idx > 0
      ? { id: siblings[idx - 1].id, orderIndex: siblings[idx - 1].orderIndex, title: siblings[idx - 1].title }
      : null;
    const nextChapter = idx < siblings.length - 1
      ? { id: siblings[idx + 1].id, orderIndex: siblings[idx + 1].orderIndex, title: siblings[idx + 1].title }
      : null;

    return {
      id: chapter.id,
      resourceId: chapter.resourceId,
      orderIndex: chapter.orderIndex,
      title: chapter.title,
      pageCount: chapter.pageCount,
      isDownloaded: chapter.isDownloaded,
      images: images.map((img) => ({
        id: img.id,
        orderIndex: img.orderIndex,
        sourceUrl: img.sourceUrl,
        localPath: img.localPath,
        status: img.status,
      })),
      prevChapter,
      nextChapter,
    };
  }

  async exportPdf(resourceId: number): Promise<{ pdfPath: string }> {
    const resource = await this.resourceRepo.findOne({ where: { id: resourceId } });
    if (!resource) throw new Error('资源不存在');

    const chapters = await this.chapterRepo.find({
      where: { resourceId },
      order: { orderIndex: 'ASC' },
    });
    if (chapters.length === 0) throw new Error('该资源没有章节,无法导出');

    // 收集所有已下载的本地图片路径
    const allImages: { chapterTitle: string; localPath: string }[] = [];
    for (const chapter of chapters) {
      const images = await this.chapterImageRepo.find({
        where: { chapterId: chapter.id, status: 'downloaded' },
        order: { orderIndex: 'ASC' },
      });
      for (const img of images) {
        if (img.localPath) {
          allImages.push({ chapterTitle: chapter.title, localPath: img.localPath });
        }
      }
    }
    if (allImages.length === 0) throw new Error('没有已下载的图片,请先抓取');

    // 输出路径: resourceFiles/pdfs/{resourceId}.pdf
    const pdfDir = path.join(this.settingsService.resourcePath, 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    const filename = `${resourceId}.pdf`;
    const filepath = path.join(pdfDir, filename);
    const webPath = `/resourceFiles/pdfs/${filename}`;

    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    let addedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < allImages.length; i++) {
      const { localPath } = allImages[i];
      const absPath = path.join(this.settingsService.resourcePath, localPath.replace('/resourceFiles/', ''));
      if (!fs.existsSync(absPath)) {
        skippedCount++;
        continue;
      }

      // pdfkit 仅支持 JPEG / PNG,跳过 GIF 等不支持的格式
      const ext = path.extname(absPath).toLowerCase();
      if (ext === '.gif' || ext === '.webp' || ext === '.bmp' || ext === '.svg') {
        this.logger.warn(`跳过不支持的图片格式: ${absPath}`);
        skippedCount++;
        continue;
      }

      try {
        const img = (doc as any).openImage(absPath);
        const maxWidth = 595;
        const scale = Math.min(1, maxWidth / img.width);
        const w = img.width * scale;
        const h = img.height * scale;
        doc.addPage({ size: [w, h] });
        doc.image(img, 0, 0, { width: w, height: h });
        addedCount++;
      } catch (e) {
        this.logger.warn(`跳过无法解析的图片: ${absPath} - ${e instanceof Error ? e.message : e}`);
        skippedCount++;
      }
    }

    this.logger.log(`PDF 导出完成: ${resource.title} - 成功 ${addedCount} 张, 跳过 ${skippedCount} 张`);

    if (addedCount === 0) {
      throw new Error('没有可导出的图片(均为不支持的格式或文件不存在)');
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    resource.pdfPath = webPath;
    await this.resourceRepo.save(resource);

    return { pdfPath: webPath };
  }

  private async getAuthors(resourceId: number) {
    return this.authorRepo
      .createQueryBuilder('a')
      .innerJoin('resource_authors', 'ra', 'ra.author_id = a.id')
      .where('ra.resource_id = :resourceId', { resourceId })
      .getMany();
  }

  private async getCategories(resourceId: number) {
    return this.categoryRepo
      .createQueryBuilder('c')
      .innerJoin('resource_categories', 'rc', 'rc.category_id = c.id')
      .where('rc.resource_id = :resourceId', { resourceId })
      .getMany();
  }
}
