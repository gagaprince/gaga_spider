import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { getReadingProgress } from '../utils/readingProgress';
import { isInBookshelf, subscribeBookshelf, toggleBookshelf } from '../utils/bookshelf';
import { CoverPlaceholder } from './CoverPlaceholder';


interface DetailData {
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
    sourceId: string | null;
    rawTitle: string | null;
    scrapeStatus: string;
    isCompleted: number;
    lastScrapedAt: string | null;
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

export function ResourceDetail() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const activeSourceSiteId = searchParams.get('sourceSiteId')
    ? Number(searchParams.get('sourceSiteId'))
    : null;
  const [pdfPaths, setPdfPaths] = useState<Record<number, string>>({});
  const [exportError, setExportError] = useState('');
  const [chapterPdfsBySource, setChapterPdfsBySource] = useState<
    Record<number, { orderIndex: number; title: string; pdfPath: string }[]>
  >({});
  const [chapterPdfs, setChapterPdfs] = useState<
    { orderIndex: number; title: string; pdfPath: string }[] | null
  >(null);
  const [exportingChapters, setExportingChapters] = useState(false);
  const [chapterExportError, setChapterExportError] = useState('');
  const [netdiskEnabled, setNetdiskEnabled] = useState(false);
  const [pdfUpload, setPdfUpload] = useState<{
    active: boolean;
    percent: number;
    done: boolean;
    error: string;
    remotePath: string;
  }>({ active: false, percent: 0, done: false, error: '', remotePath: '' });
  const [chapterUpload, setChapterUpload] = useState<{
    active: boolean;
    current: number;
    total: number;
    currentPercent: number;
    fileName: string;
    done: boolean;
    error: string;
  }>({
    active: false,
    current: 0,
    total: 0,
    currentPercent: 0,
    fileName: '',
    done: false,
    error: '',
  });
  const [readingProgress, setReadingProgress] = useState<{
    chapterId: number;
    chapterOrderIndex: number;
    title: string;
  } | null>(null);
  const [rescraping, setRescraping] = useState(false);
  const [rescrapeProgress, setRescrapeProgress] = useState('');
  const [rescrapeError, setRescrapeError] = useState('');
  const [inBookshelf, setInBookshelf] = useState(false);
  const [chapterOrder, setChapterOrder] = useState<'desc' | 'asc'>('desc');
  const [chapterPdfsExpanded, setChapterPdfsExpanded] = useState(false);
  useEffect(() => {
    if (!resourceId) return;
    const id = Number(resourceId);
    const sync = () => setInBookshelf(isInBookshelf(id));
    sync();
    return subscribeBookshelf(sync);
  }, [resourceId]);

  const selectSource = (sourceSiteId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('sourceSiteId', String(sourceSiteId));
    setSearchParams(next);
  };

  const reloadDetail = () => {
    if (!resourceId) return;
    fetch(`/api/resources/${resourceId}`)
      .then((r) => {
        if (!r.ok) throw new Error('加载失败');
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => {});
  };

  const handleRescrape = async () => {
    if (!resourceId || !activeSource || rescraping) return;
    setRescraping(true);
    setRescrapeError('');
    setRescrapeProgress('提交任务...');
    try {
      const resp = await api.scrapeResource(
        Number(resourceId),
        0,
        activeSource.sourceSiteId,
      );
      const taskInfo = resp.data.tasks.find(
        (t) => t.sourceSiteId === activeSource.sourceSiteId,
      );
      if (!taskInfo) throw new Error('未创建抓取任务');

      const taskId = taskInfo.taskId;
      const poll = async () => {
        const task = await api.getTask(taskId);
        const done = task.doneItems || 0;
        const total = task.totalItems || 0;
        if (task.status === 'running' || task.status === 'pending') {
          setRescrapeProgress(
            total > 0 ? `抓取中... ${done}/${total}` : '抓取中...',
          );
          setTimeout(poll, 2000);
        } else if (task.status === 'success') {
          setRescrapeProgress('');
          setRescraping(false);
          reloadDetail();
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          setRescrapeError(
            task.status === 'cancelled' ? '任务已停止' : task.errorMessage || '抓取失败',
          );
          setRescrapeProgress('');
          setRescraping(false);
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 2000);
    } catch (e: any) {
      setRescrapeError(e.message || '重新抓取失败');
      setRescrapeProgress('');
      setRescraping(false);
    }
  };

  useEffect(() => {
    if (!resourceId) return;
    setLoading(true);
    fetch(`/api/resources/${resourceId}`)
      .then((r) => {
        if (!r.ok) throw new Error('加载失败');
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));

    api
      .getBaiduNetdiskStatus()
      .then((s) => setNetdiskEnabled(s.enabled && s.cli.installed && s.cli.loggedIn))
      .catch(() => setNetdiskEnabled(false));
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId || !data) {
      setReadingProgress(null);
      return;
    }
    const sourceSiteId = activeSourceSiteId ?? data.sources[0]?.sourceSiteId ?? null;
    setReadingProgress(getReadingProgress(Number(resourceId), sourceSiteId));
  }, [resourceId, data, activeSourceSiteId]);

  // 校验 URL 中的 sourceSiteId, 无效时替换为第一个源(不新增 history)
  useEffect(() => {
    if (!data) return;
    const urlId = searchParams.get('sourceSiteId');
    const requested = urlId ? Number(urlId) : null;
    const valid =
      requested != null &&
      data.sources.some((s) => s.sourceSiteId === requested)
        ? requested
        : data.sources[0]?.sourceSiteId ?? null;
    if (valid !== requested) {
      const next = new URLSearchParams(searchParams);
      if (valid == null) {
        next.delete('sourceSiteId');
      } else {
        next.set('sourceSiteId', String(valid));
      }
      setSearchParams(next, { replace: true });
    }
  }, [data, searchParams, setSearchParams]);

  useEffect(() => {
    if (!resourceId || activeSourceSiteId == null) return;
    api
      .listChapterPdfs(Number(resourceId), activeSourceSiteId)
      .then((r) => {
        setChapterPdfs(r.chapters);
        setChapterPdfsBySource((prev) => ({
          ...prev,
          [activeSourceSiteId]: r.chapters,
        }));
      })
      .catch(() => setChapterPdfs(null))
      ;
  }, [resourceId, activeSourceSiteId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
        加载中...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: '#e74c3c' }}>
        {error || '未找到资源'}
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    ongoing: '连载中',
    completed: '已完结',
    unknown: '未知',
  };
  const statusColors: Record<string, string> = {
    ongoing: '#27ae60',
    completed: '#3498db',
    unknown: '#999',
  };

  const activeSource =
    data.sources.find((s) => s.sourceSiteId === activeSourceSiteId) ||
    data.sources[0];
  const hasMultipleSources = data.sources.length > 1;
  const visibleChapters = hasMultipleSources
    ? data.chapters.filter((c) => c.sourceSiteId === activeSource?.sourceSiteId)
    : data.chapters;
  const sortedChapters = [...visibleChapters].sort((a, b) =>
    chapterOrder === 'desc' ? b.orderIndex - a.orderIndex : a.orderIndex - b.orderIndex,
  );
  const activePdfPath = activeSource
    ? pdfPaths[activeSource.sourceSiteId]
    : null;
  const activeChapterPdfs = activeSource
    ? chapterPdfsBySource[activeSource.sourceSiteId]?.length
      ? chapterPdfsBySource[activeSource.sourceSiteId]
      : chapterPdfs
    : chapterPdfs;

  return (
    <div>
      {/* Back button */}
      <div style={{ padding: '16px 24px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            border: 'none',
            background: 'none',
            color: '#6c5ce7',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← 返回书架
        </button>
      </div>

      {/* Header section */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          padding: '0 24px 24px',
        }}
      >
        {/* Cover */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            alignSelf: 'flex-start',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            aspectRatio: '3/4',
            background: '#f0f0f0',
          }}
        >
          {(data.localCoverPath || data.coverUrl) ? (
            <img
              src={data.localCoverPath || data.coverUrl!}
              alt={data.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <CoverPlaceholder fontSize={14} iconSize={44} />
          )}
        </div>

        {/* Meta */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                color: '#2d3436',
              }}
            >
              {data.title}
            </h1>
            <span
              style={{
                background: statusColors[data.status] || '#999',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {statusLabels[data.status] || data.status}
            </span>
            {activeSource && (
              <button
                onClick={handleRescrape}
                disabled={rescraping}
                title={rescrapeProgress || '重新抓取最新章节'}
                style={{
                  border: 'none',
                  background: rescraping ? '#a29bfe' : '#e17055',
                  color: '#fff',
                  padding: '5px 14px',
                  borderRadius: 14,
                  cursor: rescraping ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {rescraping ? (rescrapeProgress || '更新中...') : '🔄 更新'}
              </button>
            )}
            <button
              onClick={() => resourceId && setInBookshelf(toggleBookshelf(Number(resourceId)))}
              title={inBookshelf ? "从我的书架移除" : "加入我的书架"}
              style={{
                border: "none",
                background: inBookshelf ? "#fff" : "#6c5ce7",
                color: inBookshelf ? "#6c5ce7" : "#fff",
                padding: "5px 14px",
                borderRadius: 14,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                boxShadow: inBookshelf ? "inset 0 0 0 1px #6c5ce7" : "none",
              }}
            >
              {inBookshelf ? "⭐ 已在书架" : "☆ 加入书架"}
            </button>
            {rescrapeError && (
              <span style={{ color: '#e74c3c', fontSize: 12 }}>{rescrapeError}</span>
            )}
          </div>

          {/* Authors */}
          {data.authors.length > 0 && (
            <div style={{ marginBottom: 8, color: '#555', fontSize: 14 }}>
              <span style={{ color: '#999' }}>作者: </span>
              {data.authors.map((a) => a.name).join(', ')}
            </div>
          )}

          {/* Categories */}
          {data.categories.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.categories.map((c) => (
                <span
                  key={c.id}
                  style={{
                    background: '#eef2ff',
                    color: '#6c5ce7',
                    padding: '2px 10px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginBottom: 12,
              color: '#666',
              fontSize: 13,
            }}
          >
            <span>📊 {visibleChapters.length} 章</span>
            {data.extra?.viewCount && <span>👁️ {data.extra.viewCount}</span>}
            {data.extra?.subscribeCount && <span>⭐ {data.extra.subscribeCount}</span>}
            {data.extra?.updateDay && <span>📅 每周{data.extra.updateDay}</span>}
            <span>🌐 {data.language}</span>
          </div>

          {/* Summary */}
          {data.summary && (
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#555',
                fontSize: 14,
                lineHeight: 1.6,
                border: '1px solid #eee',
              }}
            >
              {data.summary}
            </div>
          )}

         {/* Source switcher */}
         {data.sources.length > 0 && activeSource && (
           <div style={{ marginTop: 12 }}>
             {hasMultipleSources && (
               <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                 <span style={{ fontSize: 12, color: '#999', alignSelf: 'center' }}>切换源:</span>
                 {data.sources.map((s) => {
                   const active = s.sourceSiteId === activeSource.sourceSiteId;
                   return (
                     <button
                       key={s.id}
                      onClick={() => selectSource(s.sourceSiteId)}
                       style={{
                         border: active ? '1px solid #6c5ce7' : '1px solid #ddd',
                         background: active ? '#6c5ce7' : '#fff',
                         color: active ? '#fff' : '#555',
                         padding: '4px 12px',
                         borderRadius: 14,
                         fontSize: 12,
                         fontWeight: 600,
                         cursor: 'pointer',
                       }}
                     >
                       {s.sourceSite?.name || s.sourceSite?.domain || '未知源'}
                     </button>
                   );
                 })}
               </div>
             )}
             <div style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
               <span>来源: <a href={activeSource.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6c5ce7', textDecoration: 'none' }}>{activeSource.sourceUrl}</a></span>
               {activeSource.isCompleted === 1 && (
                 <span style={{ background: '#3498db', color: '#fff', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                   源站已完结
                 </span>
               )}
               {activeSource.isCompleted === 0 && (
                 <span style={{ background: '#27ae60', color: '#fff', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                   源站连载中
                 </span>
               )}
             </div>
           </div>
         )}

          {/* Read / Continue reading */}
          {visibleChapters.length > 0 && (() => {
            const progressChapter =
              readingProgress &&
              visibleChapters.some((c) => c.id === readingProgress.chapterId)
                ? readingProgress
                : null;
            const targetChapter = progressChapter
              ? {
                  id: progressChapter.chapterId,
                  orderIndex: progressChapter.chapterOrderIndex,
                  title: progressChapter.title || '',
                }
              : visibleChapters[0];
            return (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() =>
                    navigate(`/resources/${resourceId}/chapters/${targetChapter.id}`)
                  }
                  style={{
                    border: 'none',
                    background: '#27ae60',
                    color: '#fff',
                    padding: '10px 24px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {progressChapter ? '📖 继续阅读' : '📖 开始阅读'}
                </button>
                {progressChapter && (
                  <span style={{ color: '#888', fontSize: 13 }}>
                    上次读到: #{progressChapter.chapterOrderIndex} {progressChapter.title || ''}
                  </span>
                )}
              </div>
            );
          })()}

          {/* PDF Export */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setExporting(true);
                setExportError('');
                try {
                  const sid = activeSource?.sourceSiteId;
                  const result = await api.exportPdf(Number(resourceId), sid);
                  if (sid != null) {
                    setPdfPaths((prev) => ({
                      ...prev,
                      [sid]: result.pdfPath,
                    }));
                  } else {
                    setData({ ...data, pdfPath: result.pdfPath });
                  }
                } catch (e: any) {
                  setExportError(e.message || '导出失败');
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
              style={{
                border: 'none',
                background: exporting ? '#a29bfe' : '#6c5ce7',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 8,
                cursor: exporting ? 'wait' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {exporting ? '正在导出...' : '📄 导出 PDF'}
            </button>

            {(activePdfPath || (!hasMultipleSources && data.pdfPath)) && (
              <a
                href={activePdfPath || data.pdfPath}
                download
                style={{
                  color: '#6c5ce7',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                下载 PDF ↓
              </a>
            )}

            {netdiskEnabled && (activePdfPath || (!hasMultipleSources && data.pdfPath)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    const sid = activeSource?.sourceSiteId;
                    const url = api.uploadPdfStreamUrl(Number(resourceId), sid);
                    setPdfUpload({ active: true, percent: 0, done: false, error: '', remotePath: '' });
                    const es = new EventSource(url);
                    es.onmessage = (e) => {
                      try {
                        const d = JSON.parse(e.data);
                        if (d.type === 'file-progress') {
                          setPdfUpload((prev) => ({ ...prev, percent: d.percent }));
                        } else if (d.type === 'complete') {
                          setPdfUpload({ active: false, percent: 100, done: true, error: '', remotePath: d.remotePath });
                          es.close();
                        } else if (d.type === 'error') {
                          setPdfUpload((prev) => ({ ...prev, active: false, error: d.message }));
                          es.close();
                        }
                      } catch { /* ignore */ }
                    };
                    es.onerror = () => {
                      setPdfUpload((prev) => ({ ...prev, active: false, error: '连接中断' }));
                      es.close();
                    };
                  }}
                  disabled={pdfUpload.active}
                  style={{
                    border: 'none',
                    background: pdfUpload.active ? '#81ecec' : '#00b894',
                    color: '#fff',
                    padding: '6px 16px',
                    borderRadius: 8,
                    cursor: pdfUpload.active ? 'wait' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {pdfUpload.active ? `上传中 ${pdfUpload.percent}%` : '☁️ 上传到网盘'}
                </button>
                {pdfUpload.active && (
                  <div style={{ width: 120, height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pdfUpload.percent}%`, height: '100%', background: '#00b894', transition: 'width 0.3s' }} />
                  </div>
                )}
                {pdfUpload.done && (
                  <span style={{ color: '#00b894', fontSize: 12 }}>✓ 已上传</span>
                )}
                {pdfUpload.error && (
                  <span style={{ color: '#e74c3c', fontSize: 12 }}>{pdfUpload.error}</span>
                )}
              </div>
            )}

            <button
              onClick={async () => {
                setExportingChapters(true);
                setChapterExportError('');
                try {
                  const sid = activeSource?.sourceSiteId;
                  const r = await api.exportChapterPdfs(
                    Number(resourceId),
                    sid,
                  );
                  const mapped = r.chapters.map((c) => ({
                    orderIndex: c.orderIndex,
                    title: c.title,
                    pdfPath: c.pdfPath,
                  }));
                  setChapterPdfs(mapped);
                  if (sid != null) {
                    setChapterPdfsBySource((prev) => ({
                      ...prev,
                      [sid]: mapped,
                    }));
                  }
                } catch (e: any) {
                  setChapterExportError(e.message || '导出失败');
                } finally {
                  setExportingChapters(false);
                }
              }}
              disabled={exportingChapters}
              style={{
                border: 'none',
                background: exportingChapters ? '#a29bfe' : '#0984e3',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 8,
                cursor: exportingChapters ? 'wait' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {exportingChapters ? '正在生成分章...' : '📑 按章节导出 PDF'}
            </button>

            {exportError && (
              <span style={{ color: '#e74c3c', fontSize: 13 }}>{exportError}</span>
            )}

            {chapterExportError && (
              <span style={{ color: '#e74c3c', fontSize: 13 }}>
                {chapterExportError}
              </span>
            )}

          </div>

          {activeChapterPdfs && activeChapterPdfs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 8,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={() => setChapterPdfsExpanded((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#2d3436',
                  }}
                >
                  <span>{chapterPdfsExpanded ? '▼' : '▶'}</span>
                  📚 分章 PDF ({activeChapterPdfs.length} 个)
                </button>
                <a
                  href={api.chapterPdfsZipUrl(
                    Number(resourceId),
                    activeSource?.sourceSiteId,
                  )}
                  download
                  style={{
                    color: '#0984e3',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  📦 打包下载 ZIP ↓
                </a>
                {netdiskEnabled && (
                  <button
                    onClick={() => {
                      const sid = activeSource?.sourceSiteId;
                      const url = api.uploadChapterPdfsStreamUrl(Number(resourceId), sid);
                      setChapterUpload({
                        active: true, current: 0, total: 0,
                        currentPercent: 0, fileName: '', done: false, error: '',
                      });
                      const es = new EventSource(url);
                      es.onmessage = (e) => {
                        try {
                          const d = JSON.parse(e.data);
                          if (d.type === 'start') {
                            setChapterUpload((prev) => ({ ...prev, total: d.total || 0, fileName: d.message || '' }));
                          } else if (d.type === 'batch-progress') {
                            setChapterUpload((prev) => ({
                              ...prev,
                              current: d.current ?? prev.current,
                              total: d.total ?? prev.total,
                              fileName: d.message || prev.fileName,
                              currentPercent: 0,
                            }));
                          } else if (d.type === 'file-progress') {
                            setChapterUpload((prev) => ({ ...prev, currentPercent: d.percent }));
                          } else if (d.type === 'complete') {
                            setChapterUpload((prev) => ({
                              ...prev,
                              active: false,
                              done: true,
                              current: prev.total,
                              currentPercent: 100,
                              fileName: d.failed > 0
                                ? `完成: ${d.uploaded} 成功, ${d.failed} 失败`
                                : `全部 ${d.uploaded} 个文件上传成功`,
                            }));
                            es.close();
                          } else if (d.type === 'error') {
                            setChapterUpload((prev) => ({ ...prev, active: false, error: d.message }));
                            es.close();
                          }
                        } catch { /* ignore */ }
                      };
                      es.onerror = () => {
                        setChapterUpload((prev) => ({ ...prev, active: false, error: '连接中断' }));
                        es.close();
                      };
                    }}
                    disabled={chapterUpload.active}
                    style={{
                      border: 'none',
                      background: chapterUpload.active ? '#81ecec' : '#00b894',
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: 6,
                      cursor: chapterUpload.active ? 'wait' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {chapterUpload.active
                      ? `上传中 ${chapterUpload.current}/${chapterUpload.total} (${chapterUpload.currentPercent}%)`
                      : '☁️ 全部上传到网盘'}
                  </button>
                )}
              </div>
              {chapterPdfsExpanded && (
              <div
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #eee',
                  borderRadius: 8,
                }}
              >
                {activeChapterPdfs.map((ch, idx) => (
                  <div
                    key={ch.orderIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      borderBottom:
                        idx < activeChapterPdfs.length - 1
                          ? '1px solid #f0f0f0'
                          : 'none',
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        color: '#aaa',
                        width: 40,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      #{ch.orderIndex}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: '#333',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ch.title}
                    </span>
                    <a
                      href={ch.pdfPath}
                      download
                      style={{
                        color: '#6c5ce7',
                        fontWeight: 600,
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      下载 ↓
                    </a>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapter list */}
      <div style={{ padding: '0 24px 32px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '2px solid #6c5ce7',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3436', margin: 0 }}>
            章节列表 ({visibleChapters.length})
          </h2>
          <button
            onClick={() => setChapterOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            title="切换章节排序"
            style={{
              border: '1px solid #6c5ce7',
              background: '#fff',
              color: '#6c5ce7',
              padding: '4px 12px',
              borderRadius: 14,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {chapterOrder === 'desc' ? '⬇ 倒序' : '⬆ 正序'}
          </button>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #eee',
          }}
        >
         {sortedChapters.map((ch, idx) => (
           <div
             key={ch.id}
              onClick={() => navigate(`/resources/${resourceId}/chapters/${ch.id}`)}
             style={{
               display: 'flex',
               alignItems: 'center',
               gap: 12,
               padding: '12px 16px',
               borderBottom: idx < sortedChapters.length - 1 ? '1px solid #f0f0f0' : 'none',
               fontSize: 14,
               cursor: 'pointer',
               transition: 'background 0.15s',
             }}
            >
              <span
                style={{
                  color: '#aaa',
                  fontSize: 12,
                  width: 40,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                #{ch.orderIndex}
              </span>
              <span style={{ flex: 1, color: '#333' }}>{ch.title}</span>
              <span style={{ color: '#999', fontSize: 12 }}>{ch.pageCount} 图</span>
              {ch.isDownloaded ? (
                <span
                  style={{
                    color: '#27ae60',
                    fontSize: 12,
                    background: '#f0faf3',
                    padding: '2px 8px',
                    borderRadius: 8,
                  }}
                >
                  ✓ 已抓取
                </span>
              ) : (
                <span
                  style={{
                    color: '#e67e22',
                    fontSize: 12,
                    background: '#fef9f3',
                    padding: '2px 8px',
                    borderRadius: 8,
                  }}
                >
                  未抓取
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
