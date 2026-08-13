import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';


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
  sources: any[];
  chapters: {
    id: number;
    orderIndex: number;
    title: string;
    chapterType: string;
    pageCount: number;
    isDownloaded: number;
    downloadedAt: string | null;
    sourceUrl: string;
  }[];
  authors: any[];
  categories: any[];
}

export function ResourceDetail() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const [chapterPdfs, setChapterPdfs] = useState<
    { orderIndex: number; title: string; pdfPath: string }[] | null
  >(null);
  const [exportingChapters, setExportingChapters] = useState(false);
  const [chapterExportError, setChapterExportError] = useState('');

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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId) return;
    api
      .listChapterPdfs(Number(resourceId))
      .then((r) => setChapterPdfs(r.chapters))
      .catch(() => setChapterPdfs(null));
  }, [resourceId]);

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
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
                color: '#ccc',
              }}
            >
              📖
            </div>
          )}
        </div>

        {/* Meta */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
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
            <span>📊 {data.chapters.length} 章</span>
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

         {/* Source */}
         {data.sources.length > 0 && (
           <div style={{ marginTop: 12, fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 8 }}>
             <span>来源: <a href={data.sources[0].sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6c5ce7', textDecoration: 'none' }}>{data.sources[0].sourceUrl}</a></span>
             {data.sources[0].isCompleted === 1 && (
               <span style={{ background: '#3498db', color: '#fff', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                 源站已完结
               </span>
             )}
             {data.sources[0].isCompleted === 0 && (
               <span style={{ background: '#27ae60', color: '#fff', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                 源站连载中
               </span>
             )}
           </div>
         )}

          {/* PDF Export */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setExporting(true);
                setExportError('');
                try {
                  const result = await api.exportPdf(Number(resourceId));
                  setPdfPath(result.pdfPath);
                  setData({ ...data, pdfPath: result.pdfPath });
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

            {(pdfPath || data.pdfPath) && (
              <a
                href={pdfPath || data.pdfPath}
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

            <button
              onClick={async () => {
                setExportingChapters(true);
                setChapterExportError('');
                try {
                  const r = await api.exportChapterPdfs(Number(resourceId));
                  setChapterPdfs(
                    r.chapters.map((c) => ({
                      orderIndex: c.orderIndex,
                      title: c.title,
                      pdfPath: c.pdfPath,
                    })),
                  );
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

          {chapterPdfs && chapterPdfs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#2d3436' }}>
                  📚 分章 PDF ({chapterPdfs.length} 个)
                </span>
                <a
                  href={api.chapterPdfsZipUrl(Number(resourceId))}
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
              </div>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #eee',
                  borderRadius: 8,
                }}
              >
                {chapterPdfs.map((ch, idx) => (
                  <div
                    key={ch.orderIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      borderBottom:
                        idx < chapterPdfs.length - 1
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
            </div>
          )}
        </div>
      </div>

      {/* Chapter list */}
      <div style={{ padding: '0 24px 32px' }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#2d3436',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '2px solid #6c5ce7',
          }}
        >
          章节列表 ({data.chapters.length})
        </h2>
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #eee',
          }}
        >
         {data.chapters.map((ch, idx) => (
           <div
             key={ch.id}
              onClick={() => navigate(`/resources/${resourceId}/chapters/${ch.id}`)}
             style={{
               display: 'flex',
               alignItems: 'center',
               gap: 12,
               padding: '12px 16px',
               borderBottom: idx < data.chapters.length - 1 ? '1px solid #f0f0f0' : 'none',
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
