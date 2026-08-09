import {
  Controller, Delete, Get, Param, ParseIntPipe, Post, Query,
  Inject, forwardRef,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { WebtoonsScraperService } from '../scraper/webtoons/webtoons-scraper.service';

@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    @Inject(forwardRef(() => WebtoonsScraperService))
    private readonly scraperService: WebtoonsScraperService,
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
    this.scraperService
      .scrapeOneWithTask(newTask.id, newTask.config?.titleNo, newTask.config?.maxChapters)
      .catch(() => {});
    return { success: true, data: newTask };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.taskService.remove(id);
    return { success: true, message: '任务已删除' };
  }
}
