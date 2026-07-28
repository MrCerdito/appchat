# ── Load Test Runner ──────────────────────────────────────────────────
# Ejecuta k6 con Docker contra el backend en localhost:3001
# Uso: .\run.ps1

param(
    [switch]$SkipBuild,
    [switch]$FlushRedis
)

$ErrorActionPreference = 'Stop'
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND_DIR = Split-Path -Parent $SCRIPT_DIR

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LOAD TEST — 1000 Usuarios Concurrentes" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── 1. Verificar backend ────────────────────────────────────────────
Write-Host "`n[1/5] Verificando backend..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 5
    Write-Host "  Backend OK: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Backend no responde en localhost:3001" -ForegroundColor Red
    Write-Host "  Asegurate de que el backend este corriendo." -ForegroundColor Red
    exit 1
}

# ── 2. Verificar Redis ──────────────────────────────────────────────
Write-Host "`n[2/5] Verificando Redis..." -ForegroundColor Yellow
$redisContainer = docker ps --filter "name=redis" --format "{{.Names}}" 2>$null
if ($redisContainer) {
    Write-Host "  Redis OK: container '$redisContainer' activo" -ForegroundColor Green
} else {
    Write-Host "  Redis no encontrado. Iniciando..." -ForegroundColor Yellow
    docker run -d --name redis -p 6379:6379 redis:alpine 2>$null
    Start-Sleep -Seconds 2
    Write-Host "  Redis iniciado" -ForegroundColor Green
}

# ── 3. Flush Redis throttle keys (evitar 429 al inicio) ─────────────
if ($FlushRedis) {
    Write-Host "`n[3/5] Limpiando Redis throttle keys..." -ForegroundColor Yellow
    docker exec redis redis-cli FLUSHDB 2>$null
    Write-Host "  Redis limpio" -ForegroundColor Green
} else {
    Write-Host "`n[3/5] Redis throttle keys conservadas (usa -FlushRedis para limpiar)" -ForegroundColor DarkGray
}

# ── 4. Build imagen k6 ──────────────────────────────────────────────
Write-Host "`n[4/5] Preparando k6 Docker image..." -ForegroundColor Yellow
if (-not $SkipBuild) {
    Push-Location $SCRIPT_DIR
    docker build -f Dockerfile.k6 -t k6-loadtest . 2>$null
    Pop-Location
    Write-Host "  Imagen k6-loadtest lista" -ForegroundColor Green
} else {
    Write-Host "  Using existing image (SkipBuild)" -ForegroundColor DarkGray
}

# ── 5. Ejecutar load test ───────────────────────────────────────────
Write-Host "`n[5/5] Ejecutando load test..." -ForegroundColor Yellow
Write-Host "  Escenarios: client_sessions(80) + public_reads(40) + advisor_flow(50) + ai_chat(20) + websocket(10)" -ForegroundColor DarkGray
Write-Host "  Duracion total: ~4 minutos" -ForegroundColor DarkGray
Write-Host ""

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir = Join-Path $SCRIPT_DIR "results"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

docker run --rm `
    --add-host=host.docker.internal:host-gateway `
    --name k6-loadtest-$timestamp `
    --memory=512m `
    --cpus=2 `
    -v "${outputDir}:/results" `
    k6-loadtest run `
    --summary-export=/results/k6-summary-$timestamp.json `
    /scripts/scenarios.js

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  LOAD TEST COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Resultados en: $outputDir" -ForegroundColor Yellow
Write-Host "  Resumen JSON: k6-summary-$timestamp.json" -ForegroundColor Yellow
