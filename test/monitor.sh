#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# MONITOR — Monitoreo de Docker en tiempo real para pruebas de carga
# ═══════════════════════════════════════════════════════════════════════════
# Ejecutar:  bash test/monitor.sh
#            Ctrl+C para detener. Genera CSV en test/results/
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

RESULTS_DIR="$(dirname "$0")/results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CSV_FILE="$RESULTS_DIR/docker-stats-${TIMESTAMP}.csv"
HEALTH_LOG="$RESULTS_DIR/health-checks-${TIMESTAMP}.log"
BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "═══════════════════════════════════════════════════════════"
echo "  MONITOR — Prueba de carga"
echo "═══════════════════════════════════════════════════════════"
echo "  CSV:        $CSV_FILE"
echo "  Health log: $HEALTH_LOG"
echo "  Backend:    $BASE_URL"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Encabezado CSV
echo "timestamp,container,cpu_percent,mem_usage_mb,mem_limit_mb,mem_percent,net_in_mb,net_out_mb,block_in_mb,block_out_mb,pids" \
  > "$CSV_FILE"

echo "timestamp,status,response_ms" > "$HEALTH_LOG"

# Trap para limpiar
cleanup() {
    echo ""
    echo "  Monitor detenido."
    echo "  CSV: $CSV_FILE"
    echo "  Health: $HEALTH_LOG"

    if command -v python3 &>/dev/null && [ -f "$CSV_FILE" ]; then
        echo ""
        echo "  ── Resumen de Docker Stats ──"
        python3 -c "
import csv
from collections import defaultdict

stats = defaultdict(list)
with open('$CSV_FILE') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            stats[row['container']].append({
                'cpu': float(row['cpu_percent']),
                'mem_mb': float(row['mem_usage_mb']),
            })
        except (ValueError, KeyError):
            pass

for container, values in stats.items():
    cpus = [v['cpu'] for v in values]
    mems = [v['mem_mb'] for v in values]
    print(f'  {container}:')
    print(f'    CPU: avg={sum(cpus)/len(cpus):.1f}%  max={max(cpus):.1f}%')
    print(f'    MEM: avg={sum(mems)/len(mems):.1f}MB  max={max(mems):.1f}MB  min={min(mems):.1f}MB')
" 2>/dev/null || true
    fi

    exit 0
}
trap cleanup SIGINT SIGTERM

# Verificar que Docker está corriendo
if ! docker stats --no-stream --format '{{.Name}}' 2>/dev/null | head -1 | grep -q .; then
    echo "  ✗ No se detectaron contenedores Docker corriendo."
    echo "    Ejecuta: docker compose up -d"
    exit 1
fi

echo "  Monitoreando... (Ctrl+C para detener)"
echo ""

# Health check en background
(
    while true; do
        START=$(date +%s%N)
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$BASE_URL/health" 2>/dev/null || echo "000")
        END=$(date +%s%N)
        LATENCY_MS=$(( (END - START) / 1000000 ))

        echo "$(date -Iseconds),$STATUS,$LATENCY_MS" >> "$HEALTH_LOG"

        if [ "$STATUS" != "200" ]; then
            echo "  ⚠ HEALTH CHECK FAIL: status=$STATUS ($(date +%H:%M:%S))"
        fi

        sleep 5
    done
) &
HEALTH_PID=$!

# Monitoreo Docker stats
while true; do
    TIMESTAMP=$(date -Iseconds)

    docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}' 2>/dev/null | \
    grep -E '(chat-backend|chat-frontend|chat-postgres)' | \
    while IFS=',' read -r name cpu mem_usage mem_pct net_io block_io pids; do
        # Limpiar valores
        cpu_val=$(echo "$cpu" | tr -d '% ')
        mem_limit=$(echo "$mem_usage" | awk -F'/' '{print $2}' | xargs)
        mem_used=$(echo "$mem_usage" | awk -F'/' '{print $1}' | xargs)
        mem_pct_val=$(echo "$mem_pct" | tr -d '% ')
        net_in=$(echo "$net_io" | awk -F'/' '{print $1}' | xargs)
        net_out=$(echo "$mem_usage" | awk -F'/' '{print $2}' | xargs)
        block_in=$(echo "$block_io" | awk -F'/' '{print $1}' | xargs)
        block_out=$(echo "$block_io" | awk -F'/' '{print $2}' | xargs)
        pids_val=$(echo "$pids" | xargs)

        # Convertir MB si necesario
        to_mb() {
            local val="$1"
            if echo "$val" | grep -qi 'gib'; then
                echo "$val" | sed 's/[[:space:]]*GiB//' | awk '{printf "%.1f", $1 * 1024}'
            elif echo "$val" | grep -qi 'mib'; then
                echo "$val" | sed 's/[[:space:]]*MiB//' | awk '{printf "%.1f", $1}'
            elif echo "$val" | grep -qi 'kib'; then
                echo "$val" | sed 's/[[:space:]]*KiB//' | awk '{printf "%.2f", $1 / 1024}'
            else
                echo "0"
            fi
        }

        mem_used_mb=$(to_mb "$mem_used")
        mem_limit_mb=$(to_mb "$mem_limit")
        net_in_mb=$(to_mb "$net_in")
        net_out_mb=$(to_mb "$net_out")
        block_in_mb=$(to_mb "$block_in")
        block_out_mb=$(to_mb "$block_out")

        echo "$TIMESTAMP,$name,$cpu_val,$mem_used_mb,$mem_limit_mb,$mem_pct_val,$net_in_mb,$net_out_mb,$block_in_mb,$block_out_mb,$pids_val" \
          >> "$CSV_FILE"
    done

    # Log visual cada 10 segundos
    CONTAINERS=$(docker stats --no-stream --format '{{.Name}}: CPU={{.CPUPerc}} MEM={{.MemUsage}}' 2>/dev/null | grep -E '(chat-backend|chat-postgres)' | tr '\n' ' | ')
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 --max-time 3 "$BASE_URL/health" 2>/dev/null || echo "???")
    echo "  [$(date +%H:%M:%S)] Health=$HEALTH | $CONTAINERS"

    sleep 10
done
