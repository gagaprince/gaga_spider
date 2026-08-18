import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { BookshelfPage } from './components/BookshelfPage'
import { MyBookshelfPage } from './components/MyBookshelfPage'
import { TaskPage } from './components/TaskPage'
import { SettingsPage } from './components/SettingsPage'
import { ResourceDetail } from './components/ResourceDetail'
import { ChapterReader } from './components/ChapterReader'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <BookshelfPage /> },
      { path: 'my-bookshelf', element: <MyBookshelfPage /> },
      { path: 'tasks', element: <TaskPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'resources/:resourceId', element: <ResourceDetail /> },
      { path: 'resources/:resourceId/chapters/:chapterId', element: <ChapterReader /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
