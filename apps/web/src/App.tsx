// apps/web/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { analyze, health } from './lib/api'
import { readFiles, estimateBytes } from './lib/fileingest'
import { Tabs } from './components/Tabs'
import type { TabKey } from './components/Tabs'
import type { AnalysisResult, Ingested } from './types'
import { downloadJSON, downloadTablesCSV, downloadCrudCSV, downloadDocLinksCSV, downloadText } from './lib/exporters'
import { buildMermaidERD, isLikelyValidMermaid } from './lib/erd'

/** ===== Error Boundary: 렌더 예외를 UI로 보여줌 ===== */
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: any}> {
  constructor(props:any){ super(props); this.state = { error: null } }
  static getDerivedStateFromError(error:any){ return { error } }
  componentDidCatch(error:any, info:any){ console.error('Render error:', error, info) }
  render(){
    // @ts-ignore
    if (this.state.error) {
      // @ts-ignore
      const err = this.state.error
      return (
        <div className="m-4 p-4 border border-red-300 rounded bg-red-50 text-red-700">
          <div className="font-semibold">렌더 중 오류가 발생했습니다.</div>
          <pre className="text-xs overflow-auto">{String(err?.stack || err)}</pre>
          <button className="mt-2 px-3 py-1 rounded border" onClick={()=>location.reload()}>새로고침</button>
        </div>
      )
    }
    // @ts-ignore
    return this.props.children
  }
}

/** ===== 안전한 Mermaid 렌더러: 동적 import + 예외 처리 ===== */
function SafeMermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setErr(null)
      try {
        if (!code?.trim()) return
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })
        const id = 'erd-' + Math.random().toString(36).slice(2)
        const { svg } = await mermaid.render(id, code)
        if (!cancel && ref.current) ref.current.innerHTML = svg
      } catch (e:any) {
        console.error('Mermaid render error', e)
        if (!cancel) setErr(e?.message || 'Mermaid 렌더 오류')
      }
    })()
    return () => { cancel = true }
  }, [code])

  if (err) {
    return (
      <div className="p-3 border border-yellow-300 rounded bg-yellow-50 text-yellow-800">
        <div className="font-semibold">ERD 렌더 실패</div>
        <div className="text-xs">{err}</div>
        <details className="text-xs mt-2">
          <summary>원본 코드 보기</summary>
          <pre className="overflow-auto">{code}</pre>
        </details>
      </div>
    )
  }
  return <div ref={ref} className="border rounded-xl p-4 bg-white overflow-auto" />
}

/** ===== 메인 앱 ===== */
export default function App() {
  const [srcFiles, setSrcFiles] = useState<File[]>([])
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [tab, setTab] = useState<TabKey>('ERD')
  const [payloadPreview, setPayloadPreview] = useState<Ingested[]>([])
  const [useMock, setUseMock] = useState(false) // API 실패 시 목업 보기 토글

  const { data: healthInfo } = useQuery({ queryKey: ['health'], queryFn: health })

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: async () => {
      const src = await readFiles(srcFiles, ['cs','sql'])
      const docs = await readFiles(docFiles, ['doc'])
      const files = [...src, ...docs]
      setPayloadPreview(files)
      if (useMock) return mockResult as AnalysisResult
      return await analyze(files)
    }
  })

  // API 실패 시에도 화면 유지 + 목업 보기 버튼 제공
  const result: AnalysisResult | null = data ?? (useMock ? mockResult : null)

  const disabled = useMemo(() => srcFiles.length === 0 && !useMock, [srcFiles.length, useMock])
  const approxBytes = useMemo(() => estimateBytes(payloadPreview), [payloadPreview])

  // === ERD 코드 선택: 서버 코드가 유효하지 않으면 테이블 기반 대체 코드 사용 ===
  const erdCode = useMemo(() => {
    if (!result) return ''
    return isLikelyValidMermaid(result.erd_mermaid)
      ? String(result.erd_mermaid)
      : buildMermaidERD(result.tables || [])
  }, [result])

  return (
    <ErrorBoundary>
      <div className="min-h-screen p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">As-Is Navigator (Prototype)</h1>
          <div className="text-sm text-zinc-600">
            API: <span className="font-mono">{healthInfo?.model ?? '...'}</span>
          </div>
        </header>

        {/* 업로드 영역 */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-xl p-4 bg-white">
            <h2 className="font-semibold mb-2">Source / Schema (.cs, .sql, .zip)</h2>
            <input type="file" multiple onChange={(e)=> setSrcFiles(Array.from(e.target.files||[]))}/>
            <p className="text-xs text-zinc-500 mt-1">* Zip 내부 .cs/.sql만 추출. 총 5MB 제한(서버 검증).</p>
            {srcFiles.length>0 && <p className="text-xs text-zinc-700 mt-2">선택: {srcFiles.map(f=>f.name).join(', ')}</p>}
          </div>
          <div className="border rounded-xl p-4 bg-white">
            <h2 className="font-semibold mb-2">Documentation (txt 권장)</h2>
            <input type="file" multiple onChange={(e)=> setDocFiles(Array.from(e.target.files||[]))}/>
            <p className="text-xs text-zinc-500 mt-1">* PDF/DOCX는 후속 Iteration에서 텍스트 추출 지원 예정.</p>
            {docFiles.length>0 && <p className="text-xs text-zinc-700 mt-2">선택: {docFiles.map(f=>f.name).join(', ')}</p>}
          </div>
        </section>

        {/* 제어 버튼들 */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="px-4 py-2 rounded-xl bg-black text-white disabled:bg-zinc-400"
            disabled={disabled || isPending}
            onClick={()=> mutate()}
          >
            {isPending ? 'Analyzing...' : (useMock ? 'Show Mock' : 'Start Analysis')}
          </button>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useMock} onChange={(e)=> setUseMock(e.target.checked)} />
            API 대신 목업 데이터 사용
          </label>

          {payloadPreview.length>0 && (
            <span className="text-xs text-zinc-600">
              payload ~ {Math.ceil(approxBytes/1024)} KB
            </span>
          )}

          {error && (
            <span className="text-sm text-red-600">
              {String((error as Error).message || error)} — 위 “API 대신 목업 데이터 사용”을 켜고 UI부터 확인하세요.
            </span>
          )}
        </div>

        {/* 결과 */}
        {result && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Tabs active={tab} onChange={setTab} />

              {/* 다운로드 버튼들 */}
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  className="px-3 py-1 rounded border"
                  onClick={()=> downloadJSON(result, 'result.json')}
                >Download result.json</button>

                {tab === 'ERD' && (
                  <>
                    <button
                      className="px-3 py-1 rounded border"
                      onClick={()=>{
                        // 화면에 사용하는 것과 동일한 코드로 내보내기
                        const codeForDownload = erdCode || ''
                        downloadText(codeForDownload, 'erd.mmd')
                      }}
                    >Export Mermaid</button>
                  </>
                )}
                {tab === 'TABLES' && (
                  <button className="px-3 py-1 rounded border" onClick={()=> downloadTablesCSV(result.tables || [])}>Export CSV</button>
                )}
                {tab === 'CRUD' && (
                  <button className="px-3 py-1 rounded border" onClick={()=> downloadCrudCSV(result.crud_matrix || [])}>Export CSV</button>
                )}
                {tab === 'PROCESS' && (
                  <button className="px-3 py-1 rounded border" onClick={()=> downloadJSON(result.processes || [], 'processes.json')}>Export JSON</button>
                )}
                {tab === 'DOCS' && (
                  <button className="px-3 py-1 rounded border" onClick={()=> downloadDocLinksCSV(result.doc_links || [])}>Export CSV</button>
                )}
              </div>
            </div>

            {/* 탭 내용 (필드가 없거나 빈 배열이어도 안전 렌더) */}
            {tab==='ERD' && <SafeMermaid code={erdCode} />}

            {tab==='TABLES' && (
              <div className="border rounded-xl p-4 bg-white overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-left p-2">Table</th><th className="text-left p-2">Columns</th></tr></thead>
                  <tbody>
                    {(result.tables || []).map(t=>(
                      <tr key={t.name} className="align-top border-t">
                        <td className="p-2 font-medium">{t.name}</td>
                        <td className="p-2">
                          <ul className="list-disc ml-5">
                            {(t.columns || []).map(c=>(
                              <li key={c.name}>
                                {c.name}{c.type?`:${c.type}`:''}
                                {c.pk?' [PK]':''}{c.nullable===false?' [NOT NULL]':''}
                                {c.fk?` [FK→${c.fk.table}.${c.fk.column}]`:''}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                    {(!result.tables || result.tables.length===0) && (
                      <tr><td className="p-2" colSpan={2}>표시할 테이블이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab==='CRUD' && (
              <div className="border rounded-xl p-4 bg-white overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-left p-2">Process</th><th className="text-left p-2">Table</th><th className="p-2">Ops</th></tr></thead>
                  <tbody>
                    {(result.crud_matrix || []).map((r,i)=>(
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.process}</td>
                        <td className="p-2">{r.table}</td>
                        <td className="p-2">{(r.ops||[]).join(', ')}</td>
                      </tr>
                    ))}
                    {(!result.crud_matrix || result.crud_matrix.length===0) && (
                      <tr><td className="p-2" colSpan={3}>표시할 CRUD 항목이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab==='PROCESS' && (
              <div className="border rounded-xl p-4 bg-white overflow-auto">
                <ul className="list-disc ml-5">
                  {(result.processes || []).map(p=>(
                    <li key={p.name} className="mb-2">
                      <span className="font-medium">{p.name}</span> — {p.description||''}
                      {p.children?.length ? <div className="text-xs text-zinc-600">children: {p.children.join(' > ')}</div> : null}
                    </li>
                  ))}
                  {(!result.processes || result.processes.length===0) && (
                    <li className="text-sm text-zinc-600">표시할 프로세스가 없습니다.</li>
                  )}
                </ul>
              </div>
            )}

            {tab==='DOCS' && (
              <div className="border rounded-xl p-4 bg-white overflow-auto">
                <ul className="list-disc ml-5">
                  {(result.doc_links || []).map((d,i)=>(
                    <li key={i} className="mb-1"><b>{d.doc}</b>: “{d.snippet}” → {d.related}</li>
                  ))}
                  {(!result.doc_links || result.doc_links.length===0) && (
                    <li className="text-sm text-zinc-600">문서 매핑 결과가 없습니다.</li>
                  )}
                </ul>
              </div>
            )}

            <footer className="text-xs text-zinc-500 pt-2">Generated by As-Is Navigator</footer>
          </section>
        )}

        {!result && !isPending && !error && (
          <p className="text-sm text-zinc-600">파일을 업로드하고 “Start Analysis”를 눌러 결과를 확인하세요.</p>
        )}
      </div>
    </ErrorBoundary>
  )
}

/** ===== 최소 목업 데이터 (API 실패 시 UI 확인용) ===== */
const mockResult: AnalysisResult = {
  tables: [
    { name: 'Users', columns: [
      { name: 'Id', type: 'int', pk: true, nullable: false },
      { name: 'Name', type: 'varchar(100)' }
    ]},
    { name: 'Orders', columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'UserId', type: 'int', fk: { table: 'Users', column: 'Id' } }
    ]},
  ],
  erd_mermaid: `erDiagram
  Users ||--o{ Orders : has
  Users {
    int Id PK
    varchar Name
  }
  Orders {
    int Id PK
    int UserId FK
  }`,
  crud_matrix: [
    { process: 'UserManage', table: 'Users', ops: ['C','R','U','D'] },
    { process: 'OrderManage', table: 'Orders', ops: ['C','R','U','D'] }
  ],
  processes: [
    { name: 'UserManage', description: '사용자 등록/조회/수정/삭제' },
    { name: 'OrderManage', description: '주문 등록/조회/수정/삭제', children: ['Create','List','Edit','Delete'] }
  ],
  doc_links: [
    { doc: 'manual.txt', snippet: 'Users can be created and edited...', related: 'Users' }
  ]
}