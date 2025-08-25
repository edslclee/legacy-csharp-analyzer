#!/bin/bash
# fix-web-env.sh : Vite + React + TS + Tailwind 자동 복구 스크립트
# 위치: apps/web 에서 실행하세요.

set -e

say() { echo -e "👉 \033[1m$1\033[0m"; }
ok()  { echo -e "✅ $1"; }
warn(){ echo -e "⚠️  $1"; }
err() { echo -e "❌ $1"; }

# 0) 위치/필수 파일 확인
say "현재 경로 확인"
PWD_NOW="$(pwd)"
echo "$PWD_NOW"

if [ ! -f "package.json" ]; then
  err "package.json 이 없습니다. apps/web 디렉터리에서 실행하세요."
  exit 1
fi
ok "package.json 확인"

# 1) Node / npm 버전 출력
say "Node / npm 버전"
(node -v && npm -v) || { err "node/npm 확인 실패. Node 18+ 권장 (20 LTS)"; exit 1; }

# 2) 깨끗한 설치(필요 시)
say "node_modules / lockfile 점검"
if [ ! -d node_modules ]; then
  warn "node_modules 미존재 → 설치 진행"
  npm i
else
  ok "node_modules 존재"
fi

# 3) Tailwind/PostCSS/Autoprefixer 설치
say "Tailwind & PostCSS 패키지 설치 확인"
NEED_INSTALL=0
npm ls tailwindcss --depth=0 >/dev/null 2>&1 || NEED_INSTALL=1
npm ls postcss --depth=0 >/dev/null 2>&1 || NEED_INSTALL=1
npm ls autoprefixer --depth=0 >/dev/null 2>&1 || NEED_INSTALL=1

if [ $NEED_INSTALL -eq 1 ]; then
  say "devDependencies 설치: tailwindcss postcss autoprefixer"
  npm i -D tailwindcss postcss autoprefixer
else
  ok "이미 설치됨"
fi

# 4) 설정 파일 생성/복구
say "Tailwind/PostCSS 설정 파일 생성/복구"

# tailwind.config.js
if [ ! -f tailwind.config.js ]; then
  cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
}
EOF
  ok "tailwind.config.js 생성"
else
  # content 경로 보정
  if ! grep -q 'src/\*\*/\*\.\{js,ts,jsx,tsx\}' tailwind.config.js; then
    warn "tailwind.config.js content 경로 보정"
    # 간단 치환: content 배열을 표준으로 교체
    perl -0777 -pe 's/content:\s*\[[^\]]*\]/content: [\n    ".\/index.html",\n    ".\/src\/**\/*.{js,ts,jsx,tsx}",\n  ]/s' -i tailwind.config.js || true
  fi
  ok "tailwind.config.js 확인"
fi

# postcss.config.js
if [ ! -f postcss.config.js ]; then
  cat > postcss.config.js <<'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF
  ok "postcss.config.js 생성"
else
  ok "postcss.config.js 확인"
fi

# 5) index.css 지시문 확인/추가
say "src/index.css Tailwind 지시문 확인"
mkdir -p src
if [ ! -f src/index.css ]; then
  cat > src/index.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF
  ok "src/index.css 생성 및 지시문 추가"
else
  ADD=0
  grep -q "@tailwind base;" src/index.css || ADD=1
  grep -q "@tailwind components;" src/index.css || ADD=1
  grep -q "@tailwind utilities;" src/index.css || ADD=1
  if [ $ADD -eq 1 ]; then
    { grep -q "@tailwind base;" src/index.css || echo "@tailwind base;" ; \
      grep -q "@tailwind components;" src/index.css || echo "@tailwind components;"; \
      grep -q "@tailwind utilities;" src/index.css || echo "@tailwind utilities;"; } >> src/index.css
    ok "누락된 지시문 추가 완료"
  else
    ok "지시문 3종 모두 존재"
  fi
fi

# 6) Vite 기본 파일 존재 여부 점검 (index.html, src/main.tsx)
say "Vite 기본 파일 점검"
if [ ! -f index.html ]; then
  warn "index.html 없음 → 간단 템플릿 생성"
  cat > index.html <<'EOF'
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>As-Is Navigator (Prototype)</title>
  </head>
  <body class="min-h-screen bg-gray-50">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
  ok "index.html 생성"
else
  ok "index.html 확인"
fi

if [ ! -f src/main.tsx ]; then
  warn "src/main.tsx 없음 → 기본 엔트리 생성"
  cat > src/main.tsx <<'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
EOF
  ok "src/main.tsx 생성"
else
  ok "src/main.tsx 확인"
fi

# 7) App.tsx 기본 UI 보정(없으면 생성)
if [ ! -f src/App.tsx ]; then
  say "src/App.tsx 생성(간단 UI)"
  cat > src/App.tsx <<'EOF'
import React from 'react'

export default function App() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">As-Is Navigator (Prototype)</h1>
      <p className="text-gray-600">Tailwind 설정이 정상이라면 이 문장이 스타일링되어 보입니다.</p>
      <button className="px-4 py-2 rounded-xl bg-black text-white">Test Button</button>
    </div>
  )
}
EOF
  ok "src/App.tsx 생성"
else
  ok "src/App.tsx 확인"
fi

# 8) tailwind CLI 바이너리 체크 및 대안 제공
say "로컬 tailwindcss 실행 파일 확인"
if [ -f ./node_modules/.bin/tailwindcss ]; then
  ok "tailwindcss 바이너리 존재"
else
  warn "tailwindcss 실행 파일이 보이지 않습니다. devDependencies 재설치 시도"
  npm i -D tailwindcss postcss autoprefixer
fi

# 9) 개발 서버 실행 안내
say "복구 완료! 개발 서버 실행:"
echo "   npm run dev"
ok  "브라우저에서 http://localhost:5173 확인"