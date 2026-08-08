import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Resource } from './resource.entity';
import { Author } from './author.entity';

@Entity('resource_authors')
export class ResourceAuthor {
  @PrimaryColumn({ name: 'resource_id' })
  resourceId: number;

  @PrimaryColumn({ name: 'author_id' })
  authorId: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Author, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: Author;
}
