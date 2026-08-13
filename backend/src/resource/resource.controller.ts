import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ResourceService } from './resource.service';
import type { Response } from 'express';
import * as fs from 'fs';

@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('scrapeStatus') scrapeStatus?: string,
    @Query('category') category?: string,
    @Query('completion') completion?: string,
    @Query('sourceSite') sourceSite?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resourceService.findAll({
      type,
      keyword,
      scrapeStatus,
      category,
      completion,
      sourceSite,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('categories/list')
  async listCategories() {
    return this.resourceService.listCategories();
  }

  @Get('chapters/:chapterId/images')
  getChapterImages(@Param('chapterId', ParseIntPipe) chapterId: number) {
    return this.resourceService.getChapterWithImages(chapterId);
  }

  @Get(':id/chapter-pdfs')
  listChapterPdfs(@Param('id', ParseIntPipe) id: number) {
    return this.resourceService.listChapterPdfs(id);
  }

  @Get(':id/chapter-pdfs/zip')
  async downloadChapterPdfsZip(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const { absPath, downloadName } =
        await this.resourceService.ensureChapterPdfsZip(id);
      const ascii = downloadName.replace(/[^\x20-\x7e]/g, '_');
      const encoded = encodeURIComponent(downloadName);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      );
      res.setHeader('Content-Type', 'application/zip');
      fs.createReadStream(absPath).pipe(res);
    } catch (e) {
      res
        .status(404)
        .json({ message: e instanceof Error ? e.message : '打包失败' });
    }
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.resourceService.findOne(id);
  }

  @Post(':id/export-pdf')
  exportPdf(@Param('id', ParseIntPipe) id: number) {
    return this.resourceService.exportPdf(id);
  }

  @Post(':id/export-chapter-pdfs')
  exportChapterPdfs(@Param('id', ParseIntPipe) id: number) {
    return this.resourceService.exportChapterPdfs(id);
  }
}
