// apps/web/src/lib/exporters-doc.ts
import type { AnalysisResult, Table } from '../types'
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table as DocxTable, TableRow, TableCell } from 'docx'
import jsPDF from 'jspdf'

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function h1(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1 })
}
function h2(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 })
}
function p(text = '') {
  return new Paragraph({ children: [new TextRun(text)] })
}

function tablesToDocxTable(tables: Table[]) {
  const header = new TableRow({
    children: ['Table', 'Column', 'Type', 'PK', 'FK', 'Nullable'].map(c => new TableCell({ children: [p(c)] }))
  })
  const rows: TableRow[] = []
  tables.forEach(t => {
    t.columns.forEach((c, idx) => {
      rows.push(new TableRow({
        children: [
          new TableCell({ children: [p(idx === 0 ? t.name : '')] }),
          new TableCell({ children: [p(c.name)] }),
          new TableCell({ children: [p(c.type ?? '')] }),
          new TableCell({ children: [p(c.pk ? 'Y' : '')] }),
          new TableCell({ children: [p(c.fk ? `${c.fk.table}.${c.fk.column}` : '')] }),
          new TableCell({ children: [p(c.nullable === false ? 'N' : '')] }),
        ]
      }))
    })
  })
  return new DocxTable({ rows: [header, ...rows] })
}

function crudToDocxTable(rows: AnalysisResult['crud_matrix']) {
  const header = new TableRow({
    children: ['Process', 'Table', 'Ops'].map(c => new TableCell({ children: [p(c)] }))
  })
  const body = rows.map(r => new TableRow({
    children: [
      new TableCell({ children: [p(r.process)] }),
      new TableCell({ children: [p(r.table)] }),
      new TableCell({ children: [p((r.ops || []).join(''))] })
    ]
  }))
  return new DocxTable({ rows: [header, ...body] })
}

export async function exportDocx(result: AnalysisResult, opts?: { erdPngDataUrl?: string; filename?: string }) {
  const { erdPngDataUrl, filename = 'AsIs_Report.docx' } = opts || {}

  const children: any[] = []
  children.push(h1('As-Is Navigator Report'))
  children.push(p(new Date().toISOString()))

  // Summary
  children.push(h2('Summary'))
  children.push(p(`Tables: ${result.tables?.length ?? 0}`))
  children.push(p(`CRUD Rows: ${result.crud_matrix?.length ?? 0}`))
  children.push(p(`Processes: ${result.processes?.length ?? 0}`))
  children.push(p(`Doc Links: ${result.doc_links?.length ?? 0}`))

  // ERD (이미지)
  if (erdPngDataUrl) {
    const res = await fetch(erdPngDataUrl)
    const buf = await res.arrayBuffer()
    const image = { data: Buffer.from(buf), transformation: { width: 800 } } as any
    children.push(h2('ERD'))
    // @ts-ignore - docx new ImageRun syntax alternative (older/newer versions differ)
    children.push(new Paragraph({ children: [new (require('docx').ImageRun)({ data: image.data, transformation: image.transformation })] }))
  }

  // Tables
  children.push(h2('Tables'))
  children.push(tablesToDocxTable(result.tables || []))

  // CRUD
  children.push(h2('CRUD Matrix'))
  children.push(crudToDocxTable(result.crud_matrix || []))

  // Processes
  children.push(h2('Processes'))
  ;(result.processes || []).forEach(proc => {
    children.push(new Paragraph({ children: [new TextRun({ text: `${proc.name} — ${proc.description || ''}`, bold: true })] }))
    if (proc.children?.length) children.push(p(`children: ${proc.children.join(' > ')}`))
  })

  // Document Links
  children.push(h2('Document Links'))
  ;(result.doc_links || []).forEach(d => {
    children.push(p(`${d.doc}: "${d.snippet}" → ${d.related}`))
  })

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, filename)
}

export async function exportPdf(result: AnalysisResult, opts?: { erdPngDataUrl?: string; filename?: string }) {
  const { erdPngDataUrl, filename = 'AsIs_Report.pdf' } = opts || {}
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin

  const line = (text: string, step = 16) => { doc.text(text, margin, y); y += step }
  const h = (text: string) => { doc.setFont(undefined, 'bold'); line(text, 20); doc.setFont(undefined, 'normal') }

  h('As-Is Navigator Report')
  line(new Date().toISOString(), 18)

  h('Summary')
  line(`Tables: ${result.tables?.length ?? 0}`)
  line(`CRUD Rows: ${result.crud_matrix?.length ?? 0}`)
  line(`Processes: ${result.processes?.length ?? 0}`)
  line(`Doc Links: ${result.doc_links?.length ?? 0}`)
  y += 10

  if (erdPngDataUrl) {
    h('ERD')
    try {
      doc.addImage(erdPngDataUrl, 'PNG', margin, y, 520, 320, undefined, 'FAST')
      y += 330
    } catch { /* ignore image errors */ }
  }

  h('Tables')
  ;(result.tables || []).forEach(t => {
    line(`- ${t.name}`, 18)
    ;(t.columns || []).forEach(c => {
      line(`    • ${c.name}${c.type?`:${c.type}`:''}${c.pk?' [PK]':''}${c.nullable===false?' [NOT NULL]':''}${c.fk?` [FK→${c.fk.table}.${c.fk.column}]`:''}`)
    })
  })
  y += 10

  h('CRUD Matrix')
  ;(result.crud_matrix || []).forEach(r => line(`- ${r.process} / ${r.table} / ${r.ops?.join('')}`))
  y += 10

  h('Processes')
  ;(result.processes || []).forEach(p => line(`- ${p.name} — ${p.description || ''}${p.children?.length ? ` (children: ${p.children.join(' > ')})` : ''}`))
  y += 10

  h('Document Links')
  ;(result.doc_links || []).forEach(d => line(`- ${d.doc}: "${d.snippet}" → ${d.related}`))

  doc.save(filename)
}