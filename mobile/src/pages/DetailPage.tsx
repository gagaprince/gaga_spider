import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, assetUrl, type DetailData } from '../api/client';
import { getReadingProgress } from '../utils/readingProgress';
import { isInBookshelf, subscribeBookshelf, toggleBookshelf } from '../utils/bookshelf';

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
  const [pdfPaths, setPdfPaths] = useState<Record<number, string>>({});

  const [chapterPdfs, setChapterPdfs] = useState<ChapterPdfItem[] | null>(null);
  const [chapterPdfsBySource, setChapterPdfsBySource] = useState<
    Record<number, ChapterPdfItem[]>
  >({});
  const [exportingChapters, setExportingChapters] = useState(false);
  const [chapterMsg, setChapterMsg] = useState('');
  const [netdiskEnabled, setNetdiskEnabled] = useState(false);
  const [pdfUpload, setPdfUpload] = useState<{
    active: boolean;
    percent: number;
    done: boolean;
    error: string;
  }>({ active: false, percent: 0, done: false, error: '' });
  const [chapterUpload, setChapterUpload] = useState<{
    active: boolean;
    current: number;
    total: number;
    currentPercent: number;
    fileName: string;
    done: boolean;
    error: string;
  }>({
    active: false, current: 0, total: 0, currentPercent: 0,
    fileName: '', done: false, error: '',
  });
  const [activeSourceSiteId, setActiveSourceSiteId] = useState<number | null>(
    null,
  );
  const [readingProgress, setReadingProgress] = useState<{
    chapterId: number;
    chapterOrderIndex: number;
    title: string;
  } | null>(null);
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

  useEffect(() => {
    if (!resourceId) return;
    setLoading(true);
    api
      .getResource(Number(resourceId))
      .then((d) => {
        setData(d);
        setError('');
        setActiveSourceSiteId((prev) => {
          if (prev && d.sources.some((s) => s.sourceSiteId === prev)) return prev;
          return d.sources[0]?.sourceSiteId ?? null;
        });
      })
      .catch((e) => setError(e.message))
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

  // 进入页面时回显已生成的分章 PDF
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
      .catch(() => setChapterPdfs(null));
  }, [resourceId, activeSourceSiteId]);

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
  const hasChapters = visibleChapters.length > 0;
  const activePdfPath = activeSource
    ? pdfPaths[activeSource.sourceSiteId]
    : null;
  const activeChapterPdfs = activeSource
    ? chapterPdfsBySource[activeSource.sourceSiteId]?.length
      ? chapterPdfsBySource[activeSource.sourceSiteId]
      : chapterPdfs
    : chapterPdfs;

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setPdfMsg('');
    try {
      const sid = hasMultipleSources ? activeSource?.sourceSiteId : undefined;
      const r = await api.exportPdf(Number(resourceId), sid);
      if (sid != null) {
        setPdfPaths((prev) => ({ ...prev, [sid]: r.pdfPath }));
      } else {
        setData({ ...data, pdfPath: r.pdfPath });
      }
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
      const sid = activeSource?.sourceSiteId;
      const r = await api.exportChapterPdfs(Number(resourceId), sid);
      const mapped = r.chapters.map((c) => ({
          orderIndex: c.orderIndex,
          title: c.title,
          pdfPath: c.pdfPath,
        }));
      setChapterPdfs(mapped);
      if (sid != null) setChapterPdfsBySource((prev) => ({ ...prev, [sid]: mapped }));
      setChapterPdfsExpanded(true);
      setChapterMsg(`已生成 ${r.chapters.length} 个分章 PDF`);
    } catch (e: any) {
      setChapterMsg(e.message || '导出失败');
    } finally {
      setExportingChapters(false);
    }
  };

  const startPdfUpload = () => {
    const sid = hasMultipleSources ? activeSource?.sourceSiteId : undefined;
    const url = api.uploadPdfStreamUrl(Number(resourceId), sid);
    setPdfUpload({ active: true, percent: 0, done: false, error: '' });
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'file-progress') {
          setPdfUpload((prev) => ({ ...prev, percent: d.percent }));
        } else if (d.type === 'complete') {
          setPdfUpload({ active: false, percent: 100, done: true, error: '' });
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
  };

  const startChapterUpload = () => {
    const sid = hasMultipleSources ? activeSource?.sourceSiteId : undefined;
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
          setChapterUpload((prev) => ({ ...prev, total: d.total || 0 }));
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
  };

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* 头部信息 */}
      <div style={{ display: 'flex', gap: 12, padding: 14 }}>
        <div
          style={{
            width: 108,
            flexShrink: 0,
            alignSelf: 'flex-start',
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
            {visibleChapters.length} 章 ·{' '}
            {visibleChapters.filter((c) => c.isDownloaded).length} 章已抓取
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

      {/* 开始阅读 / 继续阅读 */}
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
          <div style={{ padding: '0 14px 14px' }}>
            <button
              onClick={() =>
                navigate(`/resources/${resourceId}/chapters/${targetChapter.id}`)
              }
              style={{
                width: '100%',
                border: 'none',
                background: '#27ae60',
                color: '#fff',
                padding: '14px 0',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {progressChapter ? '📖 继续阅读' : '📖 开始阅读'}
            </button>
            {progressChapter && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center' }}>
                上次读到: #{progressChapter.chapterOrderIndex} {progressChapter.title || ''}
              </div>
            )}
          </div>
        );
      })()}

      {/* 加入/移除书架 */}
      <div style={{ padding: '0 14px 14px' }}>
        <button
          onClick={() =>
            resourceId && setInBookshelf(toggleBookshelf(Number(resourceId)))
          }
          style={{
            width: '100%',
            border: inBookshelf ? '1px solid #6c5ce7' : 'none',
            background: inBookshelf ? '#fff' : '#6c5ce7',
            color: inBookshelf ? '#6c5ce7' : '#fff',
            padding: '12px 0',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {inBookshelf ? '⭐ 已在书架（点击移除）' : '☆ 加入书架'}
        </button>
      </div>

      {/* PDF 导出区 */}
      {hasMultipleSources && activeSource && (
        <div style={{ padding: '0 14px', marginBottom: 12 }}>
          <div style={{ ...sectionTitle, borderBottom: 'none', marginBottom: 6 }}>
            选择来源
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.sources.map((s) => {
              const active = s.sourceSiteId === activeSource.sourceSiteId;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSourceSiteId(s.sourceSiteId)}
                  style={{
                    border: active ? '1px solid #6c5ce7' : '1px solid #ddd',
                    background: active ? '#6c5ce7' : '#fff',
                    color: active ? '#fff' : '#555',
                    padding: '6px 14px',
                    borderRadius: 16,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {s.sourceSite?.name || s.sourceSite?.domain || '未知源'}
                </button>
              );
            })}
          </div>
        </div>
      )}

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

        {pdfMsg && (
          <div style={msgStyle(!!(activePdfPath || data.pdfPath))}>{pdfMsg}</div>
        )}
        {(activePdfPath || (!hasMultipleSources && data.pdfPath)) && (
          <a href={assetUrl(activePdfPath || data.pdfPath)} download style={downloadLink}>
            下载整本 PDF ↓
          </a>
        )}
        {netdiskEnabled && (activePdfPath || (!hasMultipleSources && data.pdfPath)) && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={startPdfUpload}
              disabled={pdfUpload.active}
              style={{
                ...downloadLink,
                border: 'none',
                background: pdfUpload.active ? '#81ecec' : '#00b894',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center',
                cursor: pdfUpload.active ? 'wait' : 'pointer',
              }}
            >
              {pdfUpload.active ? `上传中 ${pdfUpload.percent}%` : '☁️ 上传整本 PDF 到网盘'}
            </button>
            {pdfUpload.active && (
              <div style={{ marginTop: 6, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pdfUpload.percent}%`, height: '100%', background: '#00b894', transition: 'width 0.3s' }} />
              </div>
            )}
            {pdfUpload.done && (
              <div style={{ ...msgStyle(true), marginTop: 6 }}>✓ 上传成功</div>
            )}
            {pdfUpload.error && (
              <div style={{ ...msgStyle(false), marginTop: 6 }}>{pdfUpload.error}</div>
            )}
          </div>
        )}

        {chapterMsg && (
          <div style={msgStyle((activeChapterPdfs?.length ?? 0) > 0)}>{chapterMsg}</div>
        )}

        {activeChapterPdfs && activeChapterPdfs.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setChapterPdfsExpanded((v) => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#2d3436',
                  cursor: 'pointer',
                }}
              >
                <span>{chapterPdfsExpanded ? '▼' : '▶'}</span>
                分章 PDF ({activeChapterPdfs.length})
              </button>
              <a
                href={api.chapterPdfsZipUrl(
                  Number(resourceId),
                  hasMultipleSources ? activeSource?.sourceSiteId : undefined,
                )}
                download
                style={zipLink}
              >
                📦 打包 ZIP ↓
              </a>
              {netdiskEnabled && (
                <button
                  onClick={startChapterUpload}
                  disabled={chapterUpload.active}
                  style={{
                    border: 'none',
                    background: chapterUpload.active ? '#81ecec' : '#00b894',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: chapterUpload.active ? 'wait' : 'pointer',
                  }}
                >
                  {chapterUpload.active
                    ? `${chapterUpload.current}/${chapterUpload.total} ${chapterUpload.currentPercent}%`
                    : '☁️ 全部上传'}
                </button>
              )}
            </div>
            {chapterPdfsExpanded && (
            <div style={chapterListWrap}>
              {activeChapterPdfs.map((ch, idx) => (
                <div key={ch.orderIndex} style={chapterRow(idx < activeChapterPdfs.length - 1)}>
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
            )}
          </div>
        )}

        {(chapterUpload.active || chapterUpload.done || chapterUpload.error) && (
          <div style={{ marginTop: 8 }}>
            {chapterUpload.active && (
              <>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                  {chapterUpload.fileName}
                </div>
                <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${chapterUpload.total > 0 ? (chapterUpload.current / chapterUpload.total) * 100 : 0}%`,
                    height: '100%', background: '#00b894', transition: 'width 0.3s',
                  }} />
                </div>
              </>
            )}
            {chapterUpload.done && (
              <div style={{ ...msgStyle(true), marginTop: 6 }}>{chapterUpload.fileName}</div>
            )}
            {chapterUpload.error && (
              <div style={{ ...msgStyle(false), marginTop: 6 }}>{chapterUpload.error}</div>
            )}
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
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📖 章节列表 ({visibleChapters.length})</span>
          <button
            onClick={() => setChapterOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            style={{
              border: '1px solid #6c5ce7',
              background: '#fff',
              color: '#6c5ce7',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {chapterOrder === 'desc' ? '⬇ 倒序' : '⬆ 正序'}
          </button>
        </div>
        <div style={chapterListWrap}>
          {sortedChapters.map((ch, idx) => (
            <div
              key={ch.id}
              onClick={() =>
                navigate(`/resources/${resourceId}/chapters/${ch.id}`)
              }
              style={chapterRow(idx < sortedChapters.length - 1, true)}
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
