import { useEffect, useState } from 'react';
import { api, type Resource } from '../api/client';
import { CoverPlaceholder } from './CoverPlaceholder';

interface BatchScrapeModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export function BatchScrapeModal({ onClose, onSuccess }: BatchScrapeModalProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [scrapeFilter, setScrapeFilter] = useState('not_scraped');

  useEffect(() => {
    loadResources();
  }, [scrapeFilter]);

  const loadResources = async () => {
    setLoading(true);
    try {
      const resp = await api.getResources({
        scrapeStatus: scrapeFilter || undefined,
        page: 1,
        pageSize: 500,
      });
      setResources(resp.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(resources.map((r) => r.id)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    let count = 0;
    for (const id of selected) {
      try {
        await api.scrapeResource(id, 0);
        count++;
      } catch (e) {
        console.error(`抓取资源 ${id} 失败:`, e);
      }
    }
    setSubmitting(false);
    onSuccess(count);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 0,
          width: 700,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>批量抓取</h2>
          <span style={{ color: '#6c5ce7', fontSize: 14, fontWeight: 600 }}>
            已选 {selected.size} 本
          </span>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <select
            value={scrapeFilter}
            onChange={(e) => {
              setScrapeFilter(e.target.value);
              setSelected(new Set());
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
              background: '#fff',
            }}
          >
            <option value="">全部</option>
            <option value="not_scraped">未抓取</option>
            <option value="scraped">已抓取</option>
          </select>
          <button
            onClick={selectAll}
            style={linkBtnStyle}
          >
            全选
          </button>
          <button onClick={selectNone} style={linkBtnStyle}>
            取消全选
          </button>
          <span style={{ color: '#999', fontSize: 12 }}>共 {resources.length} 本</span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              加载中...
            </div>
          ) : resources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              暂无漫画
            </div>
          ) : (
            resources.map((r) => {
              const checked = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => toggleSelect(r.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 24px',
                    cursor: 'pointer',
                    background: checked ? '#f0f0ff' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!checked) e.currentTarget.style.background = '#f9f9f9';
                  }}
                  onMouseLeave={(e) => {
                    if (!checked) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <div
                    style={{
                      width: 36,
                      height: 48,
                      borderRadius: 4,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {r.localCoverPath || r.coverUrl ? (
                      <img
                        src={r.localCoverPath || r.coverUrl!}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <CoverPlaceholder fontSize={8} iconSize={16} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#2d3436',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {r.category || '-'} · {r.chapterCount > 0 ? `${r.chapterCount} 章` : '未抓取'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #eee',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitting}
            style={{
              padding: '8px 24px',
              border: 'none',
              borderRadius: 6,
              background: selected.size === 0 || submitting ? '#ccc' : '#6c5ce7',
              color: '#fff',
              cursor: selected.size === 0 || submitting ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {submitting
              ? '创建任务中...'
              : `抓取 ${selected.size} 本`}
          </button>
        </div>
      </div>
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: '#6c5ce7',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: '4px 8px',
};
