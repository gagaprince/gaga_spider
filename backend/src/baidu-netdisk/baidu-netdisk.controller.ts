import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Query,
  Sse,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { BaiduNetdiskService } from './baidu-netdisk.service';
import { SettingsService } from '../settings/settings.service';
import { Resource } from '../entities/resource.entity';
import { ResourceCategory } from '../entities/resource-category.entity';
import { Category } from '../entities/category.entity';
import { AgeRating } from '../constants/age-rating';

@Controller('baidu-netdisk')
export class BaiduNetdiskController {
  constructor(
    private readonly baiduService: BaiduNetdiskService,
    private readonly settingsService: SettingsService,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceCategory)
    private readonly resourceCategoryRepo: Repository<ResourceCategory>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  @Get('status')
  getStatus() {
    const cli = this.baiduService.checkCli();
    const config = this.baiduService.getConfig();
    return { ...config, cli };
  }

  // ─── SSE: 上传整本 PDF ────────────────────────────────────

  @Sse('upload-pdf/:id/stream')
  async uploadPdfStream(
    @Param('id', ParseIntPipe) id: number,
    @Query('sourceSiteId') sourceSiteId?: string,
  ): Promise<Observable<MessageEvent>> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) throw new Error('资源不存在');

    const sid = sourceSiteId ? parseInt(sourceSiteId, 10) : undefined;
    const { absPath, remotePath } = await this.resolveSinglePdfPath(
      resource,
      sid,
    );

    if (!fs.existsSync(absPath)) {
      throw new Error('PDF 文件不存在，请先导出 PDF');
    }

    const fileName = path.basename(absPath);

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({
        data: JSON.stringify({
          type: 'start',
          message: `开始上传: ${fileName}`,
        }),
      });

      this.baiduService
        .uploadFileWithProgress(absPath, remotePath, (progress) => {
          subscriber.next({ data: JSON.stringify(progress) });
        })
        .then((result) => {
          subscriber.next({
            data: JSON.stringify({
              type: 'complete',
              remotePath: result.remotePath,
              size: result.size,
            }),
          });
          subscriber.complete();
        })
        .catch((err: Error) => {
          subscriber.next({
            data: JSON.stringify({ type: 'error', message: err.message }),
          });
          subscriber.complete();
        });
    });
  }

  // ─── SSE: 上传所有分章 PDF + ZIP ─────────────────────────

  @Sse('upload-chapter-pdfs/:id/stream')
  async uploadChapterPdfsStream(
    @Param('id', ParseIntPipe) id: number,
    @Query('sourceSiteId') sourceSiteId?: string,
  ): Promise<Observable<MessageEvent>> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) throw new Error('资源不存在');

    const sid = sourceSiteId ? parseInt(sourceSiteId, 10) : undefined;
    const files = await this.resolveChapterFiles(resource, sid);

    if (files.length === 0) {
      throw new Error('请先按章节导出 PDF');
    }

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({
        data: JSON.stringify({
          type: 'start',
          total: files.length,
          message: `准备上传 ${files.length} 个文件`,
        }),
      });

      this.baiduService
        .uploadBatchWithProgress(files, (progress) => {
          subscriber.next({ data: JSON.stringify(progress) });
        })
        .then((result) => {
          subscriber.next({
            data: JSON.stringify({
              type: 'complete',
              uploaded: result.uploaded.length,
              failed: result.failed.length,
              failures: result.failed,
            }),
          });
          subscriber.complete();
        })
        .catch((err: Error) => {
          subscriber.next({
            data: JSON.stringify({ type: 'error', message: err.message }),
          });
          subscriber.complete();
        });
    });
  }

  // ─── 路径解析 ───────────────────────────────────────────────

  private async resolveSinglePdfPath(
    resource: Resource,
    sourceSiteId?: number,
  ): Promise<{ absPath: string; remotePath: string }> {
    const safeTitle = this.makeSafeTitle(resource);
    const categoryName = await this.resolveCategory(resource.id);
    const subDir = resource.ageRating === AgeRating.ADULT ? '18' : '';

    const pdfDir = path.join(
      this.settingsService.resourcePath,
      ...(subDir ? [subDir] : []),
      'pdfs',
    );
    const suffix = sourceSiteId ? `_${sourceSiteId}` : '';
    const absPath = path.join(pdfDir, `${safeTitle}${suffix}.pdf`);

    const remoteDir = this.buildRemoteDir(
      categoryName,
      safeTitle,
      resource.ageRating,
    );
    const remotePath = path.posix.join(remoteDir, `${safeTitle}.pdf`);

    return { absPath, remotePath };
  }

  private async resolveChapterFiles(
    resource: Resource,
    sourceSiteId?: number,
  ): Promise<{ localAbsPath: string; remotePath: string }[]> {
    const safeTitle = this.makeSafeTitle(resource);
    const categoryName = await this.resolveCategory(resource.id);
    const subDir = resource.ageRating === AgeRating.ADULT ? '18' : '';

    const pdfsFsBase = path.join(
      this.settingsService.resourcePath,
      ...(subDir ? [subDir] : []),
      'pdfs',
    );
    const dirName = sourceSiteId
      ? `chapters_${resource.id}_${sourceSiteId}`
      : `chapters_${resource.id}`;
    const absChapterDir = path.join(pdfsFsBase, dirName);
    const absZipPath = path.join(pdfsFsBase, `${dirName}.zip`);

    const remoteDir = this.buildRemoteDir(
      categoryName,
      safeTitle,
      resource.ageRating,
    );
    const files: { localAbsPath: string; remotePath: string }[] = [];

    if (fs.existsSync(absChapterDir)) {
      const chapterFiles = fs
        .readdirSync(absChapterDir)
        .filter((f) => f.endsWith('.pdf'))
        .sort();
      for (const f of chapterFiles) {
        const m = f.match(/^\d+_(.*)\.pdf$/);
        const chapterTitle = m ? m[1] : f.replace(/\.pdf$/, '');
        files.push({
          localAbsPath: path.join(absChapterDir, f),
          remotePath: path.posix.join(
            remoteDir,
            `${safeTitle}-${chapterTitle}.pdf`,
          ),
        });
      }
    }

    if (fs.existsSync(absZipPath)) {
      const sourceSuffix = sourceSiteId ? `_源${sourceSiteId}` : '';
      files.push({
        localAbsPath: absZipPath,
        remotePath: path.posix.join(
          remoteDir,
          `${safeTitle}${sourceSuffix}_分章PDF.zip`,
        ),
      });
    }

    return files;
  }

  private buildRemoteDir(
    categoryName: string,
    safeTitle: string,
    ageRating?: AgeRating,
  ): string {
    const segments = [this.settingsService.baiduNetdiskPath];
    if (ageRating === AgeRating.ADULT) {
      segments.push('其他分类');
    }
    segments.push(categoryName, safeTitle);
    return path.posix.join(...segments).replace(/\\/g, '/');
  }

  private makeSafeTitle(resource: Resource): string {
    return (
      resource.title.replace(/[/\\:*?"<>|]/g, '_').trim() ||
      `resource_${resource.id}`
    );
  }

  private async resolveCategory(resourceId: number): Promise<string> {
    const rc = await this.resourceCategoryRepo
      .createQueryBuilder('rc')
      .where('rc.resource_id = :resourceId', { resourceId })
      .orderBy('rc.category_id', 'ASC')
      .getOne();
    if (!rc) return '未分类';
    const cat = await this.categoryRepo.findOne({
      where: { id: rc.categoryId },
    });
    return cat?.name || '未分类';
  }
}
