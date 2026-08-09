import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskType, TaskStatus } from '../constants/resource-type';
import { Resource } from './resource.entity';
import { SourceSite } from './source-site.entity';
import { ScrapeLog } from './scrape-log.entity';

@Entity('scrape_tasks')
export class ScrapeTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: number;

  @Column({ name: 'source_site_id' })
  sourceSiteId: number;

  @Column({ name: 'task_type', type: 'enum', enum: TaskType, default: TaskType.FULL })
  taskType: TaskType;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ default: 0 })
  priority: number;

  @Column({ type: 'json', nullable: true })
  config: Record<string, any>;

  @Column({ name: 'total_items', default: 0 })
  totalItems: number;

  @Column({ name: 'done_items', default: 0 })
  doneItems: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'scheduled_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  scheduledAt: Date;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Resource, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => SourceSite, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_site_id' })
  sourceSite: SourceSite;

  @OneToMany(() => ScrapeLog, (log) => log.task)
  logs: ScrapeLog[];
}
