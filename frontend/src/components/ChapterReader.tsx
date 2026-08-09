import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface ChapterImageItem {
  id: number;
  orderIndex: number;
  sourceUrl: string;
  localPath: string | null;
  status: string;
}

interface ChapterData {
  id: number;
  resourceId: number;
  orderIndex: number;
  title: string;
  pageCount: number;
  isDownloaded: number;
  images: ChapterImageItem[];
  prevChapter: { id: number; orderIndex: number; title: string } | null;
  nextChapter: { id: number; orderIndex: number; title: string } | null;
}

export function ChapterReader() {
  const { chapterId: chapterIdStr, resourceId } = useParams<{ chapterId: string; resourceId: string }>();
  const chapterId = Number(chapterIdStr);
  const navigate = useNavigate();
  const [data, setData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  const loadingRef = useRef<number | null>(null);

  const loadChapter = useCallback((id: number) => {
    setLoading(true);
    setError('');
    setVisibleCount(10);
    window.scrollTo({ top: 0 });
    api
      .getChapterImages(id)
      .then((d) => {
        if (!d) {
          setError('未找到该章节');
          setData(null);
        } else {
          // 去重: 同一 orderIndex 只保留一条
          const seen = new Set<number>();
          const deduped = d.images.filter((img) => {
            if (seen.has(img.orderIndex)) return false;
            seen.add(img.orderIndex);
            return true;
          });
          setData({ ...d, images: deduped });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!chapterId) return;
    // 防止 StrictMode 双重调用导致重复请求
    if (loadingRef.current === chapterId) return;
    loadingRef.current = chapterId;
    loadChapter(chapterId);
  }, [chapterId, loadChapter]);

  // lazy load: reveal more images as user scrolls near bottom
  useEffect(() => {
    const handleScroll = () => {
      if (!data) return;
      const scrollBottom =
        window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (docHeight - scrollBottom < 800 && visibleCount < data.images.length) {
        setVisibleCount((c) => Math.min(c + 5, data.images.length));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [data, visibleCount]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 120, color: '#999', fontSize: 15 }}>
        加载中...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <div style={{ color: '#e74c3c', marginBottom: 16 }}>{error || '未找到章节'}</div>
        <button onClick={() => navigate(-1)} style={btnStyle}>返回</button>
      </div>
    );
  }

  const downloadedImages = data.images.filter((img) => img.localPath);
  const hasImages = downloadedImages.length > 0;

  return (
    <div style={{ background: '#1a1a1a', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(20,20,20,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #333',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button onClick={() => navigate(-1)} style={topBtnStyle}>
          ← 返回
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            #{data.orderIndex} {data.title}
          </div>
          <div style={{ color: '#888', fontSize: 12 }}>
            {downloadedImages.length}/{data.images.length} 张图片
          </div>
        </div>
      </div>

      {/* Images - seamless vertical scroll */}
      {!hasImages && (
        <div
          style={{
            textAlign: 'center',
            padding: 80,
            color: '#888',
            fontSize: 15,
          }}
        >
          该章节暂无本地图片，请先抓取
        </div>
      )}

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 0 60px' }}>
        {downloadedImages.slice(0, visibleCount).map((img) => (
          <img
            key={img.id}
            src={img.localPath!}
            alt={`第 ${img.orderIndex} 页`}
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
            }}
          />
        ))}

        {/* loading indicator at bottom while lazy loading */}
        {visibleCount < downloadedImages.length && (
          <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 13 }}>
            加载更多...
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto 40px',
          padding: '0 20px',
          display: 'flex',
          gap: 12,
        }}
      >
        {data.prevChapter ? (
          <button
            onClick={() => navigate(`/resources/${resourceId}/chapters/${data.prevChapter!.id}`)}
            style={{ ...navBtnStyle, flex: 1 }}
          >
            ← 上一章
            <span style={navSubStyle}>{data.prevChapter.title}</span>
          </button>
        ) : (
          <div style={{ ...navBtnStyle, flex: 1, opacity: 0.3, cursor: 'default' }}>
            ← 上一章
            <span style={navSubStyle}>已是第一章</span>
          </div>
        )}
        {data.nextChapter ? (
          <button
            onClick={() => navigate(`/resources/${resourceId}/chapters/${data.nextChapter!.id}`)}
            style={{ ...navBtnStyle, flex: 1, textAlign: 'right' }}
          >
            下一章 →
            <span style={navSubStyle}>{data.nextChapter.title}</span>
          </button>
        ) : (
          <div style={{ ...navBtnStyle, flex: 1, opacity: 0.3, cursor: 'default', textAlign: 'right' }}>
            下一章 →
            <span style={navSubStyle}>已是最后一章</span>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  border: '1px solid #6c5ce7',
  background: '#6c5ce7',
  color: '#fff',
  padding: '8px 24px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const topBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'rgba(255,255,255,0.1)',
  color: '#fff',
  padding: '6px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#eee',
  padding: '14px 20px',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 600,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-start',
};

const navSubStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: '#999',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};
