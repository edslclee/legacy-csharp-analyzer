import type { AnalysisResult, Table } from '../types'

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  downloadBlob(blob, filename)
}

export function downloadTablesCSV(tables: Table[], filename = 'tables.csv') {
  const lines = ['table,column,type,pk,fk,nullable']
  tables.forEach(t => {
    t.columns.forEach(c => {
      lines.push([
        t.name,
        c.name,
        c.type ?? '',
        c.pk ? 'Y' : '',
        c.fk ? `${c.fk.table}.${c.fk.column}` : '',
        c.nullable === false ? 'N' : ''
      ].join(','))
    })
  })
  downloadText(lines.join('\n'), filename)
}

export function downloadCrudCSV(rows: AnalysisResult['crud_matrix'], filename = 'crud.csv') {
  const lines = ['process,table,ops']
  rows.forEach(r => {
    lines.push([r.process, r.table, r.ops.join('')].join(','))
  })
  downloadText(lines.join('\n'), filename)
}

export function downloadDocLinksCSV(rows: AnalysisResult['doc_links'], filename = 'doc_links.csv') {
  const header = ['doc','snippet','related']
  const escape = (s: string) => `"${(s||'').replace(/"/g,'""')}"`
  const lines = [header.join(',')]
  rows.forEach(r => {
    lines.push([escape(r.doc), escape(r.snippet), escape(r.related)].join(','))
  })
  downloadText(lines.join('\n'), filename)
}