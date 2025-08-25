// apps/web/src/types.ts

// 업로드된 파일의 표준 타입 (프론트 전역에서 공통 사용)
export type IngestedType = 'cs' | 'sql' | 'doc'

export type Ingested = {
  name: string           // 파일명 (zip 내부 경로 포함 가능)
  type: IngestedType     // 'cs' | 'sql' | 'doc'
  content: string        // 텍스트 내용
}

// (이미 있다면 유지) 다른 타입들
export type TableCol = {
  name: string
  type?: string
  pk?: boolean
  fk?: { table: string; column: string }
  nullable?: boolean
}
export type Table = { name: string; columns: TableCol[] }
export type CrudRow = { process: string; table: string; ops: Array<'C'|'R'|'U'|'D'> }
export type Proc = { name: string; description?: string; children?: string[] }
export type DocLink = { doc: string; snippet: string; related: string }

export type AnalysisResult = {
  tables: Table[]
  erd_mermaid: string
  crud_matrix: CrudRow[]
  processes: Proc[]
  doc_links: DocLink[]
}