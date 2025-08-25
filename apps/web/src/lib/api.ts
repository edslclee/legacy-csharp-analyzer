
import type { AnalysisResult, Ingested } from '../types'

const API_BASE = 'http://localhost:8787'

export async function analyze(files: Ingested[]): Promise<AnalysisResult> {
  const r = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ files })
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.message || err.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export async function health(): Promise<any> {
  const r = await fetch(`${API_BASE}/health`)
  return r.json()
}