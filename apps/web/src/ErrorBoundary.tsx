import React from 'react'

type EBProps = { children: React.ReactNode }
type EBState = { error: any }

export class ErrorBoundary extends React.Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: any): EBState { return { error } }
  componentDidCatch(error: any, info: any) { console.error('Render error:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="m-4 p-4 border border-red-300 rounded bg-red-50 text-red-700">
          <div className="font-semibold">렌더 중 오류가 발생했습니다.</div>
          <pre className="text-xs overflow-auto">{String(this.state.error?.stack || this.state.error)}</pre>
          <button className="mt-2 px-3 py-1 rounded border" onClick={()=>location.reload()}>새로고침</button>
        </div>
      )
    }
    return this.props.children
  }
}