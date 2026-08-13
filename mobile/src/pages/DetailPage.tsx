import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, assetUrl, type DetailData } from '../api/client';

interface ChapterPdfItem {
  orderIndex: number;
  title: string;
  pdfPath: string;
}

export function DetailPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');

  const [chapterPdfs, setChapterPdfs] = useState<ChapterPdfItem[] | null>(null);
  const [exportingChapters, setExportingChapters] = useState(false);
  const [chapterMsg, setChapterMsg] = useState('');

  useEffect(() => {
    if (!resourceId) return;
    setLoading(true);
    api
      .getResource(Number(resourceId))
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resourceId]);

  // 进入页面时回显已生成的分章 PDF
  useEffect(() => {
    if (!resourceId) return;
    api
      .listChapterPdfs(Number(resourceId))
      .then((r) => setChapterPdfs(r.chapters))
      .catch(() => setChapterPdfs(null));
  }, [resourceId]);

  if (loading) return <div style={centerHint}>加载中...</div>;
  if (error || !data)
    return (
      <div style={{ ...centerHint, color: '#e74c3c' }}>{error || '未找到资源'}</div>
    );

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
  const cover = assetUrl(data.localCoverPath || data.coverUrl);
  const hasChapters = data.chapters.length > 0;

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setPdfMsg('');
    try {
      const r = await api.exportPdf(Number(resourceId));
      setData({ ...data, pdfPath: r.pdfPath });
      setPdfMsg('整本 PDF 已生成');
    } catch (e: any) {
      setPdfMsg(e.message || '导出失败');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportChapters = async () => {
    setExportingChapters(true);
    setChapterMsg('');
    try {
      const r = await api.exportChapterPdfs(Number(resourceId));
      setChapterPdfs(
        r.chapters.map((c) => ({
          orderIndex: c.orderIndex,
          title: c.title,
          pdfPath: c.pdfPath,
        })),
      );
      setChapterMsg(`已生成 ${r.chapters.length} 个分章 PDF`);
    } catch (e: any) {
      setChapterMsg(e.message || '导出失败');
    } finally {
      setExportingChapters(false);
    }
  };

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* 头部信息 */}
      <div style={{ display: 'flex', gap: 12, padding: 14 }}>
        <div
          style={{
            width: 108,
            flexShrink: 0,
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            aspectRatio: '3/4',
            background: '#f0f0f0',
          }}
        >
          {cover ? (
            <img
              src={cover}
              alt={data.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={coverPlaceholder}>📖</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h1
              style={{
                fontSize: 17,
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {data.title}
            </h1>
            <span style={statusBadge(statusColors[data.status] || '#999')}>
              {statusLabels[data.status] || data.status}
            </span>
          </div>
          {data.authors.length > 0 && (
            <div style={metaLine}>
              <span style={{ color: '#999' }}>作者:</span>{' '}
              {data.authors.map((a) => a.name).join(', ')}
            </div>
          )}
          {data.categories.length > 0 && (
            <div style={{ ...metaLine, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.categories.map((c) => (
                <span key={c.name} style={tagStyle}>
                  {c.name}
                </span>
              ))}
            </div>
          )}
          <div style={{ ...metaLine, color: '#888' }}>
            {data.chapters.length} 章 ·{' '}
            {data.chapters.filter((c) => c.isDownloaded).length} 章已抓取
          </div>
        </div>
      </div>

      {data.summary && (
        <div style={{ padding: '0 14px', marginBottom: 12 }}>
          <p
            style={{
              fontSize: 13,
              color: '#555',
              lineHeight: 1.6,
              background: '#fff',
              padding: 12,
              borderRadius: 8,
            }}
          >
            {data.summary}
          </p>
        </div>
      )}

      {/* PDF 导出区 */}
      <div style={{ padding: '0 14px', marginBottom: 16 }}>
        <div style={sectionTitle}>📄 PDF 下载</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || !hasChapters}
            style={primaryBtn(exportingPdf || !hasChapters)}
          >
            {exportingPdf ? '生成中...' : '📑 整本 PDF'}
          </button>
          <button
            onClick={handleExportChapters}
            disabled={exportingChapters || !hasChapters}
            style={secondaryBtn(exportingChapters || !hasChapters)}
          >
            {exportingChapters ? '生成中...' : '📚 按章节 PDF'}
          </button>
        </div>

        {pdfMsg && <div style={msgStyle(!!data.pdfPath)}>{pdfMsg}</div>}
        {data.pdfPath && (
          <a href={assetUrl(data.pdfPath)} download style={downloadLink}>
            下载整本 PDF ↓
          </a>
        )}

        {chapterMsg && (
          <div style={msgStyle((chapterPdfs?.length ?? 0) > 0)}>{chapterMsg}</div>
        )}

        {chapterPdfs && chapterPdfs.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                分章 PDF ({chapterPdfs.length})
              </span>
              <a
                href={api.chapterPdfsZipUrl(Number(resourceId))}
                download
                style={zipLink}
              >
                📦 打包 ZIP ↓
              </a>
            </div>
            <div style={chapterListWrap}>
              {chapterPdfs.map((ch, idx) => (
                <div key={ch.orderIndex} style={chapterRow(idx < chapterPdfs.length - 1)}>
                  <span style={{ color: '#aaa', width: 36, flexShrink: 0, fontSize: 12 }}>
                    #{ch.orderIndex}
                  </span>
                  <span style={chapterTitle}>{ch.title}</span>
                  <a href={assetUrl(ch.pdfPath)} download style={rowDownloadLink}>
                    ↓
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasChapters && (
          <div style={{ ...msgStyle(false), marginTop: 8 }}>
            该资源暂无已抓取章节, 无法导出
          </div>
        )}
      </div>

      {/* 章节列表 */}
      <div style={{ padding: '0 14px' }}>
        <div style={sectionTitle}>📖 章节列表 ({data.chapters.length})</div>
        <div style={chapterListWrap}>
          {data.chapters.map((ch, idx) => (
            <div
              key={ch.id}
              onClick={() =>
                navigate(`/resources/${resourceId}/chapters/${ch.id}`)
              }
              style={chapterRow(idx < data.chapters.length - 1, true)}
            >
              <span style={{ color: '#aaa', width: 36, flexShrink: 0, fontSize: 12 }}>
                #{ch.orderIndex}
              </span>
              <span style={chapterTitle}>{ch.title}</span>
              {ch.isDownloaded ? (
                <span style={downloadedTag}>✓</span>
              ) : (
                <span style={notDownloadedTag}>未抓取</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const centerHint: React.CSSProperties = {
  textAlign: 'center',
  padding: 80,
  color: '#999',
  fontSize: 15,
};

const coverPlaceholder: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 40,
  color: '#ccc',
};

const metaLine: React.CSSProperties = {
  fontSize: 13,
  color: '#555',
  marginBottom: 6,
};

const tagStyle: React.CSSProperties = {
  background: '#f0edff',
  color: '#6c5ce7',
  padding: '2px 8px',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 600,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#2d3436',
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: '2px solid #6c5ce7',
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    border: 'none',
    background: disabled ? '#b8b0f5' : '#6c5ce7',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid #0984e3',
    background: '#fff',
    color: disabled ? '#b2c8e8' : '#0984e3',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
  };
}

const downloadLink: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  color: '#6c5ce7',
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
};

const zipLink: React.CSSProperties = {
  color: '#0984e3',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
};

function msgStyle(ok: boolean): React.CSSProperties {
  return {
    marginTop: 8,
    fontSize: 13,
    color: ok ? '#27ae60' : '#e74c3c',
  };
}

function statusBadge(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };
}

const chapterListWrap: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid #eee',
};

function chapterRow(border: boolean, clickable = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderBottom: border ? '1px solid #f0f0f0' : 'none',
    fontSize: 14,
    cursor: clickable ? 'pointer' : 'default',
  };
}

const chapterTitle: React.CSSProperties = {
  flex: 1,
  color: '#333',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rowDownloadLink: React.CSSProperties = {
  color: '#6c5ce7',
  fontSize: 18,
  fontWeight: 700,
  textDecoration: 'none',
  flexShrink: 0,
  padding: '0 6px',
};

const downloadedTag: React.CSSProperties = {
  color: '#27ae60',
  fontSize: 12,
  flexShrink: 0,
};

const notDownloadedTag: React.CSSProperties = {
  color: '#e67e22',
  fontSize: 12,
  flexShrink: 0,
};
