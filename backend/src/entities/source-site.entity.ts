import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SiteResourceType {
  NOVEL = 'novel',
  COMIC = 'comic',
}

@Entity('source_sites')
export class SourceSite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255, unique: true })
  domain: string;

  @Column({ type: 'enum', enum: SiteResourceType, name: 'resource_type' })
  resourceType: SiteResourceType;

  @Column({ type: 'json', nullable: true })
  config: Record<string, any>;

  @Column({ name: 'rate_limit', default: 1000 })
  rateLimit: number;

  @Column({ default: 1 })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
