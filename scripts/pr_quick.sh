# save as: scripts/pr_quick.sh
#!/usr/bin/env bash
# chmod +x scripts/pr_quick.sh
# ./scripts/pr_quick.sh "feat/export-and-erdgen" "feat(web): add export & erdgen"

set -euo pipefail

BR="${1:-feat/auto-$(date +%Y%m%d-%H%M)}"
MSG="${2:-"chore: update"}"

git fetch origin
git switch main || git checkout -b main
git pull --rebase origin main

git switch -c "$BR"
git add -A
git commit -m "$MSG" || echo "no changes to commit"

git push -u origin "$BR"
gh pr create --base main --head "$BR" --fill || true
echo "✅ Pushed $BR and opened PR (if possible)."