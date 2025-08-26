// apps/web/src/lib/exporters-doc.ts
import { jsPDF } from 'jspdf'
import type { AnalysisResult } from '../types'

// DOCX
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'

/** 브라우저에서 Blob 다운로드 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* =========================
 * PDF 내보내기
 * ========================= */
export async function exportPdf(
  result: AnalysisResult,
  opts?: { erdPngDataUrl?: string; filename?: string }
) {
  const { erdPngDataUrl, filename = 'AsIs_Report.pdf' } = opts || {}

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const usableW = pageW - margin * 2
  let y = margin

  const line = (text: string, step = 16) => {
    doc.text(text, margin, y)
    y += step
  }
  const h = (text: string) => {
    // ❗ jsPDF 타입에 맞춰 명시적으로 폰트 지정
    doc.setFont('helvetica', 'bold')
    line(text, 20)
    doc.setFont('helvetica', 'normal')
  }

  h('As-Is Navigator Report')
  line(new Date().toISOString(), 18)

  // Summary
  h('Summary')
  line(`Tables: ${result.tables?.length ?? 0}`)
  line(`CRUD Rows: ${result.crud_matrix?.length ?? 0}`)
  line(`Processes: ${result.processes?.length ?? 0}`)
  line(`Doc Links: ${result.doc_links?.length ?? 0}`)
  y += 8

  // ERD 이미지(있으면)
  if (erdPngDataUrl) {
    h('ERD')
    try {
      const imgW = usableW
      const imgH = Math.round((imgW * 3) / 5) // 대략 5:3 비율
      // 페이지 넘어가면 새 페이지
      if (y + imgH > pageH - margin) {
        doc.addPage()
        y = margin
      }
      doc.addImage(erdPngDataUrl as string, 'PNG', margin, y, imgW, imgH, undefined, 'FAST')
      y += imgH + 6
    } catch {
      // 이미지 실패는 무시
    }
  }

  // Tables 요약
  h('Tables')
  const tableLines: string[] = (result.tables || []).flatMap((t) => {
    const cols = (t.columns || [])
      .map((c) => {
        const bits: string[] = [c.name]
        if (c.type) bits.push(`:${c.type}`)
        if (c.pk) bits.push('[PK]')
        if (c.nullable === false) bits.push('[NOT NULL]')
        if (c.fk) bits.push(`[FK→${c.fk.table}.${c.fk.column}]`)
        return bits.join(' ')
      })
      .join(', ')
    return [`• ${t.name}`, cols ? `   ${cols}` : '   -']
  })

  for (const text of tableLines) {
    const wrapped = doc.splitTextToSize(text, usableW) as string[]
    for (const ln of wrapped) {
      if (y > pageH - margin) {
        doc.addPage()
        y = margin
      }
      line(ln)
    }
  }

  doc.save(filename)
}

/* =========================
 * DOCX 내보내기
 * ========================= */
export async function exportDocx(
  result: AnalysisResult,
  opts?: { filename?: string }
) {
  const filename = opts?.filename || 'AsIs_Report.docx'

  const paragraphs: Paragraph[] = []

  paragraphs.push(
    new Paragraph({
      text: 'As-Is Navigator Report',
      heading: HeadingLevel.TITLE,
    }),
  )
  paragraphs.push(new Paragraph({ children: [new TextRun(new Date().toISOString())] }))

  // Summary
  paragraphs.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }))
  paragraphs.push(new Paragraph(`Tables: ${result.tables?.length ?? 0}`))
  paragraphs.push(new Paragraph(`CRUD Rows: ${result.crud_matrix?.length ?? 0}`))
  paragraphs.push(new Paragraph(`Processes: ${result.processes?.length ?? 0}`))
  paragraphs.push(new Paragraph(`Doc Links: ${result.doc_links?.length ?? 0}`))

  // ERD 원문(Mermaid)
  if (result.erd_mermaid?.trim()) {
    paragraphs.push(new Paragraph({ text: 'ERD (Mermaid)', heading: HeadingLevel.HEADING_1 }))
    paragraphs.push(new Paragraph(result.erd_mermaid))
  }

  // Tables 표
  paragraphs.push(new Paragraph({ text: 'Tables', heading: HeadingLevel.HEADING_1 }))

  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph('Table')],
        width: { size: 25, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph('Columns')],
        width: { size: 75, type: WidthType.PERCENTAGE },
      }),
    ],
  })

  const dataRows: TableRow[] = (result.tables || []).map((t) => {
    const cols = (t.columns || [])
      .map((c) => {
        const bits: string[] = [c.name]
        if (c.type) bits.push(`:${c.type}`)
        if (c.pk) bits.push('[PK]')
        if (c.nullable === false) bits.push('[NOT NULL]')
        if (c.fk) bits.push(`[FK→${c.fk.table}.${c.fk.column}]`)
        return bits.join(' ')
      })
      .join(', ')
    return new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(t.name)] }),
        new TableCell({ children: [new Paragraph(cols || '-')] }),
      ],
    })
  })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...paragraphs,
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, filename)
}