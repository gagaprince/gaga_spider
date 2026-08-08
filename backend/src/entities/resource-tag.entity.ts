import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Resource } from './resource.entity';
import { Tag } from './tag.entity';

@Entity('resource_tags')
export class ResourceTag {
  @PrimaryColumn({ name: 'resource_id' })
  resourceId: number;

  @PrimaryColumn({ name: 'tag_id' })
  tagId: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
