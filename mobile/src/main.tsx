import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { DetailPage } from './pages/DetailPage.tsx';
import { ReaderPage } from './pages/ReaderPage.tsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'resources/:resourceId', element: <DetailPage /> },
      {
        path: 'resources/:resourceId/chapters/:chapterId',
        element: <ReaderPage />,
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
