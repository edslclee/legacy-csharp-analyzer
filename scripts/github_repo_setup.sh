#!/usr/bin/env bash
# GitHub repo 자동 설정 스크립트
# 사용법:
#   OWNER=your-user-or-org REPO=legacy-csharp-analyzer bash scripts/github_repo_setup.sh
#   또는:
#   bash scripts/github_repo_setup.sh --detect
# 옵션:
#   --contexts "CI / Build & Test (web+api),Another Check"
#   --team "@your-org/your-team"

set -euo pipefail

OWNER="${OWNER:-}"
REPO="${REPO:-}"
CONTEXTS="CI / Build & Test (web+api)"
TEAM_HANDLE=""
DETECT=0

# ----- (버그 수정) 인자 파싱 -----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --detect)
      DETECT=1
      shift
      ;;
    --contexts)
      CONTEXTS="$2"
      shift 2
      ;;
    --team)
      TEAM_HANDLE="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1"
      exit 1
      ;;
  esac
done
# ---------------------------------

if [[ $DETECT -eq 1 && ( -z "${OWNER}" || -z "${REPO}" ) ]]; then
  if git remote get-url origin >/dev/null 2>&1; then
    url="$(git remote get-url origin)"
    if [[ "$url" =~ github.com[:/]+([^/]+)/([^/.]+) ]]; then
      OWNER="${OWNER:-${BASH_REMATCH[1]}}"
      REPO="${REPO:-${BASH_REMATCH[2]}}"
    fi
  fi
fi

if [[ -z "${OWNER}" || -z "${REPO}" ]]; then
  echo "ERROR: OWNER/REPO를 지정하세요. 예)"
  echo "  OWNER=cheollee REPO=legacy-csharp-analyzer bash scripts/github_repo_setup.sh"
  echo "  또는 --detect 옵션 사용"
  exit 1
fi

echo "==> Target repo: ${OWNER}/${REPO}"

gh auth status >/dev/null || { echo "ERROR: gh auth login 먼저 실행하세요."; exit 1; }

echo "-- set default branch: main"
gh repo edit "${OWNER}/${REPO}" --default-branch main || true

echo "-- set merge policy: squash-only"
gh repo edit "${OWNER}/${REPO}" \
  --allow-merge-commit=false \
  --allow-rebase-merge=false \
  --allow-squash-merge=true \
  --delete-branch-on-merge=true || true

echo "-- ensure labels"
create_or_update_label () {
  local name="$1"; local color="$2"; local desc="${3:-}"
  if gh label list -R "${OWNER}/${REPO}" --search "$name" | grep -q "^$name"; then
    gh label edit "$name" -R "${OWNER}/${REPO}" --color "$color" ${desc:+--description "$desc"} >/dev/null || true
  else
    gh label create "$name" -R "${OWNER}/${REPO}" --color "$color" ${desc:+--description "$desc"} >/dev/null || true
  fi
}
create_or_update_label "bug" "d73a4a" "버그"
create_or_update_label "enhancement" "a2eeef" "기능 요청"
create_or_update_label "documentation" "0075ca" "문서"
create_or_update_label "chore" "cccccc" "유지보수"
create_or_update_label "good first issue" "7057ff" "초보자용"

echo "-- protect main branch"
IFS=',' read -ra ctx <<< "$CONTEXTS"
ctx_args=()
for c in "${ctx[@]}"; do
  c_trim="$(echo "$c" | sed 's/^ *//;s/ *$//')"
  ctx_args+=(-F "required_status_checks.contexts[]=${c_trim}")
done

if ! gh api -X PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${REPO}/branches/main/protection" \
  -F "required_pull_request_reviews.required_approving_review_count=1" \
  -F "required_pull_request_reviews.dismiss_stale_reviews=true" \
  -F "required_status_checks.strict=true" \
  "${ctx_args[@]}" \
  -F "enforce_admins=true" \
  -F "required_linear_history=true" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false" \
  -F "required_conversation_resolution=true" >/dev/null; then

  echo "form submit failed → try JSON body"
  contexts_json=$(printf '"%s",' "${ctx[@]}"); contexts_json="[${contexts_json%,}]"
  cat > /tmp/protect.json <<JSON
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "required_status_checks": {
    "strict": true,
    "contexts": ${contexts_json}
  },
  "enforce_admins": true,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
JSON
  gh api -X PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/${OWNER}/${REPO}/branches/main/protection" \
    --input /tmp/protect.json >/dev/null
fi

if [[ -n "${TEAM_HANDLE}" ]]; then
  echo "-- write CODEOWNERS"
  mkdir -p .github
  cat > .github/CODEOWNERS <<EOF
* ${TEAM_HANDLE}
apps/web/ ${TEAM_HANDLE}
apps/api/ ${TEAM_HANDLE}
EOF
  git add .github/CODEOWNERS >/dev/null 2>&1 || true
  echo "  (생성됨) .github/CODEOWNERS — 커밋 후 적용"
fi

echo "✅ Done: ${OWNER}/${REPO} configured"
echo "   Required checks: ${CONTEXTS}"