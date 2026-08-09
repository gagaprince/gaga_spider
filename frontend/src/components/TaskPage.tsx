import { useEffect, useState, useCallback } from 'react';
import { api, type TaskItem } from '../api/client';
import { Toast } from './BookshelfPage';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '等待中', color: '#f39c12', bg: '#fef9e7' },
  running: { label: '运行中', color: '#6c5ce7', bg: '#eef2ff' },
  success: { label: '成功', color: '#27ae60', bg: '#f0faf3' },
  failed: { label: '失败', color: '#e74c3c', bg: '#fdf0ef' },
  cancelled: { label: '已停止', color: '#7f8c8d', bg: '#f4f4f4' },
};

const taskTypeLabels: Record<string, string> = {
  discover: '发现',
  full: '全量',
  incremental: '增量',
  refresh: '刷新',
};

export function TaskPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const pageSize = 20;

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.getTasks({
        status: filterStatus || undefined,
        page,
        pageSize,
      });
      setTasks(resp.items);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto refresh when there are running tasks
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running' || t.status === 'pending');
    if (!hasRunning) return;
    const timer = setInterval(() => fetchTasks(), 3000);
    return () => clearInterval(timer);
  }, [tasks, fetchTasks]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleStop = async (id: number) => {
    try {
      await api.stopTask(id);
      showToast('任务已标记停止');
      fetchTasks();
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await api.retryTask(id);
      showToast('任务已重新创建');
      fetchTasks();
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此任务记录？')) return;
    try {
      await api.deleteTask(id);
      showToast('任务已删除');
      fetchTasks();
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ padding: '16px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, background: '#fff' }}
        >
          <option value="">全部状态</option>
          <option value="running">运行中</option>
          <option value="pending">等待中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已停止</option>
        </select>
        <span style={{ color: '#888', fontSize: 14 }}>共 {total} 条任务</span>
      </div>

      {/* Table */}
      <div style={{ padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>加载中...</div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#999', fontSize: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <p>暂无任务记录</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>漫画</th>
                  <th style={thStyle}>类型</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>进度</th>
                  <th style={thStyle}>创建时间</th>
                  <th style={thStyle}>错误信息</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const cfg = statusConfig[t.status] || statusConfig.pending;
                  const isRunning = t.status === 'running' || t.status === 'pending';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={tdStyle}>{t.id}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#2d3436' }}>
                        {t.resource?.title || '-'}
                      </td>
                      <td style={tdStyle}>{taskTypeLabels[t.taskType] || t.taskType}</td>
                      <td style={tdStyle}>
                        <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                          {isRunning && <span style={{ marginRight: 4 }}>●</span>}
                          {cfg.label}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {t.totalItems > 0 ? `${t.doneItems}/${t.totalItems}` : '-'}
                      </td>
                      <td style={{ ...tdStyle, color: '#999', fontSize: 12 }}>
                        {formatDate(t.createdAt)}
                      </td>
                      <td style={{ ...tdStyle, color: '#e74c3c', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.errorMessage || '-'}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isRunning && (
                            <button onClick={() => handleStop(t.id)} style={actionBtnStyle('#e67e22', '#fef9f3')}>
                              停止
                            </button>
                          )}
                          {(t.status === 'failed' || t.status === 'cancelled' || t.status === 'success') && (
                            <button onClick={() => handleRetry(t.id)} style={actionBtnStyle('#3498db', '#ebf5fb')}>
                              重试
                            </button>
                          )}
                          <button onClick={() => handleDelete(t.id)} style={actionBtnStyle('#e74c3c', '#fdf0ef')}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>上一页</button>
            <span style={{ padding: '8px 16px', color: '#666' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>下一页</button>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', color: '#555' };

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return { padding: '8px 16px', border: '1px solid #ddd', borderRadius: 6, background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#ccc' : '#333', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14 };
}

function actionBtnStyle(color: string, bg: string): React.CSSProperties {
  return { padding: '4px 12px', border: `1px solid ${color}33`, borderRadius: 4, background: bg, color, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
}
