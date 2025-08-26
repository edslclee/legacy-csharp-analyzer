# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

EXPOSE 8787
CMD ["node", "dist/index.js"]