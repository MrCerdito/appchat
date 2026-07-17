# ─────────────────────────────────────────────────────────────────────────
#  ReportaCasos — Inicio rápido con Docker
# ─────────────────────────────────────────────────────────────────────────
#  Uso:
#    .\start.ps1          → Construye imágenes y levanta servicios
#    .\start.ps1 -build   → Reconstruye forzando (sin caché)
#    .\start.ps1 -down    → Detiene todo y limpia
#    .\start.ps1 -logs    → Muestra logs en vivo
# ─────────────────────────────────────────────────────────────────────────

param(
  [switch]$build,
  [switch]$down,
  [switch]$logs
)

$COMPOSE_FILE = "docker-compose.yml"

if ($down) {
  Write-Host "⏹  Deteniendo servicios..." -ForegroundColor Yellow
  docker compose -f $COMPOSE_FILE down -v
  Write-Host "✅ Servicios detenidos" -ForegroundColor Green
  exit
}

if ($logs) {
  docker compose -f $COMPOSE_FILE logs -f
  exit
}

if ($build) {
  Write-Host "🔨 Reconstruyendo imágenes sin caché..." -ForegroundColor Yellow
  docker compose -f $COMPOSE_FILE build --no-cache
}

Write-Host "🚀 Levantando servicios..." -ForegroundColor Yellow
docker compose -f $COMPOSE_FILE up -d

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Error al iniciar servicios" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "`n⏳ Esperando que los servicios estén listos..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# ── Verificar health ──────────────────────────────────────────────────
try {
  $response = Invoke-RestMethod -Uri "http://localhost:8095/health" -TimeoutSec 10
  Write-Host "✅ Backend saludable" -ForegroundColor Green
} catch {
  Write-Host "⚠️  Backend aún no responde (puede tardar unos segundos más)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         ReportaCasos — Dockerizado                 ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  🌐 Frontend:  http://localhost:8095               ║" -ForegroundColor Cyan
Write-Host "║  ⚙️  Backend:  http://localhost:3001               ║" -ForegroundColor Cyan
Write-Host "║  🗄️  Postgres: localhost:5433                      ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  📧 Admin:    admin@innovacloud.co                 ║" -ForegroundColor Cyan
Write-Host "║  🔑 Password: Admin123                             ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  📧 Asesor:   asesor@innovacloud.com               ║" -ForegroundColor Cyan
Write-Host "║  🔑 Password: asesor123                            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Comandos útiles:" -ForegroundColor White
Write-Host "  .\start.ps1 -logs    → Ver logs en vivo" -ForegroundColor Gray
Write-Host "  .\start.ps1 -down    → Detener servicios" -ForegroundColor Gray
Write-Host "  docker compose logs -f → Logs de todos los servicios" -ForegroundColor Gray
