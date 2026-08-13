import { Outlet, useLocation, useNavigate } from 'react-router-dom';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const inReader = location.pathname.includes('/chapters/');

  // 阅读器全屏, 不显示顶部栏
  if (inReader) {
    return <Outlet />;
  }

  const inDetail = location.pathname.startsWith('/resources/');

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {inDetail && (
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            background: '#fff',
            borderBottom: '1px solid #eee',
            padding: '10px 12px',
            paddingTop: 'calc(10px + env(safe-area-inset-top))',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            aria-label="返回"
            style={{
              border: 'none',
              background: 'none',
              fontSize: 22,
              color: '#6c5ce7',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: 16, fontWeight: 700 }}>详情</span>
        </header>
      )}
      <Outlet />
    </div>
  );
}

export default App;
