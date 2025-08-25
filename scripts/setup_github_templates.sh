# save as: scripts/setup_github_templates.sh
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
echo "Repo root: $ROOT"

mkdir -p .github/ISSUE_TEMPLATE

# --- PR 템플릿 ---
cat > .github/pull_request_template.md <<'PR'
## 요약
-

## 변경 내용
-

## 확인 사항
- [ ] `apps/web` 빌드 확인 (vite build)
- [ ] `apps/api` 타입체크 통과 (tsc --noEmit)
- [ ] 파일 크기 제한(5MB) 및 에러 메시지 동작 확인 (해당 시)
- [ ] UI 탭(ERD/TABLES/CRUD/PROCESS/DOCS) 기본 렌더 확인

## 관련 이슈
Closes #
PR

# --- 이슈 템플릿: Bug ---
cat > .github/ISSUE_TEMPLATE/bug_report.md <<'BUG'
---
name: Bug report
about: 버그 제보
title: "[Bug] "
labels: ["bug"]
assignees: []
---

### 버그 설명
-

### 재현 방법
1. 
2. 

### 기대 동작
-

### 스크린샷/로그
-

### 환경
- OS:
- 브라우저/버전:
BUG

# --- 이슈 템플릿: Feature ---
cat > .github/ISSUE_TEMPLATE/feature_request.md <<'FEAT'
---
name: Feature request
about: 기능 제안
title: "[Feature] "
labels: ["enhancement"]
assignees: []
---

### 제안 배경 / 문제
-

### 요구 사항
-

### 수용 기준 (Acceptance Criteria)
- [ ]
- [ ]
FEAT

# --- (선택) 이슈 템플릿 설정 파일: 새 이슈 페이지에 템플릿 선택 UI 노출 ---
cat > .github/ISSUE_TEMPLATE/config.yml <<'CFG'
blank_issues_enabled: false
contact_links:
  - name: Q&A / 사용 방법
    url: https://github.com/OWNER/REPO/discussions
    about: 사용 중 질문은 Discussions 탭을 사용해주세요.
CFG

# --- Dependabot 설정 ---
cat > .github/dependabot.yml <<'DEP'
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "npm"
    directory: "/apps/web"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/apps/api"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
DEP

# --- (선택) CODEOWNERS: 팀/리뷰어 지정 원하면 수정 ---
if [ ! -f .github/CODEOWNERS ]; then
  cat > .github/CODEOWNERS <<'OWN'
# 전체 리포지토리
# * @your-org/your-team
# 프런트엔드
# /apps/web/ @your-frontend-reviewer
# 백엔드
# /apps/api/ @your-backend-reviewer
OWN
fi

# --- (선택) main 직접 push 경고 워크플로우 (보호 규칙 대안) ---
mkdir -p .github/workflows
cat > .github/workflows/guard-main.yml <<'YML'
name: Guard Main
on:
  push:
    branches: [ main ]
jobs:
  block_direct_push:
    runs-on: ubuntu-latest
    steps:
      - name: Fail if direct push to main
        run: |
          echo "Direct push to main detected. Please use PR."
          exit 1
YML

echo "✅ Files created/updated under .github/"
git add .github || true
git commit -m "chore: add PR/Issue templates, Dependabot, guard-main workflow" || echo "No changes to commit."
echo "👉 이제 'git push' 하시면 적용됩니다."