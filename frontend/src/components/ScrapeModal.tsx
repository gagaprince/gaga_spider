import { useState } from 'react';

interface ScrapeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ScrapeModal({ onClose, onSuccess }: ScrapeModalProps) {
  const [titleNo, setTitleNo] = useState('');
  const [maxChapters, setMaxChapters] = useState('3');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async () => {
    const no = parseInt(titleNo, 10);
    if (!no) {
      setError('请输入有效的 title_no');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const resp = await fetch('/api/scraper/webtoons/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleNo: no,
          maxChapters: parseInt(maxChapters, 10) || 0,
        }),
      });
      if (!resp.ok) throw new Error(`抓取失败 (${resp.status})`);
      const data = await resp.json();
      setResult(data.data);
      onSuccess();
    } catch (e: any) {
      setError(e.message || '抓取出错');
    } finally {
      setLoading(false);
    }
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
          padding: 32,
          width: 480,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ marginTop: 0 }}>开启抓取任务</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Webtoons Title No
          </label>
          <input
            type="number"
            value={titleNo}
            onChange={(e) => setTitleNo(e.target.value)}
            placeholder="例如: 7709"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <p style={{ color: '#999', fontSize: 12, margin: '4px 0 0' }}>
            在 Webtoons 漫画列表页 URL 中找到 title_no 参数
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            最大章节数（0=全部）
          </label>
          <input
            type="number"
            value={maxChapters}
            onChange={(e) => setMaxChapters(e.target.value)}
            min={0}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              color: '#c0392b',
              background: '#fdf0ed',
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              color: '#27ae60',
              background: '#f0faf3',
              padding: '12px 16px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            ✅ 抓取成功！
            <br />
            漫画: {result.resource.title} (ID: {result.resource.id})
            <br />
            章节: {result.chapters.length} 章
            <br />
            图片总数: {result.chapters.reduce(
              (s: number, c: any) => s + c.imageCount,
              0,
            )}{' '}
            张
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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
            关闭
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: 6,
              background: loading ? '#999' : '#6c5ce7',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {loading ? '抓取中...' : '开始抓取'}
          </button>
        </div>
      </div>
    </div>
  );
}
