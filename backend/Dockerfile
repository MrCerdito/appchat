# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile

COPY backend/ ./backend/
RUN pnpm --filter backend build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

RUN apk add --no-cache curl tzdata

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --filter backend

COPY --from=builder /app/backend/dist ./dist
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/uploads/documentos /app/uploads/baileys-auth /app/uploads/whatsapp

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
