import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Toast } from './BookshelfPage';

export function SettingsPage() {
  const [resourcePath, setResourcePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setResourcePath(s.resourcePath);
        setLoading(false);
      })
      .catch((e) => {
        setToast(e.message || '加载设置失败');
        setLoading(false);
      });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = async () => {
    if (!resourcePath.trim()) {
      showToast('路径不能为空');
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateSettings(resourcePath.trim());
      setResourcePath(result.resourcePath);
      showToast('设置已保存');
    } catch (e: any) {
      showToast(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: 600 }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#2d3436' }}>
          图片资源路径
        </h2>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
          封面、章节图片等本地文件的保存目录。前端通过此路径下的静态服务访问图片。
        </p>

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14, color: '#555' }}>
          资源目录绝对路径
        </label>
        <input
          type="text"
          value={resourcePath}
          onChange={(e) => setResourcePath(e.target.value)}
          placeholder="/Users/xxx/aiwork/gaga_spider/resourceFiles"
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box',
            fontFamily: 'monospace',
          }}
        />

        <div style={{ marginTop: 8, padding: '10px 14px', background: '#f8f9fa', borderRadius: 6, fontSize: 12, color: '#999' }}>
          内部结构：
          <code style={{ color: '#6c5ce7' }}>covers/</code> 封面图 |
          <code style={{ color: '#6c5ce7' }}> images/</code> 章节图片
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: 6,
              background: saving ? '#999' : '#6c5ce7',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
