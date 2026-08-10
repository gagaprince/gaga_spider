import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { WebtoonsScraperService } from '../scraper/webtoons/webtoons-scraper.service';
import { DongmanhiScraperService } from '../scraper/dongmanhi/dongmanhi-scraper.service';

@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    @Inject(forwardRef(() => WebtoonsScraperService))
    private readonly webtoonsScraper: WebtoonsScraperService,
    @Inject(forwardRef(() => DongmanhiScraperService))
    private readonly dongmanhiScraper: DongmanhiScraperService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.taskService.findAll({
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.taskService.findOne(id);
  }

  @Post(':id/stop')
  async stop(@Param('id', ParseIntPipe) id: number) {
    await this.taskService.markCancelled(id);
    return { success: true, message: '任务已标记停止' };
  }

  @Post(':id/retry')
  async retry(@Param('id', ParseIntPipe) id: number) {
    const newTask = await this.taskService.retry(id);
    const scraper = await this.resolveScraperByTask(id);

    if (scraper instanceof DongmanhiScraperService) {
      const config = (newTask.config ?? {}) as {
        comicId?: string;
        maxChapters?: number;
      };
      this.dongmanhiScraper
        .scrapeOneWithTask(
          newTask.id,
          config.comicId ?? '',
          config.maxChapters ?? 0,
        )
        .catch(() => {});
    } else {
      const config = (newTask.config ?? {}) as {
        titleNo?: number;
        maxChapters?: number;
      };
      this.webtoonsScraper
        .scrapeOneWithTask(
          newTask.id,
          config.titleNo ?? 0,
          config.maxChapters ?? 0,
        )
        .catch(() => {});
    }

    return { success: true, data: newTask };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.taskService.remove(id);
    return { success: true, message: '任务已删除' };
  }

  private async resolveScraperByTask(taskId: number) {
    const task = await this.taskService.findOne(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    const domain = task.sourceSite?.domain;
    if (domain === 'www.dongmanhi.com') {
      return this.dongmanhiScraper;
    }
    return this.webtoonsScraper;
  }
}
