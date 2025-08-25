## 요약
-

## 변경 내용
-

## 확인 사항 (빨리 보기)
- [ ] `apps/web` 빌드 확인 (vite build)
- [ ] `apps/api` 타입체크 통과 (tsc --noEmit)
- [ ] 파일 크기 제한(5MB) 및 에러 메시지 동작 확인 (해당 시)
- [ ] UI 탭(ERD/TABLES/CRUD/PROCESS/DOCS) 기본 렌더 확인

---

## 수동 테스트 체크리스트 (PRD v1.6 기준)

### A. 환경/기본
- [ ] Node 20.x, npm 설치 버전 확인 (`node -v`, `npm -v`)
- [ ] 루트 스크립트로 동시 기동 가능 (`npm run dev`) — WEB(5173)/API(8787) 정상 실행
- [ ] API 헬스체크 응답 (`GET http://localhost:8787/health`) — 모델명 노출

### B. 업로드/인식
- [ ] **소스/스키마 업로드**: `.cs`, `.sql` 파일 각각 1개 이상 선택 시 파일명이 UI에 표시됨
- [ ] **ZIP 업로드**: `.zip` 업로드 시 내부의 `.cs`/`.sql`만 추출됨 (기존 개별 선택을 대체)
- [ ] **문서 업로드**: txt 파일 업로드 시 목록에 표시됨 (PDF/DOCX는 안내 메시지 유지)

### C. 제한/오류 처리
- [ ] **용량 제한**: 총 텍스트 5MB 초과 입력 시 서버가 413 응답 및 사용자 메시지 표시
- [ ] **빈 입력 방지**: 소스/스키마가 0개일 때 “Start Analysis” 버튼 비활성화
- [ ] **LLM 실패 처리**: API에서 비JSON/422/500 등의 실패 시 사용자에게 명확한 에러 표시
- [ ] **Mock 토글**: “API 대신 목업 데이터 사용” 활성화 시 API 에러와 무관하게 UI가 렌더됨

### D. 결과 탭(UI)
- [ ] **ERD 탭**: Mermaid ERD가 렌더됨(에러 시 원인 카드와 원본 코드 표시)
- [ ] **TABLES 탭**: 테이블/컬럼 목록이 표로 표시, PK/FK/NULL 여부 표기
- [ ] **CRUD 탭**: 프로세스–테이블–Ops(C/R/U/D) 매트릭스 표시
- [ ] **PROCESS 탭**: 프로세스 목록과 설명, children(있다면) 표기
- [ ] **DOCS 탭**: 문서–스니펫–관련 항목 리스트 표시

### E. 내보내기(다운로드)
- [ ] **result.json** 다운로드 동작
- [ ] **ERD Export**: Mermaid 코드(`erd.mmd`) 저장 가능
- [ ] **Tables CSV**: `tables.csv` 저장, 열 헤더(`table,column,type,pk,fk,nullable`)
- [ ] **CRUD CSV**: `crud.csv` 저장, `process,table,ops`
- [ ] **Doc Links CSV**: `doc_links.csv` 저장, 따옴표 이스케이프 확인

### F. 사용성/안정성
- [ ] 업로드 후 payload 추정 크기(KB) 표시
- [ ] 렌더 예외 발생 시 Error Boundary가 화면에 오류 카드로 표시
- [ ] 탭 전환 시 상태 유지 및 재렌더 오류 없음
- [ ] 브라우저 새로고침 후에도 직전 결과가 사라지는 것이 정상(세션 저장 없음)

### G. 스타일/빌드
- [ ] Tailwind v4(PostCSS 플러그인 `@tailwindcss/postcss`) 로딩 오류 없음
- [ ] `vite build` 성공 및 `dist` 생성
- [ ] 의존성 경고가 치명적 에러로 승격되지 않음

### H. 시나리오(엔드투엔드)
- [ ] **정상 플로우**: `User.cs` + `schema.sql` + `manual.txt` 업로드 → Start → 5개 탭 데이터 표시
- [ ] **ZIP 플로우**: `project.zip`(내부 .cs/.sql 포함) 업로드 → Start → 5개 탭 데이터 표시
- [ ] **오류 플로우**: 5MB 초과 더미 텍스트 업로드 → 사용자에게 한글 오류 메시지 출력
- [ ] **LLM 오류 플로우**: API를 임시로 죽이거나 키 제거 → Mock 토글 ON → UI 정상 확인

---

## 스크린샷/증빙 (선택)
- [ ] ERD 탭 (성공/실패 카드)
- [ ] TABLES/CRUD/PROCESS/DOCS 탭
- [ ] 다운로드 파일(로컬에 생성된 파일 목록)

## 관련 이슈
Closes #
