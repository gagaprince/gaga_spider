import { useEffect, useState, useCallback } from 'react';
import { api, type Resource } from '../api/client';
import { ScrapeModal } from './ScrapeModal';
import { ResourceDetail } from './ResourceDetail';
import { BatchScrapeModal } from './BatchScrapeModal';

interface CategoryInfo {
  name: string;
  count: number;
}

export function BookshelfPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [scrapeFilter, setScrapeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [showScrape, setShowScrape] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [scrapingIds, setScrapingIds] = useState<Set<number>>(new Set());

  const pageSize = 20;

  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.getResources({
        keyword: keyword || undefined,
        scrapeStatus: scrapeFilter || undefined,
        category: categoryFilter || undefined,
        page,
        pageSize,
      });
      setResources(resp.items);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [keyword, scrapeFilter, categoryFilter, page]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    showToast('正在抓取目录，请稍候...');
    try {
      const resp = await api.discoverCatalog();
      showToast(`目录抓取完成: 发现 ${resp.data.discovered} 部, 新增 ${resp.data.new} 部`);
      setPage(1);
      fetchResources();
      fetchCategories();
    } catch (e: any) {
      showToast(e.message || '目录抓取失败');
    } finally {
      setDiscovering(false);
    }
  };

  const handleScrapeOne = async (r: Resource) => {
    setScrapingIds((prev) => new Set(prev).add(r.id));
    try {
      await api.scrapeResource(r.id, 0);
      showToast(`已创建抓取任务: ${r.title}`);
    } catch (e: any) {
      showToast(e.message || '创建任务失败');
    } finally {
      setScrapingIds((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (selectedId !== null) {
    return (
      <ResourceDetail
        resourceId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ padding: '16px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          placeholder="搜索漫画标题..."
          style={{ flex: 1, minWidth: 200, maxWidth: 300, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
        />
        <select
          value={scrapeFilter}
          onChange={(e) => { setScrapeFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="">全部抓取状态</option>
          <option value="scraped">已抓取</option>
          <option value="not_scraped">未抓取</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff', maxWidth: 150 }}
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
          ))}
        </select>
        <span style={{ color: '#888', fontSize: 14 }}>共 {total} 部</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDiscover}
          disabled={discovering}
          style={{
            padding: '8px 16px', border: '1px solid #6c5ce7', borderRadius: 6,
            background: discovering ? '#f5f5f5' : '#fff', color: '#6c5ce7',
            cursor: discovering ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          {discovering ? '抓取中...' : '📥 抓取目录'}
        </button>
        <button
          onClick={() => setShowBatch(true)}
          style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#6c5ce7', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          📚 批量抓取
        </button>
      </div>

      {/* Grid */}
      <div style={{ padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
        ) : resources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#999', fontSize: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <p>暂无漫画资源</p>
            <p style={{ fontSize: 14 }}>点击「抓取目录」发现所有漫画</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {resources.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                scraping={scrapingIds.has(r.id)}
                onClick={() => setSelectedId(r.id)}
                onScrape={() => handleScrapeOne(r)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>上一页</button>
            <span style={{ padding: '8px 16px', color: '#666' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>下一页</button>
          </div>
        )}
      </div>

      {showScrape && (
        <ScrapeModal
          onClose={() => setShowScrape(false)}
          onSuccess={() => { fetchResources(); showToast('抓取任务已创建'); }}
        />
      )}

      {showBatch && (
        <BatchScrapeModal
          onClose={() => setShowBatch(false)}
          onSuccess={(count) => {
            setShowBatch(false);
            showToast(`已创建 ${count} 个抓取任务`);
            fetchResources();
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return { padding: '8px 16px', border: '1px solid #ddd', borderRadius: 6, background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#ccc' : '#333', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14 };
}

function ResourceCard({
  resource: r,
  scraping,
  onClick,
  onScrape,
}: {
  resource: Resource;
  scraping: boolean;
  onClick: () => void;
  onScrape: () => void;
}) {
  const statusColors: Record<string, string> = { ongoing: '#27ae60', completed: '#3498db', unknown: '#999' };
  const statusLabels: Record<string, string> = { ongoing: '连载中', completed: '已完结', unknown: '未知' };
  const isScraped = r.chapterCount > 0;
  return (
    <div
      style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s, transform 0.2s', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div onClick={onClick} style={{ flex: 1 }}>
        <div style={{ width: '100%', aspectRatio: '3/4', background: '#f0f0f0', overflow: 'hidden', position: 'relative' }}>
          {(r.localCoverPath || r.coverUrl) ? (
            <img src={r.localCoverPath || r.coverUrl!} alt={r.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#ccc' }}>📖</div>
          )}
          <span style={{ position: 'absolute', top: 8, right: 8, background: statusColors[r.status] || '#999', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
            {statusLabels[r.status] || r.status}
          </span>
          <span style={{ position: 'absolute', top: 8, left: 8, background: isScraped ? '#27ae60' : '#e67e22', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
            {isScraped ? '✓ 已抓取' : '未抓取'}
          </span>
          {r.category && (
            <span style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(108,92,231,0.85)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {r.category}
            </span>
          )}
        </div>
        <div style={{ padding: 10 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#2d3436', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
            <span>{r.type === 'comic' ? '漫画' : '小说'}</span>
            <span>{r.chapterCount} 章</span>
          </div>
        </div>
      </div>
      {/* Scrape button */}
      <button
        onClick={(e) => { e.stopPropagation(); onScrape(); }}
        disabled={scraping}
        style={{
          margin: '0 10px 10px',
          padding: '6px 0',
          border: 'none',
          borderRadius: 6,
          background: scraping ? '#ccc' : isScraped ? '#f0f0f0' : '#6c5ce7',
          color: scraping ? '#999' : isScraped ? '#666' : '#fff',
          cursor: scraping ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { if (!scraping) e.currentTarget.style.background = isScraped ? '#e8e8e8' : '#5b4bdb'; }}
        onMouseLeave={(e) => { if (!scraping) e.currentTarget.style.background = isScraped ? '#f0f0f0' : '#6c5ce7'; }}
      >
        {scraping ? '创建中...' : isScraped ? '重新抓取' : '抓取全本'}
      </button>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#2d3436', color: '#fff', padding: '12px 24px', borderRadius: 8, fontSize: 14, zIndex: 2000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
      {message}
    </div>
  );
}
