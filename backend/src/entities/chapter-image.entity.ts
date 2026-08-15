import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Chapter } from './chapter.entity';

@Entity('chapter_images')
export class ChapterImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'chapter_id' })
  chapterId: number;

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ name: 'source_url', length: 500 })
  sourceUrl: string;

  @Column({ name: 'local_path', length: 500, nullable: true })
  localPath: string;

  @Column({ name: 'file_size', default: 0 })
  fileSize: number;

  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Chapter, (chapter) => chapter.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;
}
