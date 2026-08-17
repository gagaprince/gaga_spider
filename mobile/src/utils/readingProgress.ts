const STORAGE_KEY = 'gaga:reading-progress';

export interface ReadingProgress {
  chapterId: number;
  chapterOrderIndex: number;
  title: string;
  updatedAt: number;
}

type ProgressMap = Record<string, ReadingProgress>;

function readAll(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: ProgressMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode errors
  }
}

function key(resourceId: number, sourceSiteId?: number | null): string {
  return sourceSiteId == null ? `${resourceId}` : `${resourceId}:${sourceSiteId}`;
}

export function getReadingProgress(
  resourceId: number,
  sourceSiteId?: number | null,
): ReadingProgress | null {
  return readAll()[key(resourceId, sourceSiteId)] ?? null;
}

export function saveReadingProgress(
  resourceId: number,
  chapterId: number,
  chapterOrderIndex: number,
  title: string,
  sourceSiteId?: number | null,
): void {
  const map = readAll();
  map[key(resourceId, sourceSiteId)] = {
    chapterId,
    chapterOrderIndex,
    title,
    updatedAt: Date.now(),
  };
  writeAll(map);
}
