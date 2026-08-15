// 移动端 API 客户端: 只包含搜索/查询/阅读/导出 PDF, 不含抓取控制。
// 默认走 Vite 代理(/api -> backend:3000); 也可用 VITE_API_BASE / VITE_RESOURCE_BASE 指向远端后端。

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const RES_BASE = import.meta.env.VITE_RESOURCE_BASE || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`请求失败 (${resp.status}): ${text}`);
  }
  return resp.json();
}

// 将后端返回的 /resourceFiles/... 相对路径补成可访问的完整 URL(支持远端后端)。
export function assetUrl(p: string | null | undefined): string | undefined {
  if (!p) return undefined;
  if (p.startsWith('/resourceFiles/')) return `${RES_BASE}${p}`;
  return p;
}

export interface Resource {
  id: number;
  type: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  localCoverPath: string | null;
  status: string;
  language: string;
  rating: number | null;
  chapterCount: number;
  isComplete: number;
  category: string | null;
  ageRating: string;
  extra: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceListResponse {
  items: Resource[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChapterImageItem {
  id: number;
  orderIndex: number;
  sourceUrl: string;
  localPath: string | null;
  status: string;
}

export interface ChapterData {
  id: number;
  resourceId: number;
  orderIndex: number;
  title: string;
  pageCount: number;
  isDownloaded: number;
  images: ChapterImageItem[];
  prevChapter: { id: number; orderIndex: number; title: string } | null;
  nextChapter: { id: number; orderIndex: number; title: string } | null;
}

export interface DetailData {
  id: number;
  type: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  localCoverPath: string | null;
  status: string;
  language: string;
  rating: number | null;
  chapterCount: number;
  isComplete: number;
  pdfPath: string | null;
  extra: Record<string, any> | null;
  sources: {
    id: number;
    sourceSiteId: number;
    sourceUrl: string;
    isCompleted: number;
    sourceSite: { id: number; name: string; domain: string } | null;
  }[];
  chapters: {
    id: number;
    orderIndex: number;
    title: string;
    chapterType: string;
    pageCount: number;
    isDownloaded: number;
    downloadedAt: string | null;
    sourceUrl: string;
    sourceSiteId: number | null;
  }[];
  authors: any[];
  categories: any[];
}

export const api = {
  getResources: (params?: {
    keyword?: string;
    scrapeStatus?: string;
    category?: string;
    completion?: string;
    sourceSite?: string;
    ageRating?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.keyword) search.set('keyword', params.keyword);
    if (params?.scrapeStatus) search.set('scrapeStatus', params.scrapeStatus);
    if (params?.category) search.set('category', params.category);
    if (params?.completion) search.set('completion', params.completion);
    if (params?.sourceSite) search.set('sourceSite', params.sourceSite);
    if (params?.ageRating) search.set('ageRating', params.ageRating);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const qs = search.toString();
    return request<ResourceListResponse>(`/resources${qs ? `?${qs}` : ''}`);
  },

  getResource: (id: number) => request<DetailData>(`/resources/${id}`),

  getChapterImages: (chapterId: number) =>
    request<ChapterData>(`/resources/chapters/${chapterId}/images`),

  getCategories: (ageRating?: string) =>
    request<{ name: string; count: number }[]>(
      `/resources/categories/list${ageRating ? `?ageRating=${ageRating}` : ''}`,
    ),

  exportPdf: (id: number, sourceSiteId?: number) =>
    request<{ pdfPath: string }>(`/resources/${id}/export-pdf`, {
      method: 'POST',
      body: JSON.stringify(sourceSiteId ? { sourceSiteId } : {}),
    }),

  exportChapterPdfs: (id: number, sourceSiteId?: number) =>
    request<{
      chapters: {
        chapterId: number;
        orderIndex: number;
        title: string;
        pdfPath: string;
        imageCount: number;
      }[];
    }>(`/resources/${id}/export-chapter-pdfs`, {
      method: 'POST',
      body: JSON.stringify(sourceSiteId ? { sourceSiteId } : {}),
    }),

  listChapterPdfs: (id: number, sourceSiteId?: number) =>
    request<{
      chapters: { orderIndex: number; title: string; pdfPath: string }[];
    }>(
      `/resources/${id}/chapter-pdfs${
        sourceSiteId ? `?sourceSiteId=${sourceSiteId}` : ''
      }`,
    ),

  chapterPdfsZipUrl: (id: number, sourceSiteId?: number) =>
    `${API_BASE}/resources/${id}/chapter-pdfs/zip${
      sourceSiteId ? `?sourceSiteId=${sourceSiteId}` : ''
    }`,
};
