import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as os from 'os';
import PDFDocument from 'pdfkit';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { SourceSite } from '../entities/source-site.entity';
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
    completion?: string;
    sourceSite?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      type,
      keyword,
      scrapeStatus,
      category,
      completion,
      sourceSite,
      page = 1,
      pageSize = 20,
    } = query;
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
    if (completion === 'completed') {
      qb.andWhere('r.status = :status', { status: 'completed' });
    } else if (completion === 'ongoing') {
      qb.andWhere('r.status = :status', { status: 'ongoing' });
    }

    if (sourceSite) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(ResourceSource, 'rs')
          .innerJoin(
            SourceSite,
            'ss',
            'ss.id = rs.source_site_id AND ss.domain = :domain',
            { domain: sourceSite },
          )
          .where('rs.resource_id = r.id')
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
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
    return result.map((r: any) => ({
      name: r.category,
      count: Number(r.count),
    }));
  }

  async getChapterWithImages(chapterId: number) {
    const chapter = await this.chapterRepo.findOne({
      where: { id: chapterId },
    });
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
    const prevChapter =
      idx > 0
        ? {
            id: siblings[idx - 1].id,
            orderIndex: siblings[idx - 1].orderIndex,
            title: siblings[idx - 1].title,
          }
        : null;
    const nextChapter =
      idx < siblings.length - 1
        ? {
            id: siblings[idx + 1].id,
            orderIndex: siblings[idx + 1].orderIndex,
            title: siblings[idx + 1].title,
          }
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
    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId },
    });
    if (!resource) throw new Error('资源不存在');

    const chapters = await this.chapterRepo.find({
      where: { resourceId },
      order: { orderIndex: 'ASC' },
    });
    if (chapters.length === 0) throw new Error('该资源没有章节,无法导出');

    // 按章节收集已下载的图片路径
    const chapterImages: { chapterTitle: string; localPaths: string[] }[] = [];
    for (const chapter of chapters) {
      const images = await this.chapterImageRepo.find({
        where: { chapterId: chapter.id, status: 'downloaded' },
        order: { orderIndex: 'ASC' },
      });
      const localPaths = images
        .map((img) => img.localPath)
        .filter(Boolean) as string[];
      if (localPaths.length > 0) {
        chapterImages.push({ chapterTitle: chapter.title, localPaths });
      }
    }
    if (chapterImages.length === 0)
      throw new Error('没有已下载的图片,请先抓取');

    // 查询资源关联的源站,判断是否需要跳过首图(Webtoons 首图为广告)
    const resourceSource = await this.resourceSourceRepo.findOne({
      where: { resourceId },
      relations: ['sourceSite'],
    });
    const skipFirstImage = resourceSource?.sourceSite?.domain === 'www.webtoons.com';

    // 输出路径: resourceFiles/pdfs/{resourceId}.pdf
    const pdfDir = path.join(this.settingsService.resourcePath, 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    // 文件名使用漫画标题,清理文件系统非法字符
    const safeTitle =
      resource.title.replace(/[\/\\:*?"<>|]/g, '_').trim() ||
      `resource_${resourceId}`;
    const filename = `${safeTitle}.pdf`;
    const filepath = path.join(pdfDir, filename);
    const webPath = `/resourceFiles/pdfs/${encodeURIComponent(filename)}`;

    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    let addedCount = 0;
    let convertedCount = 0;
    let skippedCount = 0;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaga-pdf-'));

    // 按章节排版: 每个章节的图片垂直堆叠在一页上,章节间强制另起一页
    const pageWidth = 595; // A4 宽度 (pt)
    const maxPageHeight = 14400; // PDF 单页最大高度 (200 inch)

    interface ImgEntry {
      img: any;
      w: number;
      h: number;
    }

    // 输出一组图片到一页
    const flushPage = (items: ImgEntry[]) => {
      if (items.length === 0) return;
      const totalHeight = items.reduce((sum, e) => sum + e.h, 0);
      doc.addPage({ size: [pageWidth, totalHeight] });
      let y = 0;
      for (const entry of items) {
        doc.image(entry.img, 0, y, { width: entry.w, height: entry.h });
        y += entry.h;
      }
      addedCount += items.length;
    };

    try {
      let imgIdx = 0;
      for (const chapter of chapterImages) {
        // 收集当前章节所有图片
        const chapterEntries: ImgEntry[] = [];
        // Webtoons 每章第一张图为广告图,导出时跳过;动漫嗨无需跳过
        const paths = skipFirstImage ? chapter.localPaths.slice(1) : chapter.localPaths;
        for (const localPath of paths) {
          const absPath = path.join(
            this.settingsService.resourcePath,
            localPath.replace('/resourceFiles/', ''),
          );
          if (!fs.existsSync(absPath)) {
            skippedCount++;
            continue;
          }

          let imgPath = absPath;
          const ext = path.extname(absPath).toLowerCase();

          if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            const tmpPng = path.join(tmpDir, `conv_${imgIdx}.png`);
            try {
              execFileSync(
                'sips',
                ['-s', 'format', 'png', absPath, '--out', tmpPng],
                {
                  stdio: 'pipe',
                  timeout: 30000,
                },
              );
              imgPath = tmpPng;
              convertedCount++;
            } catch (e) {
              this.logger.warn(`格式转换失败,跳过: ${absPath}`);
              skippedCount++;
              continue;
            }
          }

          try {
            const img = (doc as any).openImage(imgPath);
            const scale = Math.min(1, pageWidth / img.width);
            chapterEntries.push({
              img,
              w: img.width * scale,
              h: img.height * scale,
            });
          } catch (e) {
            this.logger.warn(
              `无法解析图片,跳过: ${imgPath} - ${e instanceof Error ? e.message : e}`,
            );
            skippedCount++;
          }
          imgIdx++;
        }

        // 按最大页高分页输出当前章节
        let pageItems: ImgEntry[] = [];
        let pageHeight = 0;
        for (const entry of chapterEntries) {
          // 单张图超过最大页高时,单独成页
          if (entry.h > maxPageHeight) {
            flushPage(pageItems);
            pageItems = [];
            pageHeight = 0;
            const scaleH = maxPageHeight / entry.h;
            doc.addPage({ size: [pageWidth, maxPageHeight] });
            doc.image(entry.img, 0, 0, {
              width: entry.w * scaleH,
              height: maxPageHeight,
            });
            addedCount++;
            continue;
          }

          if (pageHeight + entry.h > maxPageHeight) {
            flushPage(pageItems);
            pageItems = [];
            pageHeight = 0;
          }

          pageItems.push(entry);
          pageHeight += entry.h;
        }
        flushPage(pageItems);
        // 章节结束,下一章节自动另起一页
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    this.logger.log(
      `PDF 导出完成: ${resource.title} - 成功 ${addedCount} 张(其中 ${convertedCount} 张格式转换), 跳过 ${skippedCount} 张`,
    );

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
