import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SourceSite,
  Resource,
  ResourceSource,
  Volume,
  Chapter,
  ChapterText,
  ChapterImage,
  Author,
  ResourceAuthor,
  Category,
  ResourceCategory,
  Tag,
  ResourceTag,
  ScrapeTask,
  ScrapeLog,
  FileEntity,
} from '../entities';

const entitiesList = [
  SourceSite,
  Resource,
  ResourceSource,
  Volume,
  Chapter,
  ChapterText,
  ChapterImage,
  Author,
  ResourceAuthor,
  Category,
  ResourceCategory,
  Tag,
  ResourceTag,
  ScrapeTask,
  ScrapeLog,
  FileEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        charset: 'utf8mb4',
        entities: entitiesList,
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
