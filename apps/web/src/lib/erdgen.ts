// apps/web/src/lib/erdgen.ts
import type { Table } from '../types'
// const newMermaid = toMermaidERD(result.tables)
const normalizeType = (t?: string) => (t || 'string').replace(/\s+/g, '_')

export function toMermaidERD(tables: Table[]): string {
  const lines: string[] = ['erDiagram']

  // 엔티티 정의
  for (const t of tables) {
    lines.push(`  ${t.name} {`)
    for (const c of (t.columns || [])) {
      const mods: string[] = []
      if (c.pk) mods.push('PK')
      if (c.fk) mods.push('FK')
      if (c.nullable === false) mods.push('NOT_NULL')
      const type = normalizeType(c.type)
      lines.push(`    ${type} ${c.name}${mods.length ? ' ' + mods.join(' ') : ''}`)
    }
    lines.push('  }')
  }

  // 관계선: FK 기반
  for (const t of tables) {
    for (const c of (t.columns || [])) {
      if (c.fk) {
        const parent = c.fk.table
        const child = t.name
        // 기본 1:N 가정
        lines.push(`  ${parent} ||--o{ ${child} : "${c.name}"`)
      }
    }
  }

  return lines.join('\n')
}