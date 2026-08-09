import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScrapeTask } from '../entities/scrape-task.entity';
import { ScrapeLog } from '../entities/scrape-log.entity';
import { TaskStatus, TaskType } from '../constants/resource-type';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  private readonly runningAbortControllers = new Map<number, boolean>();

  constructor(
    @InjectRepository(ScrapeTask)
    private readonly taskRepo: Repository<ScrapeTask>,
    @InjectRepository(ScrapeLog)
    private readonly logRepo: Repository<ScrapeLog>,
  ) {}

  async findAll(query: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, page = 1, pageSize = 20 } = query;

    const findOptions: any = {
      relations: ['resource', 'sourceSite'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
    if (status) {
      findOptions.where = { status };
    }

    const [items, total] = await this.taskRepo.findAndCount(findOptions);
    return { items, total, page, pageSize };
  }

  async findOne(id: number) {
    return this.taskRepo.findOne({
      where: { id },
      relations: ['resource', 'sourceSite'],
    });
  }

  async create(data: {
    resourceId?: number;
    sourceSiteId: number;
    taskType?: TaskType;
    priority?: number;
    config?: Record<string, any>;
  }): Promise<ScrapeTask> {
    const task = this.taskRepo.create({
      resourceId: data.resourceId,
      sourceSiteId: data.sourceSiteId,
      taskType: data.taskType || TaskType.FULL,
      status: TaskStatus.PENDING,
      priority: data.priority || 0,
      config: data.config,
      scheduledAt: new Date(),
    });
    return this.taskRepo.save(task);
  }

  async markRunning(id: number): Promise<void> {
    await this.taskRepo.update(id, {
      status: TaskStatus.RUNNING,
      startedAt: new Date(),
    });
    this.runningAbortControllers.set(id, false);
  }

  async markSuccess(id: number, totalItems: number, doneItems: number): Promise<void> {
    await this.taskRepo.update(id, {
      status: TaskStatus.SUCCESS,
      totalItems,
      doneItems,
      finishedAt: new Date(),
    });
    this.runningAbortControllers.delete(id);
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await this.taskRepo.update(id, {
      status: TaskStatus.FAILED,
      errorMessage,
      finishedAt: new Date(),
    });
    this.runningAbortControllers.delete(id);
  }

  async markCancelled(id: number): Promise<void> {
    await this.taskRepo.update(id, {
      status: TaskStatus.CANCELLED,
      finishedAt: new Date(),
    });
    this.runningAbortControllers.set(id, true);
  }

  isCancelled(id: number): boolean {
    return this.runningAbortControllers.get(id) === true;
  }

  async retry(id: number): Promise<ScrapeTask> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new Error('任务不存在');

    const newTask = this.taskRepo.create({
      resourceId: task.resourceId,
      sourceSiteId: task.sourceSiteId,
      taskType: task.taskType,
      status: TaskStatus.PENDING,
      priority: task.priority,
      config: task.config,
      scheduledAt: new Date(),
    });
    return this.taskRepo.save(newTask);
  }

  async remove(id: number): Promise<void> {
    await this.logRepo.delete({ taskId: id });
    await this.taskRepo.delete(id);
  }

  async log(taskId: number, level: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.logRepo.save({
      taskId,
      level: level as any,
      message,
      context,
    });
  }
}
