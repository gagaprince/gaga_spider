import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { Chapter } from './chapter.entity';

export enum FileType {
  COVER = 'cover',
  IMAGE = 'image',
  TEXT = 'text',
  THUMBNAIL = 'thumbnail',
}

@Entity('files')
export class FileEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: number;

  @Column({ name: 'chapter_id', nullable: true })
  chapterId: number;

  @Column({ name: 'file_type', type: 'enum', enum: FileType })
  fileType: FileType;

  @Column({ name: 'file_path', length: 500 })
  filePath: string;

  @Column({ name: 'file_size', default: 0 })
  fileSize: number;

  @Column({ name: 'file_hash', length: 64, unique: true })
  fileHash: string;

  @Column({ name: 'source_url', length: 500, nullable: true })
  sourceUrl: string;

  @CreateDateColumn({ name: 'downloaded_at' })
  downloadedAt: Date;

  @ManyToOne(() => Resource, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Chapter, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;
}
