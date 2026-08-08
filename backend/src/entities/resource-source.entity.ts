import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { SourceSite } from './source-site.entity';

@Entity('resource_sources')
export class ResourceSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'resource_id' })
  resourceId: number;

  @Column({ name: 'source_site_id' })
  sourceSiteId: number;

  @Column({ name: 'source_url', length: 500 })
  sourceUrl: string;

  @Column({ name: 'source_id', length: 100, nullable: true })
  sourceId: string;

  @Column({ name: 'raw_title', length: 255, nullable: true })
  rawTitle: string;

  @Column({ name: 'raw_data', type: 'json', nullable: true })
  rawData: Record<string, any>;

  @Column({ name: 'last_scraped_at', type: 'datetime', nullable: true })
  lastScrapedAt: Date;

  @Column({ name: 'scrape_status', default: 'idle' })
  scrapeStatus: string;

  @Column({ name: 'last_chapter_order', default: 0 })
  lastChapterOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Resource, (resource) => resource.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => SourceSite, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_site_id' })
  sourceSite: SourceSite;
}
