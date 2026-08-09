import { useEffect, useState } from 'react';

interface ResourceDetailProps {
  resourceId: number;
  onBack: () => void;
}

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

export function ResourceDetail({ resourceId, onBack }: ResourceDetailProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
          onClick={onBack}
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
            <div style={{ marginTop: 12, fontSize: 12, color: '#aaa' }}>
              来源: {data.sources[0].sourceUrl}
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: idx < data.chapters.length - 1 ? '1px solid #f0f0f0' : 'none',
                fontSize: 14,
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
