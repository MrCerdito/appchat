#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# backup.sh — Respaldo de BD PostgreSQL + archivos subidos
# ═══════════════════════════════════════════════════════════════════════════
# USO:
#   ./deploy/backup.sh                  # respaldo completo
#   ./deploy/backup.sh --db-only        # solo base de datos
#   ./deploy/backup.sh --uploads-only   # solo archivos subidos
#   ./deploy/backup.sh --restore <file> # restaurar respaldo
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_PROJECT="${COMPOSE_PROJECT:-appchat}"

mkdir -p "$BACKUP_DIR"

db_backup() {
  echo "🔹 Respaldando base de datos..."
  local filename="$BACKUP_DIR/chat_db_$TIMESTAMP.sql.gz"
  docker compose exec -T postgres pg_dump -U postgres app | gzip > "$filename"
  echo "   ✅ DB → $filename ($(du -h "$filename" | cut -f1))"
}

uploads_backup() {
  echo "🔹 Respaldando archivos subidos..."
  local filename="$BACKUP_DIR/chat_uploads_$TIMESTAMP.tar.gz"
  docker compose exec -T backend tar cz -C /app/uploads . > "$filename"
  echo "   ✅ Uploads → $filename ($(du -h "$filename" | cut -f1))"
}

full_backup() {
  db_backup
  uploads_backup
  echo ""
  echo "🔸 Respaldo completo guardado en: $BACKUP_DIR/"
  ls -lh "$BACKUP_DIR/"
}

restore_backup() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "❌ Archivo no encontrado: $file"
    exit 1
  fi

  case "$file" in
    *.sql.gz)
      echo "🔹 Restaurando base de datos desde $file..."
      gunzip -c "$file" | docker compose exec -T postgres psql -U postgres -d app
      echo "   ✅ DB restaurada"
      ;;
    *.tar.gz)
      echo "🔹 Restaurando uploads desde $file..."
      docker compose exec -T backend tar xz -C /app/uploads < "$file"
      echo "   ✅ Uploads restaurados"
      ;;
    *)
      echo "❌ Formato no reconocido. Usa archivos .sql.gz o .tar.gz"
      exit 1
      ;;
  esac
}

# ── Main ────────────────────────────────────────────────────────────────
case "${1:-}" in
  --db-only) db_backup ;;
  --uploads-only) uploads_backup ;;
  --restore) restore_backup "${2:-}" ;;
  --help|-h)
    echo "USO: $0 [--db-only|--uploads-only|--restore <file>|--help]"
    exit 0
    ;;
  *) full_backup ;;
esac
