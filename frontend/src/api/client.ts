const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`请求失败 (${resp.status}): ${text}`);
  }
  return resp.json();
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
  categories?: string[];
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

export interface ScrapeResult {
  success: boolean;
  data: {
    resource: { id: number; title: string };
    chapters: { id: number; title: string; imageCount: number }[];
  };
}

export interface TaskItem {
  id: number;
  status: string;
  taskType: string;
  priority: number;
  totalItems: number;
  doneItems: number;
  errorMessage: string | null;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  resource: { id: number; title: string } | null;
  sourceSite: { id: number; name: string } | null;
}

export interface TaskListResponse {
  items: TaskItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const api = {
  getResources: (params?: {
    type?: string;
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
    if (params?.type) search.set('type', params.type);
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

 getResource: (id: number) => request<any>(`/resources/${id}`),

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
    `${BASE_URL}/resources/${id}/chapter-pdfs/zip${
      sourceSiteId ? `?sourceSiteId=${sourceSiteId}` : ''
    }`,

  getChapterImages: (chapterId: number) =>
    request<{
      id: number;
      resourceId: number;
      orderIndex: number;
      title: string;
      pageCount: number;
      isDownloaded: number;
      images: {
        id: number;
        orderIndex: number;
        sourceUrl: string;
        localPath: string | null;
        status: string;
      }[];
      prevChapter: { id: number; orderIndex: number; title: string } | null;
      nextChapter: { id: number; orderIndex: number; title: string } | null;
    }>(`/resources/chapters/${chapterId}/images`),

  getCategories: (ageRating?: string) =>
    request<{ name: string; count: number }[]>(
      `/resources/categories/list${ageRating ? `?ageRating=${ageRating}` : ''}`,
    ),

  getSourceSites: (ageRating?: string) =>
    request<{ id: number; name: string; domain: string }[]>(
      `/resources/source-sites/list${ageRating ? `?ageRating=${ageRating}` : ''}`,
    ),

  scrapeWebtoons: (titleNo: number, maxChapters?: number) =>
    request<ScrapeResult>('/scraper/webtoons/scrape', {
      method: 'POST',
      body: JSON.stringify({ titleNo, maxChapters }),
    }),

  scrapeResource: (resourceId: number, maxChapters?: number) =>
    request<{
      success: boolean;
      data: {
        sourceCount: number;
        tasks: { sourceSiteId: number; domain: string; taskId: number }[];
      };
    }>(
      '/scraper/scrape-resource',
      {
        method: 'POST',
        body: JSON.stringify({ resourceId, maxChapters }),
      },
    ),

  discoverWebtoons: () =>
    request<{ success: boolean; data: { discovered: number; new: number } }>(
      '/scraper/webtoons/discover',
      { method: 'POST' },
    ),

  discoverDongmanhi: () =>
    request<{ success: boolean; data: { discovered: number; new: number } }>(
      '/scraper/dongmanhi/discover',
      { method: 'POST' },
    ),

  discoverManhuazhan: () =>
    request<{ success: boolean; data: { discovered: number; new: number } }>(
      '/scraper/manhuazhan/discover',
      { method: 'POST' },
    ),

  discoverNniaooman: () =>
    request<{ success: boolean; data: { discovered: number; new: number } }>(
      '/scraper/nniaooman/discover',
      { method: 'POST' },
    ),

  discoverManhwa18: () =>
    request<{ success: boolean; data: { discovered: number; new: number } }>(
      '/scraper/manhwa18/discover',
      { method: 'POST' },
    ),

  getTasks: (params?: { status?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const qs = search.toString();
    return request<TaskListResponse>(`/tasks${qs ? `?${qs}` : ''}`);
  },

  stopTask: (id: number) =>
    request<{ success: boolean }>(`/tasks/${id}/stop`, { method: 'POST' }),

  retryTask: (id: number) =>
    request<{ success: boolean; data: TaskItem }>(`/tasks/${id}/retry`, {
      method: 'POST',
    }),

  deleteTask: (id: number) =>
    request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  getSettings: () => request<{ resourcePath: string }>('/settings'),

  updateSettings: (resourcePath: string) =>
    request<{ resourcePath: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ resourcePath }),
    }),
};
