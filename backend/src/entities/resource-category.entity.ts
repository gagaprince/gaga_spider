import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Resource } from './resource.entity';
import { Category } from './category.entity';

@Entity('resource_categories')
export class ResourceCategory {
  @PrimaryColumn({ name: 'resource_id' })
  resourceId: number;

  @PrimaryColumn({ name: 'category_id' })
  categoryId: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
