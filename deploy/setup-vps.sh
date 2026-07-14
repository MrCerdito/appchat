#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-vps.sh — Configuración inicial del VPS para InnoovaCloud Chat
# ═══════════════════════════════════════════════════════════════════════════
# USO:
#   1. Subir proyecto: scp -r . root@<IP>:/opt/chat
#   2. ssh root@<IP>
#   3. cd /opt/chat && chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh
#
#   Para ACTUALIZAR después del setup inicial:
#     ./deploy/setup-vps.sh --upgrade
#
#   DESPUÉS de ejecutar, cuando el DNS ya apunte a la IP:
#   certbot certonly --webroot -w /var/www/html \
#       -d innoovacloud.com -d www.innoovacloud.com --non-interactive \
#       --agree-tos -m admin@innoovacloud.com
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DOMINIO="${DOMINIO:-innoovacloud.com}"
EMAIL="${EMAIL:-admin@innoovacloud.com}"
MODE="${1:-setup}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC}  $1"; }

check_prereqs() {
  info "Verificando prerequisitos..."
  local missing=0

  for cmd in docker nginx curl; do
    if ! command -v "$cmd" &>/dev/null; then
      err "Falta comando: $cmd"
      missing=1
    fi
  done

  if ! docker compose version &>/dev/null; then
    err "Falta docker compose (plugin v2)"
    missing=1
  fi

  if [ "$missing" -eq 1 ]; then
    err "Instale los prerequisitos faltantes y vuelva a intentar."
    exit 1
  fi
  ok "Todos los prerequisitos están instalados"
}

setup_env_file() {
  if [ -f backend/.env ]; then
    info "backend/.env ya existe — conservando valores existentes"
    return
  fi

  if [ ! -f backend/.env.production ]; then
    err "No se encuentra backend/.env.production"
    exit 1
  fi

  cp backend/.env.production backend/.env
  warn "backend/.env creado desde plantilla. Debe configurar los secrets."

  # Generar secrets aleatorios
  local jwt_secret
  jwt_secret=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null || openssl rand -hex 64)
  local enc_key
  enc_key=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)

  # Reemplazar placeholders
  sed -i "s/JWT_SECRET=CHANGE_ME_GENERATE_RANDOM_64_BYTE_HEX/JWT_SECRET=$jwt_secret/" backend/.env
  sed -i "s/CHAT_ENCRYPTION_KEY=CHANGE_ME_GENERATE_64_CHAR_HEX/CHAT_ENCRYPTION_KEY=$enc_key/" backend/.env
  sed -i "s/VERIFY_TOKEN=CHANGE_ME_VERIFY_TOKEN/VERIFY_TOKEN=$(openssl rand -hex 16)/" backend/.env
  sed -i "s/DB_PASS=CHANGE_ME_DB_PASSWORD/DB_PASS=postgres/" backend/.env

  info "JWT_SECRET y CHAT_ENCRYPTION_KEY generados automáticamente"
  info "Revise backend/.env para configurar: GEMINI_API_KEY, RESEND_API_KEY, etc."
}

install_packages() {
  info "Instalando paquetes del sistema..."
  apt update

  local install_list=""

  if ! command -v docker &>/dev/null; then
    install_list="$install_list docker.io docker-compose-v2"
  fi

  if ! command -v nginx &>/dev/null; then
    install_list="$install_list nginx"
  fi

  if ! command -v certbot &>/dev/null; then
    install_list="$install_list certbot python3-certbot-nginx"
  fi

  if ! command -v openssl &>/dev/null; then
    install_list="$install_list openssl"
  fi

  if [ -n "$install_list" ]; then
    apt install -y $install_list curl ca-certificates
  else
    info "Paquetes ya instalados"
  fi

  systemctl enable --now docker 2>/dev/null || true
  systemctl enable --now nginx 2>/dev/null || true
  ok "Paquetes listos"
}

setup_nginx_host() {
  info "Configurando Nginx del host..."
  if [ ! -f deploy/nginx-host.conf ]; then
    err "No se encuentra deploy/nginx-host.conf"
    exit 1
  fi

  # Crear directorio para ACME challenges de Certbot
  mkdir -p /var/www/html

  # Copiar y eliminar bloque HTTPS (certificados aún no existen)
  cp deploy/nginx-host.conf /etc/nginx/sites-available/chat
  sed -i '/^# ── HTTPS/,/^}$/d' /etc/nginx/sites-available/chat

  if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
  fi

  if [ ! -f /etc/nginx/sites-enabled/chat ]; then
    ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/
  fi

  nginx -t
  systemctl reload nginx
  ok "Nginx del host configurado (HTTP con soporte ACME)"
}

setup_ssl() {
  info "Obteniendo certificado SSL con webroot..."
  if certbot certonly --webroot -w /var/www/html \
    -d "$DOMINIO" -d "www.$DOMINIO" --non-interactive \
    --agree-tos -m "$EMAIL" 2>/dev/null; then

    ok "SSL obtenido exitosamente para $DOMINIO"

    # Copiar config completo con HTTPS
    cp deploy/nginx-host.conf /etc/nginx/sites-available/chat
    nginx -t && systemctl reload nginx
    systemctl enable --now certbot.timer 2>/dev/null || true
    ok "SSL activado en Nginx"
  else
    warn "========================================================"
    warn "  No se pudo obtener SSL automáticamente."
    warn "  Causas posibles:"
    warn "    1. El DNS de $DOMINIO aún no apunta a este servidor"
    warn "    2. Puerto 80 no está accesible desde internet"
    warn ""
    warn "  Cuando el DNS apunte, ejecute manualmente:"
    warn "  certbot certonly --webroot -w /var/www/html \\"
    warn "    -d $DOMINIO -d www.$DOMINIO --non-interactive \\"
    warn "    --agree-tos -m $EMAIL"
    warn ""
    warn "  Luego: cp deploy/nginx-host.conf /etc/nginx/sites-available/chat"
    warn "  Luego: nginx -t && systemctl reload nginx"
    warn "========================================================"
  fi
}

create_dirs() {
  info "Creando directorios de uploads..."
  mkdir -p backend/uploads/documentos backend/uploads/baileys-auth backend/uploads/whatsapp
  ok "Directorios listos"
}

build_and_up() {
  info "Construyendo y levantando contenedores..."
  docker compose up -d --build --remove-orphans
  ok "Contenedores levantados"
}

verify() {
  info "Verificando servicios..."
  sleep 10

  echo ""
  echo "--- Estado de contenedores ---"
  docker compose ps

  echo ""
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    ok "Backend responde OK"
  else
    warn "Backend NO responde — revise: docker compose logs backend"
  fi

  if curl -sf http://localhost:8095 > /dev/null 2>&1; then
    ok "Frontend responde OK"
  else
    warn "Frontend NO responde — revise: docker compose logs frontend"
  fi
}

print_summary() {
  echo ""
  echo "========================================"
  echo "  ✅ Listo!"
  echo "  Accede en: https://$DOMINIO/agora/"
  echo ""
  echo "  Comandos útiles:"
  echo "    docker compose logs -f backend"
  echo "    docker compose logs -f frontend"
  echo "    ./deploy/backup.sh"
  echo "    docker compose down && docker compose up -d"
  echo "========================================"
}

# ── Main ────────────────────────────────────────────────────────────────
echo "========================================"
echo "  InnovaCloud Chat — Setup VPS"
echo "  Modo: $MODE"
echo "  Dominio: $DOMINIO"
echo "========================================"
echo ""

case "$MODE" in
  --upgrade|upgrade)
    check_prereqs
    build_and_up
    verify
    print_summary
    ;;
  setup|--setup)
    install_packages
    create_dirs
    setup_env_file
    setup_nginx_host
    setup_ssl
    build_and_up
    verify
    print_summary
    ;;
  *)
    echo "USO: $0 [setup|--upgrade]"
    echo ""
    echo "  setup      (default) Configuración inicial completa"
    echo "  --upgrade  Solo reconstruye imágenes y reinicia servicios"
    exit 1
    ;;
esac
