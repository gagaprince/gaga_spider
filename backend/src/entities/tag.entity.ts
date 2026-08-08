import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ResourceTag } from './resource-tag.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  name: string;

  @OneToMany(() => ResourceTag, (rt) => rt.tag)
  resourceTags: ResourceTag[];
}
