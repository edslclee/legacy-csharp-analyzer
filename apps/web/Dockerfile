# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

# 👇 이 두 파일을 꼭 복사
COPY tailwind.config.js postcss.config.cjs ./

# 나머지 앱 파일
COPY index.html ./
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public

RUN npm run build

# ---------- nginx ----------
FROM nginx:1.27-alpine AS runner
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist ./