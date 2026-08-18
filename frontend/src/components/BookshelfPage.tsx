import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Resource } from '../api/client';
import { ScrapeModal } from './ScrapeModal';
import { BatchScrapeModal } from './BatchScrapeModal';
import { useAgeRating } from '../hooks/useAgeRating';
import { isInBookshelf, subscribeBookshelf, toggleBookshelf } from '../utils/bookshelf';

interface CategoryInfo {
  name: string;
  count: number;
}

interface SourceSiteInfo {
  id: number;
  name: string;
  domain: string;
}

export function BookshelfPage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const scrapeFilter = searchParams.get('scrape') || '';
  const categoryFilter = searchParams.get('category') || '';
  const completionFilter = searchParams.get('completion') || '';
  const sourceSiteFilter = searchParams.get('sourceSite') || '';
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [sourceSites, setSourceSites] = useState<SourceSiteInfo[]>([]);
  const [sourceSitesLoaded, setSourceSitesLoaded] = useState(false);
  const [showScrape, setShowScrape] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [toast, setToast] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverDomain, setDiscoverDomain] = useState('');
  const [scrapingIds, setScrapingIds] = useState<Set<number>>(new Set());
  const [jumpPage, setJumpPage] = useState('');
  const [ageRating] = useAgeRating();

  const pageSize = 50;

  // 浏览器前进/后退时,把 URL 中的搜索词同步回输入框
  useEffect(() => {
    setKeyword(searchParams.get('q') || '');
  }, [searchParams]);

  const updateParams = useCallback(
    (patch: Record<string, string>, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (!value) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      // 任何筛选条件变化都回到第 1 页
      if (!('page' in patch)) {
        next.delete('page');
      }
      setSearchParams(next, opts?.replace ? { replace: true } : undefined);
    },
    [searchParams, setSearchParams],
  );

  const goToPage = (p: number, replace = false) => {
    const next = new URLSearchParams(searchParams);
    if (p <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(p));
    }
    setSearchParams(next, replace ? { replace: true } : undefined);
  };

  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.getResources({
        keyword: keyword || undefined,
       scrapeStatus: scrapeFilter || undefined,
       category: categoryFilter || undefined,
        completion: completionFilter || undefined,
       sourceSite: sourceSiteFilter || undefined,
        ageRating,
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
  }, [keyword, scrapeFilter, categoryFilter, completionFilter, sourceSiteFilter, ageRating, page]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories(ageRating);
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  }, [ageRating]);

  const fetchSourceSites = useCallback(async () => {
    try {
      const sites = await api.getSourceSites(ageRating);
      setSourceSites(sites);
      setSourceSitesLoaded(true);
    } catch (e) {
      console.error(e);
    }
  }, [ageRating]);

  useEffect(() => {
    if (!sourceSitesLoaded) return;
    if (sourceSiteFilter && !sourceSites.some((s) => s.domain === sourceSiteFilter)) {
      updateParams({ sourceSite: '' });
    }
    if (sourceSites.length > 0) {
      if (!sourceSites.some((s) => s.domain === discoverDomain)) {
        setDiscoverDomain(sourceSites[0].domain);
      }
    } else {
      setDiscoverDomain('');
    }
  }, [sourceSites, sourceSitesLoaded, sourceSiteFilter, discoverDomain, updateParams]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchSourceSites();
  }, [fetchSourceSites]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleDiscover = async () => {
    if (!discoverDomain) return;
    setDiscovering(true);
    const site = sourceSites.find((s) => s.domain === discoverDomain);
    const siteName = site?.name || discoverDomain;
    showToast(`正在抓取${siteName}目录，请稍候...`);
    try {
      const resp = discoverDomain === 'www.webtoons.com'
        ? await api.discoverWebtoons()
        : discoverDomain === 'www.dongmanhi.com'
          ? await api.discoverDongmanhi()
          : discoverDomain === 'nnhm7.com'
            ? await api.discoverNniaooman()
            : discoverDomain === 'manhwa18.cc'
              ? await api.discoverManhwa18()
              : discoverDomain === 'www.dongmanmanhua.cn'
                ? await api.discoverDongmanmanhua()
                : discoverDomain === 'comic.acgn.cc'
                  ? await api.discoverAcgn()
              : await api.discoverManhuazhan();
      showToast(`目录抓取完成: 发现 ${resp.data.discovered} 部, 新增 ${resp.data.new} 部`);
      goToPage(1, true);
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
      const resp = await api.scrapeResource(r.id, 0);
      const count = resp.data?.sourceCount ?? 1;
      showToast(
        count > 1
          ? `已为 ${count} 个源同时创建抓取任务: ${r.title}`
          : `已创建抓取任务: ${r.title}`,
      );
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

  return (
    <div>
      {/* Toolbar */}
      <div style={{ padding: '16px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            updateParams({ q: e.target.value, page: '' }, { replace: true });
          }}
          placeholder="搜索漫画标题..."
          style={{ flex: 1, minWidth: 200, maxWidth: 300, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
        />
        <select
          value={scrapeFilter}
          onChange={(e) => updateParams({ scrape: e.target.value })}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="">全部抓取状态</option>
          <option value="scraped">已抓取</option>
          <option value="not_scraped">未抓取</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => updateParams({ category: e.target.value })}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff', maxWidth: 150 }}
        >
          <option value="">全部分类</option>
         {categories.map((c) => (
           <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
         ))}
       </select>
        <select
          value={completionFilter}
          onChange={(e) => updateParams({ completion: e.target.value })}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="">全部状态</option>
          <option value="ongoing">连载中</option>
          <option value="completed">已完结</option>
        </select>
        <select
          value={sourceSiteFilter}
          onChange={(e) => updateParams({ sourceSite: e.target.value })}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="">全部源站</option>
          {sourceSites.map((s) => (
            <option key={s.id} value={s.domain}>{s.name}</option>
          ))}
        </select>
        <span style={{ color: '#888', fontSize: 14 }}>共 {total} 部</span>
        <div style={{ flex: 1 }} />
        <select
          value={discoverDomain}
          onChange={(e) => setDiscoverDomain(e.target.value)}
          disabled={discovering || sourceSites.length === 0}
          style={{ padding: '8px 8px', border: '1px solid #6c5ce7', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          {sourceSites.map((s) => (
            <option key={s.id} value={s.domain}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={handleDiscover}
          disabled={discovering || !discoverDomain}
          style={{
            padding: '8px 16px', border: '1px solid #6c5ce7', borderRadius: 6,
            background: discovering || !discoverDomain ? '#f5f5f5' : '#fff',
            color: discovering || !discoverDomain ? '#aaa' : '#6c5ce7',
            cursor: discovering || !discoverDomain ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
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
        {totalPages > 1 && (
          <div style={{ marginBottom: 24 }}>
            <Pagination page={page} totalPages={totalPages} jumpPage={jumpPage} setJumpPage={setJumpPage} goToPage={goToPage} justify="flex-end" />
          </div>
        )}
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
                onClick={() => navigate(`/resources/${r.id}`)}
                onScrape={() => handleScrapeOne(r)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ marginTop: 32 }}>
            <Pagination page={page} totalPages={totalPages} jumpPage={jumpPage} setJumpPage={setJumpPage} goToPage={goToPage} justify="center" />
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

function Pagination({
  page,
  totalPages,
  jumpPage,
  setJumpPage,
  goToPage,
  justify,
}: {
  page: number;
  totalPages: number;
  jumpPage: string;
  setJumpPage: (v: string) => void;
  goToPage: (p: number) => void;
  justify: 'flex-start' | 'flex-end' | 'center';
}) {
  const handleJump = () => {
    const p = parseInt(jumpPage, 10);
    if (p >= 1 && p <= totalPages) {
      goToPage(p);
      setJumpPage('');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: justify }}>
      <button onClick={() => goToPage(Math.max(1, page - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>上一页</button>
      <span style={{ padding: '8px 16px', color: '#666' }}>{page} / {totalPages}</span>
      <button onClick={() => goToPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>下一页</button>
      <span style={{ color: '#888', fontSize: 13 }}>跳至</span>
      <input
        type="number"
        min={1}
        max={totalPages}
        value={jumpPage}
        onChange={(e) => setJumpPage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleJump(); }}
        style={{ width: 60, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
      />
      <span style={{ color: '#888', fontSize: 13 }}>页</span>
      <button onClick={handleJump} style={pageBtnStyle(false)}>跳转</button>
    </div>
  );
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
  const [inBookshelf, setInBookshelf] = useState(isInBookshelf(r.id));
  useEffect(() => {
    const sync = () => setInBookshelf(isInBookshelf(r.id));
    return subscribeBookshelf(sync);
  }, [r.id]);
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
          {(r.categories?.length || r.category) && (
            <span style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 'calc(100% - 16px)' }}>
              {(r.categories && r.categories.length > 0 ? r.categories : (r.category ? [r.category] : [])).slice(0, 2).map((c) => (
                <span key={c} style={{ background: 'rgba(108,92,231,0.85)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {c}
                </span>
              ))}
              {(r.categories?.length ?? 0) > 2 && (
                <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  +{(r.categories!.length - 2)}
                </span>
              )}
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
      <div style={{ display: 'flex', gap: 6, margin: '0 10px 10px' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onScrape(); }}
        disabled={scraping}
        style={{
          flex: 1,
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
        <button
          onClick={(e) => { e.stopPropagation(); setInBookshelf(toggleBookshelf(r.id)); }}
          title={inBookshelf ? "从我的书架移除" : "加入我的书架"}
          style={{
            flex: 1,
            padding: "6px 0",
            border: "none",
            borderRadius: 6,
            background: inBookshelf ? "#fff" : "#6c5ce7",
            color: inBookshelf ? "#6c5ce7" : "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: inBookshelf ? "inset 0 0 0 1px #6c5ce7" : "none",
          }}
        >
          {inBookshelf ? "⭐ 已在书架" : "☆ 加入书架"}
        </button>
      </div>
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
