#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-vps.sh — Configuración inicial del VPS para InnovaCloud Chat
# ═══════════════════════════════════════════════════════════════════════════
# Uso:
#   1. Sube todo el proyecto al VPS (scp -r . root@<IP>:/opt/chat)
#   2. ssh root@<IP>
#   3. cd /opt/chat && chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "========================================"
echo "  InnovaCloud Chat — Setup VPS"
echo "========================================"

# ── 1. Instalar Docker y Nginx ────────────────────────────────────────
echo "[1/5] Instalando Docker, Nginx y utilidades..."
apt update
apt install -y docker.io docker-compose-v2 nginx curl ca-certificates

systemctl enable --now docker
systemctl enable --now nginx

# ── 2. Crear directorios necesarios ───────────────────────────────────
echo "[2/5] Creando directorios para volúmenes..."
mkdir -p backend/uploads/documentos backend/uploads/baileys-auth backend/uploads/whatsapp

# ── 3. Configurar Nginx del host ──────────────────────────────────────
echo "[3/5] Configurando Nginx del host..."
cp deploy/nginx-host.conf /etc/nginx/sites-available/chat

# Deshabilitar site por defecto si existe
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

# Habilitar nuestro site
if [ ! -f /etc/nginx/sites-enabled/chat ]; then
    ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/
fi

nginx -t
systemctl reload nginx

# ── 4. Construir y levantar contenedores ──────────────────────────────
echo "[4/5] Construyendo y levantando contenedores (tarda 2-5 min)..."
docker compose up -d --build

# ── 5. Verificar que todo esté funcionando ────────────────────────────
echo "[5/5] Verificando servicios..."
sleep 10

echo ""
echo "--- Estado de contenedores ---"
docker compose ps

echo ""
echo "--- Health Check Backend ---"
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "  ✅ Backend responde OK"
else
    echo "  ❌ Backend NO responde — revisa logs: docker compose logs backend"
fi

echo ""
echo "--- Health Check Frontend ---"
if curl -sf http://localhost:8095 > /dev/null 2>&1; then
    echo "  ✅ Frontend responde OK"
else
    echo "  ❌ Frontend NO responde — revisa logs: docker compose logs frontend"
fi

echo ""
echo "========================================"
echo "  Listo! Accede en: http://137.184.221.158"
echo ""
echo "  Comandos útiles:"
echo "    docker compose logs -f backend   # Ver logs del backend"
echo "    docker compose logs -f frontend  # Ver logs del frontend"
echo "    docker compose down && docker compose up -d   # Reiniciar"
echo "========================================"
