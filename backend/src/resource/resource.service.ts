import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '../entities/resource.entity';
import { ResourceSource } from '../entities/resource-source.entity';
import { Chapter } from '../entities/chapter.entity';
import { ChapterImage } from '../entities/chapter-image.entity';
import { Author } from '../entities/author.entity';
import { Category } from '../entities/category.entity';

@Injectable()
export class ResourceService {
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
