import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { Chapter } from './chapter.entity';

@Entity('volumes')
export class Volume {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'resource_id' })
  resourceId: number;

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ length: 255, nullable: true })
  title: string;

  @ManyToOne(() => Resource, (resource) => resource.volumes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @OneToMany(() => Chapter, (chapter) => chapter.volume)
  chapters: Chapter[];
}
