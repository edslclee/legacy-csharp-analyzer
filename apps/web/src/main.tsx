// apps/web/src/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary as RootErrorBoundary } from './ErrorBoundary'
import App from './App'
import './App.css'
import './index.css'

// React Query 클라이언트 (기본 옵션 약하게 설정)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

// #root 엘리먼트 필수 (index.html에 있어야 함)
const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element (#root) not found in index.html')
}

const root = createRoot(container)

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
)

// 디버깅 편의: 브라우저 콘솔에서 window.queryClient 사용 가능
// @ts-expect-error - dev helper
window.queryClient = queryClient