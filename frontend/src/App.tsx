import { useState } from 'react';
import { BookshelfPage } from './components/BookshelfPage';
import { TaskPage } from './components/TaskPage';
import { SettingsPage } from './components/SettingsPage';

type PageId = 'bookshelf' | 'tasks' | 'settings';

const menuItems: { id: PageId; label: string; icon: string }[] = [
  { id: 'bookshelf', label: '书架管理', icon: '📚' },
  { id: 'tasks', label: '任务管理', icon: '📋' },
  { id: 'settings', label: '设置', icon: '⚙️' },
];

function App() {
  const [activePage, setActivePage] = useState<PageId>('bookshelf');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f6fa' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: '#2d3436',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '24px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ fontSize: 24 }}>🕷️</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Gaga Spider</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>资源管理系统</div>
          </div>
        </div>

        {/* Menu */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {menuItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: active ? '#6c5ce7' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  marginBottom: 4,
                  transition: 'all 0.2s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header
          style={{
            background: '#fff',
            borderBottom: '1px solid #e8e8e8',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: '#2d3436',
            }}
          >
            {menuItems.find((m) => m.id === activePage)?.label}
          </h1>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {activePage === 'bookshelf' && <BookshelfPage />}
          {activePage === 'tasks' && <TaskPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

export default App;
