import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, assetUrl, type ChapterData } from '../api/client';
import { saveReadingProgress } from '../utils/readingProgress';

export function ReaderPage() {
  const { chapterId: chapterIdStr, resourceId } = useParams<{
    chapterId: string;
    resourceId: string;
  }>();
  const chapterId = Number(chapterIdStr);
  const navigate = useNavigate();
  const [data, setData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(8);
  const loadingRef = useRef<number | null>(null);

  const loadChapter = useCallback((id: number) => {
    setLoading(true);
    setError('');
    setVisibleCount(8);
    window.scrollTo({ top: 0 });
    api
      .getChapterImages(id)
      .then((d) => {
        // 去重: 同一 orderIndex 只保留一条
        const seen = new Set<number>();
        const deduped = d.images.filter((img) => {
          if (seen.has(img.orderIndex)) return false;
          seen.add(img.orderIndex);
          return true;
        });
        setData({ ...d, images: deduped });
        saveReadingProgress(
          d.resourceId,
          d.id,
          d.orderIndex,
          d.title,
          d.sourceSiteId,
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!chapterId) return;
    if (loadingRef.current === chapterId) return;
    loadingRef.current = chapterId;
    loadChapter(chapterId);
  }, [chapterId, loadChapter]);

  // 滚动接近底部时懒加载更多图片
  useEffect(() => {
    const handleScroll = () => {
      if (!data) return;
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (docHeight - scrollBottom < 1000 && visibleCount < data.images.length) {
        setVisibleCount((c) => Math.min(c + 4, data.images.length));
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [data, visibleCount]);

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  if (error || !data) {
    return (
      <div style={errorWrap}>
        <div style={{ color: '#e74c3c', marginBottom: 16 }}>{error || '未找到章节'}</div>
        <button onClick={() => navigate(-1)} style={backBtn}>
          返回
        </button>
      </div>
    );
  }

  const downloadedImages = data.images.filter((img) => img.localPath);
  const hasImages = downloadedImages.length > 0;

  return (
    <div style={{ background: '#1a1a1a', minHeight: '100vh' }}>
      {/* 顶部栏 */}
      <div style={topBar}>
        <button onClick={() => navigate(-1)} style={topBtn} aria-label="返回">
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={topTitle}>
            #{data.orderIndex} {data.title}
          </div>
          <div style={topSub}>
            {downloadedImages.length}/{data.images.length} 张
          </div>
        </div>
        <button
          onClick={() =>
            data.prevChapter &&
            navigate(`/resources/${resourceId}/chapters/${data.prevChapter.id}`)
          }
          disabled={!data.prevChapter}
          style={iconBtn(!!data.prevChapter)}
          aria-label="上一章"
        >
          ‹
        </button>
        <button
          onClick={() =>
            data.nextChapter &&
            navigate(`/resources/${resourceId}/chapters/${data.nextChapter.id}`)
          }
          disabled={!data.nextChapter}
          style={iconBtn(!!data.nextChapter)}
          aria-label="下一章"
        >
          ›
        </button>
      </div>

      {!hasImages && (
        <div style={emptyHint}>该章节暂无本地图片</div>
      )}

      <div style={{ padding: '0 0 24px' }}>
        {downloadedImages.slice(0, visibleCount).map((img) => (
          <img
            key={img.id}
            src={assetUrl(img.localPath)}
            alt={`第 ${img.orderIndex} 页`}
            loading="lazy"
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        ))}

        {visibleCount < downloadedImages.length && (
          <div style={loadingMore}>加载更多...</div>
        )}
      </div>

      {/* 底部上/下章导航 */}
      <div style={bottomNav}>
        {data.prevChapter ? (
          <button
            onClick={() =>
              navigate(`/resources/${resourceId}/chapters/${data.prevChapter!.id}`)
            }
            style={{ ...navBtn, textAlign: 'left' }}
          >
            <span style={navArrow}>‹</span>
            <span style={navTextWrap}>
              <span style={navLabel}>上一章</span>
              <span style={navTitle}>{data.prevChapter.title}</span>
            </span>
          </button>
        ) : (
          <div style={{ ...navBtn, ...navDisabled, textAlign: 'left' }}>
            <span style={navArrow}>‹</span>
            <span style={navTextWrap}>
              <span style={navLabel}>上一章</span>
              <span style={navTitle}>已是第一章</span>
            </span>
          </div>
        )}
        {data.nextChapter ? (
          <button
            onClick={() =>
              navigate(`/resources/${resourceId}/chapters/${data.nextChapter!.id}`)
            }
            style={{ ...navBtn, textAlign: 'right' }}
          >
            <span style={navTextWrap}>
              <span style={navLabel}>下一章</span>
              <span style={navTitle}>{data.nextChapter.title}</span>
            </span>
            <span style={navArrow}>›</span>
          </button>
        ) : (
          <div style={{ ...navBtn, ...navDisabled, textAlign: 'right' }}>
            <span style={navTextWrap}>
              <span style={navLabel}>下一章</span>
              <span style={navTitle}>已是最后一章</span>
            </span>
            <span style={navArrow}>›</span>
          </div>
        )}
      </div>
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: 120,
  color: '#999',
  fontSize: 15,
  background: '#1a1a1a',
  minHeight: '100vh',
};

const errorWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: 120,
  background: '#1a1a1a',
  minHeight: '100vh',
};

const backBtn: React.CSSProperties = {
  border: '1px solid #6c5ce7',
  background: '#6c5ce7',
  color: '#fff',
  padding: '10px 28px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const topBar: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 100,
  background: 'rgba(20,20,20,0.92)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderBottom: '1px solid #333',
  padding: '10px 10px',
  paddingTop: 'calc(10px + env(safe-area-inset-top))',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const topBtn: React.CSSProperties = {
  border: 'none',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  width: 34,
  height: 34,
  borderRadius: 8,
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};

const iconBtn = (enabled: boolean): React.CSSProperties => ({
  border: 'none',
  background: 'rgba(255,255,255,0.12)',
  color: enabled ? '#fff' : '#666',
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: 8,
  fontSize: 22,
  lineHeight: 1,
  cursor: enabled ? 'pointer' : 'default',
  flexShrink: 0,
  padding: 0,
  boxSizing: 'border-box',
});

const topTitle: React.CSSProperties = {
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const topSub: React.CSSProperties = {
  color: '#888',
  fontSize: 12,
};

const emptyHint: React.CSSProperties = {
  textAlign: 'center',
  padding: 80,
  color: '#888',
  fontSize: 15,
};

const loadingMore: React.CSSProperties = {
  textAlign: 'center',
  padding: 20,
  color: '#666',
  fontSize: 13,
};

const bottomNav: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '0 12px 32px',
  paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
};

const navBtn: React.CSSProperties = {
  flex: 1,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#eee',
  padding: '14px 16px',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const navDisabled: React.CSSProperties = {
  opacity: 0.3,
  cursor: 'default',
};

const navArrow: React.CSSProperties = {
  fontSize: 22,
  flexShrink: 0,
};

const navTextWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
};

const navLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: '#999',
};

const navTitle: React.CSSProperties = {
  fontSize: 13,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
