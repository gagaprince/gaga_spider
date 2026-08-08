import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SourceSite } from './source-site.entity';

export enum AuthorType {
  AUTHOR = 'author',
  ARTIST = 'artist',
  TRANSLATOR = 'translator',
}

@Entity('authors')
export class Author {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: AuthorType, default: AuthorType.AUTHOR })
  type: AuthorType;

  @Column({ name: 'source_site_id', nullable: true })
  sourceSiteId: number;

  @ManyToOne(() => SourceSite, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_site_id' })
  sourceSite: SourceSite;
}
