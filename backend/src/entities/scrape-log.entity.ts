import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ScrapeTask } from './scrape-task.entity';

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

@Entity('scrape_logs')
export class ScrapeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @Column({ type: 'enum', enum: LogLevel, default: LogLevel.INFO })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  context: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => ScrapeTask, (task) => task.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: ScrapeTask;
}
