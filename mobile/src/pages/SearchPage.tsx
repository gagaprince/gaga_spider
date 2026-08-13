import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl, type Resource } from '../api/client';

interface CategoryInfo {
  name: string;
  count: number;
}

const PAGE_SIZE = 24;

export function SearchPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Resource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [completion, setCompletion] = useState('');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [error, setError] = useState('');
  const reqId = useRef(0);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchFirst = useCallback(
    async (kw: string, cat: string, comp: string) => {
      setLoading(true);
      setError('');
      const id = ++reqId.current;
      try {
        const resp = await api.getResources({
          keyword: kw || undefined,
          category: cat || undefined,
          completion: comp || undefined,
          scrapeStatus: 'scraped',
          page: 1,
          pageSize: PAGE_SIZE,
        });
        if (id !== reqId.current) return;
        setItems(resp.items);
        setTotal(resp.total);
        setPage(1);
      } catch (e: any) {
        if (id === reqId.current) setError(e.message || '加载失败');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchFirst(committedKeyword, category, completion);
  }, [fetchFirst, committedKeyword, category, completion]);

  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const resp = await api.getResources({
        keyword: committedKeyword || undefined,
        category: category || undefined,
        completion: completion || undefined,
        scrapeStatus: 'scraped',
        page: next,
        pageSize: PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...resp.items]);
      setPage(next);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasMore = page < totalPages;

  return (
    <div>
      {/* 顶部搜索栏 */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#6c5ce7',
          padding: '10px 12px',
          paddingTop: 'calc(10px + env(safe-area-inset-top))',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 20 }}>📚</span>
          <form
            style={{ flex: 1 }}
            onSubmit={(e) => {
              e.preventDefault();
              setCommittedKeyword(keyword.trim());
            }}
          >
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索漫画标题..."
              enterKeyHint="search"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                borderRadius: 20,
                fontSize: 15,
                outline: 'none',
              }}
            />
          </form>
        </div>
        {/* 筛选行 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={selectStyle}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
          <select
            value={completion}
            onChange={(e) => setCompletion(e.target.value)}
            style={selectStyle}
          >
            <option value="">全部状态</option>
            <option value="completed">已完结</option>
            <option value="ongoing">连载中</option>
          </select>
        </div>
      </header>

      {/* 内容区 */}
      <div style={{ padding: 12 }}>
        {loading ? (
          <div style={centerHint}>加载中...</div>
        ) : error ? (
          <div style={{ ...centerHint, color: '#e74c3c' }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={centerHint}>没有找到漫画</div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
              }}
            >
              {items.map((r) => (
                <Card key={r.id} r={r} onClick={() => navigate(`/resources/${r.id}`)} />
              ))}
            </div>
            <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
              {hasMore ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={loadMoreBtn}
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </button>
              ) : (
                <span style={{ color: '#aaa', fontSize: 13 }}>
                  共 {total} 部, 已全部加载
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ r, onClick }: { r: Resource; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    ongoing: '#27ae60',
    completed: '#3498db',
    unknown: '#999',
  };
  const statusLabels: Record<string, string> = {
    ongoing: '连载',
    completed: '完结',
    unknown: '未知',
  };
  const isScraped = r.chapterCount > 0;
  const cover = assetUrl(r.localCoverPath || r.coverUrl);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '3/4',
          background: '#f0f0f0',
          position: 'relative',
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt={r.title}
            loading="lazy"
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
              fontSize: 36,
              color: '#ccc',
            }}
          >
            📖
          </div>
        )}
        <span style={badge(statusColors[r.status] || '#999', { top: 6, right: 6 })}>
          {statusLabels[r.status] || r.status}
        </span>
        {isScraped && (
          <span style={badge('#27ae60', { top: 6, left: 6 })}>✓</span>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <h3
          style={{
            margin: '0 0 4px',
            fontSize: 14,
            fontWeight: 600,
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
            color: '#999',
          }}
        >
          <span>{r.type === 'comic' ? '漫画' : '小说'}</span>
          <span>{r.chapterCount} 章</span>
        </div>
      </div>
    </div>
  );
}

function badge(
  bg: string,
  pos: React.CSSProperties,
): React.CSSProperties {
  return {
    position: 'absolute',
    background: bg,
    color: '#fff',
    padding: '2px 7px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    ...pos,
  };
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  background: 'rgba(255,255,255,0.92)',
  color: '#2d3436',
};

const loadMoreBtn: React.CSSProperties = {
  border: '1px solid #6c5ce7',
  background: '#fff',
  color: '#6c5ce7',
  padding: '8px 28px',
  borderRadius: 20,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const centerHint: React.CSSProperties = {
  textAlign: 'center',
  padding: 60,
  color: '#999',
  fontSize: 15,
};
