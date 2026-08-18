const STORAGE_KEY = 'gaga:my-bookshelf';
const EVENT = 'gaga:bookshelf-change';

function read(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n) => typeof n === 'number'));
  } catch {
    return new Set();
  }
}

function write(set: Set<number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore quota / private mode errors
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getBookshelfIds(): number[] {
  return Array.from(read());
}

export function isInBookshelf(id: number): boolean {
  return read().has(id);
}

export function addToBookshelf(id: number): void {
  const set = read();
  if (!set.has(id)) {
    set.add(id);
    write(set);
  }
}

export function removeFromBookshelf(id: number): void {
  const set = read();
  if (set.has(id)) {
    set.delete(id);
    write(set);
  }
}

export function toggleBookshelf(id: number): boolean {
  const set = read();
  if (set.has(id)) {
    set.delete(id);
    write(set);
    return false;
  }
  set.add(id);
  write(set);
  return true;
}

export function subscribeBookshelf(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
