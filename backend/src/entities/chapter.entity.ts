import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResourceType, ChapterType } from '../constants/resource-type';
import { Resource } from './resource.entity';
import { Volume } from './volume.entity';
import { SourceSite } from './source-site.entity';
import { ChapterText } from './chapter-text.entity';
import { ChapterImage } from './chapter-image.entity';

@Entity('chapters')
export class Chapter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'resource_id' })
  resourceId: number;

  @Column({ name: 'volume_id', nullable: true })
  volumeId: number;

  @Column({ name: 'order_index' })
  orderIndex: number;

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'chapter_type', type: 'enum', enum: ChapterType, default: ChapterType.TEXT })
  chapterType: ChapterType;

  @Column({ name: 'source_url', length: 500, nullable: true })
  sourceUrl: string;

  @Column({ name: 'source_site_id', nullable: true })
  sourceSiteId: number;

  @Column({ name: 'word_count', default: 0 })
  wordCount: number;

  @Column({ name: 'page_count', default: 0 })
  pageCount: number;

  @Column({ name: 'is_downloaded', default: 0 })
  isDownloaded: number;

  @Column({ name: 'downloaded_at', type: 'datetime', nullable: true })
  downloadedAt: Date;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date;

  @Column({ type: 'json', nullable: true })
  extra: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Resource, (resource) => resource.chapters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Volume, (volume) => volume.chapters, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'volume_id' })
  volume: Volume;

  @ManyToOne(() => SourceSite, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_site_id' })
  sourceSite: SourceSite;

  @OneToOne(() => ChapterText, (text) => text.chapter)
  text: ChapterText;

  @OneToMany(() => ChapterImage, (image) => image.chapter)
  images: ChapterImage[];
}
