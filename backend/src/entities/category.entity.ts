import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ResourceType } from '../constants/resource-type';
import { ResourceCategory } from './resource-category.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ name: 'resource_type', type: 'enum', enum: ResourceType })
  resourceType: ResourceType;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @ManyToOne(() => Category, (category) => category.children, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @OneToMany(() => ResourceCategory, (rc) => rc.category)
  resourceCategories: ResourceCategory[];
}
