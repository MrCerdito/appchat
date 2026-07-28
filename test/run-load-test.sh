#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# RUN LOAD TEST — Orquestador completo de pruebas de carga
// ═══════════════════════════════════════════════════════════════════════════
// Ejecutar:  ./test/run-load-test.sh
//            Opciones:
//              --scenario=api|advisors|clients|fullflow|stress|whatsapp|disconnect|all
//              --skip-seed    No re-crear asesores de prueba
//              --skip-docker  No levantar docker compose
//              --base-url=URL URL del backend
// ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ── Parsear argumentos ───────────────────────────────────────────────────────
SCENARIO="all"
SKIP_SEED=false
SKIP_DOCKER=false
BASE_URL="${BASE_URL:-http://localhost:3001}"

for arg in "$@"; do
  case $arg in
    --scenario=*)   SCENARIO="${arg#*=}" ;;
    --skip-seed)    SKIP_SEED=true ;;
    --skip-docker)  SKIP_DOCKER=true ;;
    --base-url=*)   BASE_URL="${arg#*=}" ;;
    --help|-h)
      echo "Uso: $0 [opciones]"
      echo ""
      echo "Opciones:"
      echo "  --scenario=NAME    Escenario de prueba: api|advisors|clients|fullflow|stress|whatsapp|disconnect|all"
      echo "  --skip-seed        No re-crear asesores de prueba"
      echo "  --skip-docker      No levantar docker compose"
      echo "  --base-url=URL     URL del backend (default: http://localhost:3001)"
      echo ""
      echo "Ejemplos:"
      echo "  $0                                  # Prueba completa"
      echo "  $0 --scenario=stress               # Solo stress test"
      echo "  $0 --scenario=whatsapp --skip-seed # Solo WhatsApp, sin re-crear asesores"
      exit 0
      ;;
  esac
done

export BASE_URL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  LOAD TEST — ReportaCasos / appchat"
echo "═══════════════════════════════════════════════════════════════"
echo "  Backend:   $BASE_URL"
echo "  Escenario: $SCENARIO"
echo "  Directorio: $SCRIPT_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── 1. Instalar dependencias ─────────────────────────────────────────────────
echo "── [1/6] Instalando dependencias de test ──"
cd "$SCRIPT_DIR"
if [ ! -d "node_modules" ]; then
  npm install --no-audit --no-fund 2>&1 | tail -5
  echo "  Dependencias instaladas ✓"
else
  echo "  node_modules ya existe ✓"
fi
cd "$PROJECT_DIR"
echo ""

# ── 2. Docker Compose ───────────────────────────────────────────────────────
echo "── [2/6] Verificando Docker Compose ──"
if [ "$SKIP_DOCKER" = false ]; then
  # Verificar si ya está corriendo
  BACKEND_STATUS=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep backend | awk '{print $2}' || echo "down")
  POSTGRES_STATUS=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep postgres | awk '{print $2}' || echo "down")

  if [ "$BACKEND_STATUS" != "running" ] || [ "$POSTGRES_STATUS" != "running" ]; then
    echo "  Levantando docker compose..."
    docker compose up -d --build 2>&1 | tail -10
    echo "  Esperando a que backend esté healthy..."
    for i in $(seq 1 60); do
      if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
        echo "  Backend listo ✓"
        break
      fi
      if [ "$i" -eq 60 ]; then
        echo "  ✗ Backend no respondió en 60s"
        echo "    Logs: docker compose logs backend --tail=50"
        exit 1
      fi
      sleep 2
    done
  else
    echo "  Docker ya corriendo ✓"
  fi
else
  echo "  Saltando (--skip-docker)"
fi
echo ""

# ── 3. Verificar backend ─────────────────────────────────────────────────────
echo "── [3/6] Verificando backend ──"
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo "")
if [ -z "$HEALTH" ]; then
  echo "  ✗ Backend no disponible en $BASE_URL"
  echo "    Ejecuta sin --skip-docker o levanta manualmente: docker compose up -d"
  exit 1
fi
echo "  Backend OK: $HEALTH"
echo ""

# ── 4. Seed asesores ────────────────────────────────────────────────────────
echo "── [4/6] Seed asesores de prueba ──"
if [ "$SKIP_SEED" = false ]; then
  # Verificar si ya existen tokens
  if [ -f "$SCRIPT_DIR/test-tokens.json" ]; then
    TOKENS_AGE=$(( ($(date +%s) - $(stat -c %Y "$SCRIPT_DIR/test-tokens.json" 2>/dev/null || echo 0)) / 60 ))
    if [ "$TOKENS_AGE" -lt 60 ]; then
      echo "  Tokens existentes (${TOKENS_AGE} min old). Re-creando..."
    fi
  fi

  cd "$SCRIPT_DIR"
  node seed-test-advisors.js
  cd "$PROJECT_DIR"
else
  echo "  Saltando (--skip-seed)"
  if [ ! -f "$SCRIPT_DIR/test-tokens.json" ]; then
    echo "  ✗ No existe test-tokens.json. Ejecuta sin --skip-seed una vez."
    exit 1
  fi
fi
echo ""

# ── 5. Lanzar monitor en background ──────────────────────────────────────────
echo "── [5/6] Lanzando monitor de recursos ──"
bash "$SCRIPT_DIR/monitor.sh" &
MONITOR_PID=$!
echo "  Monitor PID: $MONITOR_PID"
echo ""

# ── 6. Ejecutar prueba ──────────────────────────────────────────────────────
echo "── [6/6] Ejecutando prueba de carga ──"
cd "$SCRIPT_DIR"
export SCENARIO
node load-test-full.js
TEST_EXIT=$?
cd "$PROJECT_DIR"
echo ""

# ── Detener monitor ──────────────────────────────────────────────────────────
echo "Deteniendo monitor..."
kill "$MONITOR_PID" 2>/dev/null || true
wait "$MONITOR_PID" 2>/dev/null || true

# ── Resumen ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  PRUEBA COMPLETADA"
echo "═══════════════════════════════════════════════════════════════"
echo "  Escenario: $SCENARIO"
echo "  Resultados:"
ls -la "$SCRIPT_DIR/results/" 2>/dev/null | tail -5
echo ""
echo "  Para ver el reporte:"
echo "    cat test/results/report-*.txt | tail -60"
echo ""
echo "  Para ver el CSV de Docker stats:"
echo "    cat test/results/docker-stats-*.csv"
echo "═══════════════════════════════════════════════════════════════"

exit $TEST_EXIT
