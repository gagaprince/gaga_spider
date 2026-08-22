import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl, type Resource } from '../api/client';
import { useAgeRating } from "../hooks/useAgeRating";
import {
  getBookshelfIds,
  isInBookshelf,
  subscribeBookshelf,
  toggleBookshelf,
} from '../utils/bookshelf';

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
  const [error, setError] = useState("");
  const [ageRating, setAgeRating] = useAgeRating();
  const [shelfMode, setShelfMode] = useState(false);
  const reqId = useRef(0);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories(ageRating);
      setCategories(cats);
    } catch {
      /* ignore */
    }
  }, [ageRating]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchFirst = useCallback(
    async (kw: string, cat: string, comp: string, ar: string) => {
      setLoading(true);
      setError('');
      const id = ++reqId.current;
      try {
        const resp = await api.getResources({
          keyword: kw || undefined,
          category: cat || undefined,
          completion: comp || undefined,
          ageRating: ar,
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
    if (shelfMode) return;
    fetchFirst(committedKeyword, category, completion, ageRating);
  }, [fetchFirst, committedKeyword, category, completion, ageRating, shelfMode]);

  const loadMore = async () => {
    if (shelfMode) return;
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const resp = await api.getResources({
        keyword: committedKeyword || undefined,
        category: category || undefined,
        completion: completion || undefined,
        ageRating,
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

  const loadShelf = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ids = getBookshelfIds();
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            return (await api.getResource(id)) as unknown as Resource;
          } catch {
            return null;
          }
        }),
      );
      const filtered = results.filter(
        (r): r is Resource =>
          r !== null && (ageRating === 'adult' || r.ageRating !== 'adult'),
      );
      const normalized = filtered.map((r) => {
        const names = (r.categories ?? [])
          .map((c: any) => (typeof c === 'string' ? c : c?.name))
          .filter(Boolean) as string[];
        return { ...r, categories: names, category: r.category ?? names[0] ?? null };
      });
      setItems(normalized);
      setTotal(normalized.length);
      setPage(1);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [ageRating]);

  useEffect(() => {
    if (!shelfMode) return;
    loadShelf();
    return subscribeBookshelf(loadShelf);
  }, [shelfMode, loadShelf]);

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
          background: ageRating === 'adult' ? '#c0392b' : '#6c5ce7',
          padding: '10px 12px',
          paddingTop: 'calc(10px + env(safe-area-inset-top))',
          transition: 'background 0.2s',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              setAgeRating(ageRating === 'adult' ? 'all' : 'adult');
              setCategory('');
              setCompletion('');
              setPage(1);
            }}
            title={ageRating === 'adult' ? '当前: 成人限定，点击切换到全年龄' : '当前: 全年龄，点击切换到成人限定'}
            style={{
              border: 'none',
              background: ageRating === 'adult' ? 'rgba(231,76,60,0.9)' : 'rgba(255,255,255,0.2)',
              color: '#fff',
              width: 36,
              height: 36,
              borderRadius: '50%',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            {ageRating === 'adult' ? '🔞' : '📚'}
          </button>
          <button
            onClick={() => {
              setShelfMode((v) => !v);
              setKeyword('');
              setCommittedKeyword('');
              setCategory('');
              setCompletion('');
              setPage(1);
            }}
            title="我的书架"
            style={{
              border: 'none',
              background: shelfMode ? '#fdcb6e' : 'rgba(255,255,255,0.2)',
              color: '#fff',
              width: 36,
              height: 36,
              borderRadius: '50%',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            ⭐
          </button>
          <form
            style={{ flex: 1 }}
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
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
        {!shelfMode && (
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
        )}
      </header>

      {/* 内容区 */}
      <div style={{ padding: 12 }}>
        {loading ? (
          <div style={centerHint}>加载中...</div>
        ) : error ? (
          <div style={{ ...centerHint, color: '#e74c3c' }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={centerHint}>{shelfMode ? '书架空空如也' : '没有找到漫画'}</div>
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
              {hasMore && !shelfMode ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={loadMoreBtn}
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </button>
              ) : (
                <span style={{ color: '#aaa', fontSize: 13 }}>
                  {shelfMode ? `书架共 ${total} 部` : `共 ${total} 部, 已全部加载`}
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
  const [inShelf, setInShelf] = useState(isInBookshelf(r.id));
  useEffect(() => {
    const sync = () => setInShelf(isInBookshelf(r.id));
    return subscribeBookshelf(sync);
  }, [r.id]);

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
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 11,
              color: '#b2bec3',
              background: 'linear-gradient(135deg, #f5f6fa 0%, #eef0f5 100%)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span style={{ fontWeight: 500 }}>暂无封面</span>
          </div>
        )}
        <span style={badge(statusColors[r.status] || '#999', { top: 6, right: 6 })}>
          {statusLabels[r.status] || r.status}
        </span>
       {isScraped && (
         <span style={badge('#27ae60', { top: 6, left: 6 })}>✓</span>
       )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setInShelf(toggleBookshelf(r.id));
          }}
          aria-label={inShelf ? '移除书架' : '加入书架'}
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: inShelf ? '#fdcb6e' : '#fff',
            width: 28,
            height: 28,
            borderRadius: '50%',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {inShelf ? '⭐' : '☆'}
        </button>
       {(r.categories?.length || r.category) && (
          <span style={badge('rgba(108,92,231,0.9)', { bottom: 6, left: 6 })}>
            {(r.categories && r.categories.length > 0
              ? r.categories
              : r.category
                ? [r.category]
                : []
            ).slice(0, 2).join(' / ')}
          </span>
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
