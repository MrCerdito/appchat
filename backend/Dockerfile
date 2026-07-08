# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Instalar curl para el healthcheck
RUN apk add --no-cache curl

COPY package*.json ./

# Instalar dependencias de producción
# pdf-parse@1.1.1 es la versión que exporta directamente una función
RUN npm ci --omit=dev && \
    npm install pdf-parse@1.1.1

COPY --from=builder /app/dist ./dist

# ★ Crear directorios para archivos subidos
# Se montan como volúmenes en docker-compose
RUN mkdir -p /app/uploads/documentos /app/uploads/baileys-auth /app/uploads/whatsapp

EXPOSE 3001
CMD ["node", "dist/src/main"]