import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Chapter } from './chapter.entity';

@Entity('chapter_texts')
export class ChapterText {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'chapter_id', unique: true })
  chapterId: number;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ name: 'word_count', default: 0 })
  wordCount: number;

  @OneToOne(() => Chapter, (chapter) => chapter.text, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;
}
