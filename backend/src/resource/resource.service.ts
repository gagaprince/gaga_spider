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
    const skipFirstImage =
      resourceSource?.sourceSite?.domain === 'www.webtoons.com';

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

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaga-pdf-'));
    const counters = { added: 0, converted: 0, skipped: 0, imgIdx: 0 };

    try {
      for (const chapter of chapterImages) {
        const paths = skipFirstImage
          ? chapter.localPaths.slice(1)
          : chapter.localPaths;
        this.renderImagesToDoc(doc, paths, tmpDir, counters);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    this.logger.log(
      `PDF 导出完成: ${resource.title} - 成功 ${counters.added} 张(其中 ${counters.converted} 张格式转换), 跳过 ${counters.skipped} 张`,
    );

    if (counters.added === 0) {
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

  /**
   * 将一组章节图片渲染到一个 PDFDocument 中,按最大页高自动分页。
   * exportPdf(整本合订)与 exportChapterPdfs(按章节)共用此逻辑。
   */
  private renderImagesToDoc(
    doc: InstanceType<typeof PDFDocument>,
    localPaths: string[],
    tmpDir: string,
    counters: {
      added: number;
      converted: number;
      skipped: number;
      imgIdx: number;
    },
  ): void {
    const pageWidth = 595; // A4 宽度 (pt)
    const maxPageHeight = 14400; // PDF 单页最大高度 (200 inch)

    interface ImgEntry {
      img: any;
      w: number;
      h: number;
    }

    const flushPage = (items: ImgEntry[]) => {
      if (items.length === 0) return;
      const totalHeight = items.reduce((sum, e) => sum + e.h, 0);
      doc.addPage({ size: [pageWidth, totalHeight] });
      let y = 0;
      for (const entry of items) {
        doc.image(entry.img, 0, y, { width: entry.w, height: entry.h });
        y += entry.h;
      }
      counters.added += items.length;
    };

    // 收集当前章节所有图片
    const chapterEntries: ImgEntry[] = [];
    for (const localPath of localPaths) {
      const absPath = path.join(
        this.settingsService.resourcePath,
        localPath.replace('/resourceFiles/', ''),
      );
      if (!fs.existsSync(absPath)) {
        counters.skipped++;
        continue;
      }

      let imgPath = absPath;
      const ext = path.extname(absPath).toLowerCase();

      // 非 jpg/png 图片用 sips 转成 png 再插入
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
        const tmpPng = path.join(tmpDir, `conv_${counters.imgIdx}.png`);
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
          counters.converted++;
        } catch (e) {
          this.logger.warn(`格式转换失败,跳过: ${absPath}`);
          counters.skipped++;
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
        counters.skipped++;
      }
      counters.imgIdx++;
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
        counters.added++;
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
  }

  /**
   * 按章节生成 PDF: 每个章节单独一个 PDF 文件,避免整本过大不便观看。
   * 输出目录: resourceFiles/pdfs/chapters_{resourceId}/
   * 文件名: {orderIndex padded}_{章节标题}.pdf
   */
  async exportChapterPdfs(resourceId: number): Promise<{
    chapters: {
      chapterId: number;
      orderIndex: number;
      title: string;
      pdfPath: string;
      imageCount: number;
    }[];
  }> {
    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId },
    });
    if (!resource) throw new Error('资源不存在');

    const chapters = await this.chapterRepo.find({
      where: { resourceId },
      order: { orderIndex: 'ASC' },
    });
    if (chapters.length === 0) throw new Error('该资源没有章节,无法导出');

    const resourceSource = await this.resourceSourceRepo.findOne({
      where: { resourceId },
      relations: ['sourceSite'],
    });
    const skipFirstImage =
      resourceSource?.sourceSite?.domain === 'www.webtoons.com';

    const chapterDir = path.join(
      this.settingsService.resourcePath,
      'pdfs',
      `chapters_${resourceId}`,
    );
    // 每次重新生成都清空旧目录,避免残留过期章节文件
    if (fs.existsSync(chapterDir)) {
      fs.rmSync(chapterDir, { recursive: true, force: true });
    }
    fs.mkdirSync(chapterDir, { recursive: true });

    // 旧的整体 zip 缓存一并清除,打包下载时按需重新生成
    const zipAbs = path.join(
      this.settingsService.resourcePath,
      'pdfs',
      `chapters_${resourceId}.zip`,
    );
    if (fs.existsSync(zipAbs)) {
      fs.rmSync(zipAbs, { force: true });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaga-pdf-'));
    const counters = { added: 0, converted: 0, skipped: 0, imgIdx: 0 };
    const result: {
      chapterId: number;
      orderIndex: number;
      title: string;
      pdfPath: string;
      imageCount: number;
    }[] = [];

    try {
      for (const chapter of chapters) {
        const images = await this.chapterImageRepo.find({
          where: { chapterId: chapter.id, status: 'downloaded' },
          order: { orderIndex: 'ASC' },
        });
        const localPaths = images
          .map((img) => img.localPath)
          .filter(Boolean) as string[];
        if (localPaths.length === 0) continue;

        const paths = skipFirstImage ? localPaths.slice(1) : localPaths;
        const safeChapterTitle =
          chapter.title.replace(/[\/\\:*?"<>|]/g, '_').trim() ||
          `chapter_${chapter.orderIndex}`;
        const filename = `${String(chapter.orderIndex).padStart(4, '0')}_${safeChapterTitle}.pdf`;
        const filepath = path.join(chapterDir, filename);
        const webPath = `/resourceFiles/pdfs/chapters_${resourceId}/${encodeURIComponent(filename)}`;

        const doc = new PDFDocument({ autoFirstPage: false });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);
        const before = counters.added;
        this.renderImagesToDoc(doc, paths, tmpDir, counters);
        const chapterAdded = counters.added - before;
        doc.end();

        await new Promise<void>((resolve, reject) => {
          stream.on('finish', () => resolve());
          stream.on('error', reject);
        });

        if (chapterAdded === 0) {
          fs.rmSync(filepath, { force: true });
          continue;
        }
        result.push({
          chapterId: chapter.id,
          orderIndex: chapter.orderIndex,
          title: chapter.title,
          pdfPath: webPath,
          imageCount: chapterAdded,
        });
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (result.length === 0) {
      throw new Error('没有可导出的图片,请先抓取');
    }

    this.logger.log(
      `按章节导出完成: ${resource.title} - ${result.length} 个章节PDF, 共 ${counters.added} 张图片`,
    );
    return { chapters: result };
  }

  /**
   * 列出已生成的按章节 PDF(扫描目录),用于页面刷新后回显下载链接。
   */
  async listChapterPdfs(resourceId: number): Promise<{
    chapters: { orderIndex: number; title: string; pdfPath: string }[];
  }> {
    const chapterDir = path.join(
      this.settingsService.resourcePath,
      'pdfs',
      `chapters_${resourceId}`,
    );
    if (!fs.existsSync(chapterDir)) return { chapters: [] };

    const files = fs
      .readdirSync(chapterDir)
      .filter((f) => f.endsWith('.pdf'))
      .sort();

    const chapters = files.map((f) => {
      const m = f.match(/^(\d+)_(.*)\.pdf$/);
      const orderIndex = m ? parseInt(m[1], 10) : 0;
      const title = m ? m[2] : f.replace(/\.pdf$/, '');
      return {
        orderIndex,
        title,
        pdfPath: `/resourceFiles/pdfs/chapters_${resourceId}/${encodeURIComponent(f)}`,
      };
    });
    return { chapters };
  }

  /**
   * 将所有按章节 PDF 打包成 zip(用系统 zip 命令),返回绝对路径与建议下载文件名。
   * 由 controller 流式返回并设置 Content-Disposition。
   */
  async ensureChapterPdfsZip(
    resourceId: number,
  ): Promise<{ absPath: string; downloadName: string }> {
    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId },
    });
    if (!resource) throw new Error('资源不存在');

    const chapterDir = path.join(
      this.settingsService.resourcePath,
      'pdfs',
      `chapters_${resourceId}`,
    );
    if (!fs.existsSync(chapterDir)) {
      throw new Error('请先按章节导出 PDF');
    }

    const files = fs
      .readdirSync(chapterDir)
      .filter((f) => f.endsWith('.pdf'))
      .sort();
    if (files.length === 0) {
      throw new Error('没有可打包的章节 PDF');
    }

    const zipAbs = path.join(
      this.settingsService.resourcePath,
      'pdfs',
      `chapters_${resourceId}.zip`,
    );
    if (fs.existsSync(zipAbs)) {
      fs.rmSync(zipAbs, { force: true });
    }

    // -j: 不保留目录结构,zip 内只存文件名
    execFileSync(
      'zip',
      ['-j', zipAbs, ...files.map((f) => path.join(chapterDir, f))],
      { stdio: 'pipe', timeout: 300000 },
    );

    if (!fs.existsSync(zipAbs) || fs.statSync(zipAbs).size === 0) {
      throw new Error('打包失败');
    }

    const safeTitle =
      resource.title.replace(/[\/\\:*?"<>|]/g, '_').trim() ||
      `resource_${resourceId}`;
    return { absPath: zipAbs, downloadName: `${safeTitle}_分章PDF.zip` };
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
