import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResourceType } from '../constants/resource-type';
import { ResourceSource } from './resource-source.entity';
import { Volume } from './volume.entity';
import { Chapter } from './chapter.entity';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ResourceType })
  type: ResourceType;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ name: 'cover_url', length: 500, nullable: true })
  coverUrl: string;

  @Column({ name: 'local_cover_path', length: 500, nullable: true })
  localCoverPath: string;

  @Column({ default: 'unknown' })
  status: string;

  @Column({ default: 'zh' })
  language: string;

  @Column({ name: 'release_year', type: 'smallint', nullable: true })
  releaseYear: number;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  rating: number;

  @Column({ name: 'word_count', default: 0 })
  wordCount: number;

  @Column({ name: 'chapter_count', default: 0 })
  chapterCount: number;

  @Column({ name: 'is_complete', default: 0 })
  isComplete: number;

  @Column({ type: 'json', nullable: true })
  extra: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ResourceSource, (source) => source.resource)
  sources: ResourceSource[];

  @OneToMany(() => Volume, (volume) => volume.resource)
  volumes: Volume[];

  @OneToMany(() => Chapter, (chapter) => chapter.resource)
  chapters: Chapter[];
}
