// apps/web/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 간단한 전역 ErrorBoundary (초기 렌더 에러도 포착)
class RootErrorBoundary extends React.Component<{children: React.ReactNode}, {error?: any}> {
  constructor(props:any){ super(props); this.state = { error: undefined } }
  static getDerivedStateFromError(error:any){ return { error } }
  componentDidCatch(err:any, info:any){ console.error('Root boundary:', err, info) }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:16, background:'#fee', color:'#900', whiteSpace:'pre-wrap'}}>
          <b>App crashed during render.</b>
          {'\n'}{String(this.state.error?.stack || this.state.error)}
        </div>
      )
    }
    return this.props.children
  }
}

const qc = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
)