#!/bin/bash
# check-env.sh : VS Code + Vite + Tailwind 환경 점검 스크립트

echo "=== 📂 현재 경로 확인 ==="
pwd

echo
echo "=== 📁 package.json 확인 (apps/web 안이어야 정상) ==="
if [ -f package.json ]; then
  echo "✅ package.json 존재"
else
  echo "❌ package.json 없음 (apps/web 디렉토리 안으로 이동 필요)"
fi

echo
echo "=== 📦 Node/NPM 버전 확인 ==="
node -v || echo "❌ node 미설치"
npm -v  || echo "❌ npm 미설치"

echo
echo "=== 📦 Tailwind/PostCSS 설치 여부 확인 ==="
npm list tailwindcss postcss autoprefixer --depth=0 2>/dev/null

echo
echo "=== ⚙️ Tailwind/PostCSS 설정 파일 확인 ==="
for f in tailwind.config.js postcss.config.js src/index.css; do
  if [ -f "$f" ]; then
    echo "✅ $f 존재"
  else
    echo "❌ $f 없음"
  fi
done

echo
echo "=== 📄 index.css Tailwind 지시문 확인 ==="
if [ -f src/index.css ]; then
  if grep -q "@tailwind base;" src/index.css && \
     grep -q "@tailwind components;" src/index.css && \
     grep -q "@tailwind utilities;" src/index.css; then
    echo "✅ Tailwind 지시문 3줄 모두 존재"
  else
    echo "⚠️ src/index.css 안에 @tailwind 지시문이 누락됨"
  fi
fi

echo
echo "=== 📦 로컬 tailwindcss 실행 파일 확인 ==="
if [ -f ./node_modules/.bin/tailwindcss ]; then
  echo "✅ ./node_modules/.bin/tailwindcss 존재"
else
  echo "❌ tailwindcss 실행 파일 없음 (npm i -D tailwindcss 필요)"
fi

echo
echo "=== 🔎 점검 완료 ==="