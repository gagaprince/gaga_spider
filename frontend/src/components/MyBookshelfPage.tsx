import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgeRating } from '../hooks/useAgeRating';
import { api, type Resource } from '../api/client';
import {
  getBookshelfIds,
  removeFromBookshelf,
  subscribeBookshelf,
} from '../utils/bookshelf';
import { Toast } from './BookshelfPage';

export function MyBookshelfPage() {
  const navigate = useNavigate();
  const [ageRating] = useAgeRating();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    const ids = getBookshelfIds();
    if (ids.length === 0) {
      setResources([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await api.getResource(id);
          return r as Resource;
        } catch {
          return null;
        }
      }),
    );
    setResources(
      results.filter(
        (r): r is Resource =>
          r !== null && (ageRating === 'adult' || r.ageRating !== 'adult'),
      ),
    );
    setLoading(false);
  }, [ageRating]);

  useEffect(() => {
    load();
    const unsubscribe = subscribeBookshelf(load);
    return unsubscribe;
  }, [load]);

  const statusColors: Record<string, string> = {
    ongoing: '#27ae60',
    completed: '#3498db',
    unknown: '#999',
  };

  const handleBatchUpdate = async () => {
    if (batchUpdating || resources.length === 0) return;
    setBatchUpdating(true);
    showToast(`已开始更新书架中的 ${resources.length} 本书`);
    let success = 0;
    let failed = 0;
    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      setBatchProgress(`更新中... ${i + 1}/${resources.length} - ${r.title}`);
      try {
        await api.scrapeResource(r.id, 0);
        success++;
      } catch {
        failed++;
      }
    }
    setBatchProgress('');
    setBatchUpdating(false);
    showToast(`批量更新已提交：成功 ${success} 本${failed ? `，失败 ${failed} 本` : ''}`);
  };
  const statusLabels: Record<string, string> = {
    ongoing: '连载中',
    completed: '已完结',
    unknown: '未知',
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2d3436' }}>
          我的书架 ({resources.length})
        </h2>
        {resources.length > 0 && (
          <button
            onClick={handleBatchUpdate}
            disabled={batchUpdating}
            title="批量抓取书架中所有漫画的最新章节"
            style={{
              border: 'none',
              background: batchUpdating ? '#a29bfe' : '#e17055',
              color: '#fff',
              padding: '7px 16px',
              borderRadius: 16,
              cursor: batchUpdating ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {batchUpdating ? '更新中...' : '🔄 批量更新'}
          </button>
        )}
      </div>
      {batchUpdating && (
        <div
          style={{
            marginBottom: 12,
            fontSize: 13,
            color: '#6c5ce7',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {batchProgress}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>加载中...</div>
      ) : resources.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 10,
            padding: 60,
            textAlign: 'center',
            color: '#999',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
          <p>书架空空如也</p>
          <p style={{ fontSize: 14 }}>在漫画详情页点击「加入书架」即可收藏</p>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: 12,
              padding: '8px 20px',
              border: 'none',
              borderRadius: 8,
              background: '#6c5ce7',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            去浏览漫画
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 16,
          }}
        >
          {resources.map((r) => {
            const isScraped = r.chapterCount > 0;
            return (
              <div
                key={r.id}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  onClick={() => navigate(`/resources/${r.id}`)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '3/4',
                      background: '#f0f0f0',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {r.localCoverPath || r.coverUrl ? (
                      <img
                        src={r.localCoverPath || r.coverUrl!}
                        alt={r.title}
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
                          fontSize: 40,
                          color: '#ccc',
                        }}
                      >
                        📖
                      </div>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: statusColors[r.status] || '#999',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {statusLabels[r.status] || r.status}
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        background: isScraped ? '#27ae60' : '#e67e22',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {isScraped ? '✓ 已抓取' : '未抓取'}
                    </span>
                  </div>
                  <div style={{ padding: 10 }}>
                    <h3
                      style={{
                        margin: '0 0 6px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#2d3436',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.title}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: '#888',
                      }}
                    >
                      <span>{r.type === 'comic' ? '漫画' : '小说'}</span>
                      <span>{r.chapterCount} 章</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeFromBookshelf(r.id)}
                  style={{
                    margin: '0 10px 10px',
                    padding: '6px 0',
                    border: 'none',
                    borderRadius: 6,
                    background: '#fdecea',
                    color: '#e74c3c',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  移除书架
                </button>
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
