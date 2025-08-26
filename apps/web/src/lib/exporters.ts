// apps/web/src/lib/exporters.ts
import type { AnalysisResult } from '../types'

// ---------- 공통 유틸 ----------
const S = (v: unknown): string => (v == null ? '' : String(v))

function saveBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(v: unknown): string {
  let s = S(v)
  // 양끝 공백, 줄바꿈, 콤마, 따옴표 포함 시 인용 + 내부 따옴표 이스케이프
  if (/^\s|\s$/.test(s) || /[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowsToCSV(rows: Array<Array<unknown>>): string {
  const headerBOM = '\ufeff' // Excel 호환을 위한 UTF-8 BOM
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\r\n')
  return headerBOM + body + '\r\n'
}

// ---------- 텍스트 / JSON 다운로드 ----------
export function downloadText(text: string, filename = 'export.txt') {
  const blob = new Blob([S(text)], { type: 'text/plain;charset=utf-8' })
  saveBlob(blob, filename)
}

export function downloadJSON(data: unknown, filename = 'export.json') {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  saveBlob(blob, filename)
}

// ---------- CSV: Tables ----------
export function downloadTablesCSV(tables: AnalysisResult['tables'] | undefined, filename = 'tables.csv') {
  const rows: Array<Array<unknown>> = []
  rows.push(['table', 'column', 'type', 'pk', 'nullable', 'fk_table', 'fk_column'])

  if (tables?.length) {
    for (const t of tables) {
      const cols = t.columns ?? []
      if (cols.length === 0) {
        rows.push([t.name, '', '', '', '', '', ''])
        continue
      }
      for (const c of cols) {
        rows.push([
          t.name,
          c.name ?? '',
          c.type ?? '',
          c.pk ? 'Y' : '',
          c.nullable === false ? 'NO' : (c.nullable === true ? 'YES' : ''),
          c.fk?.table ?? '',
          c.fk?.column ?? ''
        ])
      }
    }
  }

  const csv = rowsToCSV(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  saveBlob(blob, filename)
}

// ---------- CSV: CRUD Matrix ----------
export function downloadCrudCSV(crud: AnalysisResult['crud_matrix'] | undefined, filename = 'crud.csv') {
  const rows: Array<Array<unknown>> = []
  rows.push(['process', 'table', 'ops'])

  if (crud?.length) {
    for (const r of crud) {
      rows.push([
        r.process ?? '',
        r.table ?? '',
        Array.isArray(r.ops) ? r.ops.join('') : ''
      ])
    }
  }

  const csv = rowsToCSV(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  saveBlob(blob, filename)
}

// ---------- CSV: Document Links ----------
export function downloadDocLinksCSV(docLinks: AnalysisResult['doc_links'] | undefined, filename = 'doc_links.csv') {
  const rows: Array<Array<unknown>> = []
  rows.push(['doc', 'snippet', 'related'])

  if (docLinks?.length) {
    for (const d of docLinks) {
      rows.push([d.doc ?? '', d.snippet ?? '', d.related ?? ''])
    }
  }

  const csv = rowsToCSV(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  saveBlob(blob, filename)
}