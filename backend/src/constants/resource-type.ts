export enum ResourceType {
  NOVEL = 'novel',
  COMIC = 'comic',
}

export enum ChapterType {
  TEXT = 'text',
  IMAGE = 'image',
}

export enum TaskType {
  DISCOVER = 'discover',
  FULL = 'full',
  INCREMENTAL = 'incremental',
  REFRESH = 'refresh',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
