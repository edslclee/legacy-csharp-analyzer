// apps/web/src/lib/erd.ts
import type { AnalysisResult } from '../types';

type Table = NonNullable<AnalysisResult['tables']>[number];

function safeName(s: string) {
  // Mermaid ERD 식별자는 공백/특수문자에 민감해서 간단히 정리
  return String(s || '').replace(/\W+/g, '_');
}
function fmtType(t?: string) {
  if (!t) return '';
  // VARCHAR(100) -> VARCHAR(100)
  return t.toUpperCase().replace(/\s+/g, '');
}

export function buildMermaidERD(tables: Table[] = []): string {
  const lines: string[] = [];
  lines.push('erDiagram');

  // 1) 엔티티 블록
  for (const t of tables) {
    const tName = safeName(t.name);
    lines.push(`  ${tName} {`);
    for (const c of t.columns || []) {
      const flags: string[] = [];
      if (c.pk) flags.push('PK');
      if (c.fk) flags.push('FK');
      if (c.nullable === false) flags.push('NOT_NULL');

      const typ = fmtType(c.type);
      const typOrAny = typ || 'ANY';
      const colName = safeName(c.name);
      lines.push(`    ${typOrAny} ${colName}${flags.length ? ' ' + flags.join(' ') : ''}`);
    }
    lines.push('  }');
  }

  // 2) 관계 (FK 기준)
  // Mermaid 관계: Parent ||--o{ Child : "has"
  // 여기서는 기본적으로 부모=참조대상(FK.table), 자식=현재 테이블
  const relSet = new Set<string>();
  for (const t of tables) {
    const child = safeName(t.name);
    for (const c of t.columns || []) {
      if (c.fk?.table) {
        const parent = safeName(c.fk.table);
        const key = `${parent}->${child}`;
        if (!relSet.has(key)) {
          relSet.add(key);
          lines.push(`  ${parent} ||--o{ ${child} : has`);
        }
      }
    }
  }

  return lines.join('\n');
}

/** 간단 유효성 체크: 최소 문법 요소가 있는지 */
export function isLikelyValidMermaid(code?: string) {
  if (!code) return false;
  const s = code.trim();
  if (!s.startsWith('erDiagram')) return false;
  // 블록 또는 관계 중 하나라도 있어야 유효로 간주
  return /\{\s*[\s\S]*\}/.test(s) || /\s\|\|--o\{\s/.test(s);
}