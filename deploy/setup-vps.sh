#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-vps.sh — Configuración inicial del VPS para InnovaCloud Chat
# ═══════════════════════════════════════════════════════════════════════════
# USO:
#   1. Subir proyecto: scp -r . root@<IP>:/opt/chat
#   2. ssh root@<IP>
#   3. cd /opt/chat && chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh
#
#   DESPUÉS de ejecutar, cuando el DNS ya apunte a la IP:
#   certbot --nginx -d innovacloud.com -d www.innovacloud.com --non-interactive \
#       --agree-tos -m admin@innovacloud.com
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DOMINIO="innovacloud.com"
EMAIL="admin@innovacloud.com"

echo "========================================"
echo "  InnovaCloud Chat — Setup VPS"
echo "  Dominio: $DOMINIO"
echo "========================================"

# ── 1. Instalar Docker y Nginx ────────────────────────────────────────
echo "[1/6] Instalando Docker, Nginx, Certbot..."
apt update
apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx curl ca-certificates

systemctl enable --now docker
systemctl enable --now nginx

# ── 2. Crear directorios necesarios ───────────────────────────────────
echo "[2/6] Creando directorios para volúmenes..."
mkdir -p backend/uploads/documentos backend/uploads/baileys-auth backend/uploads/whatsapp

# ── 3. Configurar Nginx del host ──────────────────────────────────────
echo "[3/6] Configurando Nginx del host..."
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

# ── 4. SSL con Certbot (solo si el DNS ya apunta a esta IP) ───────────
echo "[4/6] Obteniendo certificado SSL (si el DNS ya apunta)..."
if curl -sf "https://$DOMINIO" > /dev/null 2>&1; then
    certbot --nginx -d "$DOMINIO" -d "www.$DOMINIO" --non-interactive \
        --agree-tos -m "$EMAIL"
    systemctl enable --now certbot.timer
    echo "  ✅ SSL instalado"
else
    echo "  ⚠️  DNS aún no apunta. Ejecuta manualmente después:"
    echo "     certbot --nginx -d $DOMINIO -d www.$DOMINIO"
fi

# ── 5. Construir y levantar contenedores ──────────────────────────────
echo "[5/6] Construyendo y levantando contenedores (tarda 2-5 min)..."
docker compose up -d --build

# ── 6. Verificar que todo esté funcionando ────────────────────────────
echo "[6/6] Verificando servicios..."
sleep 10

echo ""
echo "--- Estado de contenedores ---"
docker compose ps

echo ""
echo "--- Health Check Backend ---"
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
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
echo "  ✅ Listo!"
echo "  Accede en: https://$DOMINIO/agora/"
echo ""
echo "  Comandos útiles:"
echo "    docker compose logs -f backend   # Ver logs del backend"
echo "    docker compose logs -f frontend  # Ver logs del frontend"
echo "    docker compose down && docker compose up -d   # Reiniciar"
echo "========================================"
