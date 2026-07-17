# ReportaCasos — Despliegue desde cero (VPS Ubuntu + HestiaCP)

> Última actualización: 2026-07-15
> Dominio: `reportacasos.innovacloud.co` · Ruta de la app: `/agora/`
> Arquitectura: Hestia nginx (80/443) → frontend Docker (127.0.0.1:8095) → backend Docker (backend:3001) → Postgres (127.0.0.1:5433)

Esta guía reemplaza a `CONFIGURACION.md` (desactualizado: usaba el dominio
`innoovacloud.com` y la ruta `/korvix/`, que no corresponden al código actual).

---

## 1. Prerrequisitos del servidor

- Ubuntu con **HestiaCP** instalado (nginx del host lo gestiona Hestia — NO
  crear sites en `/etc/nginx/sites-available` a mano).
- Docker Engine + Docker Compose v2:
  ```bash
  apt update && apt install -y docker.io docker-compose-v2 curl
  systemctl enable --now docker
  ```

## 2. Clonar el proyecto

```bash
cd ~/Documentos
git clone https://dev.azure.com/innovaclouddevs/ControlAcademic/_git/ReportaCasos
cd ReportaCasos
```

## 3. Variables de entorno

### 3.1 `backend/.env`

```bash
cp backend/.env.production backend/.env
nano backend/.env
```

Completar todo lo que diga `CHANGE_ME`:
- `RESEND_API_KEY` (email), `GEMINI_API_KEY` (IA), `VERIFY_TOKEN` (WhatsApp),
  `MICROSOFT_*` (solo si se usa Teams).

Generar secrets nuevos (recomendado en cada instalación):
```bash
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 64   # JWT_REFRESH_SECRET
openssl rand -hex 32   # CHAT_ENCRYPTION_KEY (debe ser exactamente 64 hex)
```

### 3.2 `.env` de la raíz (junto a `docker-compose.yml`)

⚠️ **Importante:** el bloque `environment:` del `docker-compose.yml` tiene
prioridad sobre `backend/.env`. `CORS_ORIGINS` y `APP_URL` se toman del `.env`
de la **raíz** (o de los defaults del compose, que ya apuntan a
`reportacasos.innovacloud.co`). Solo crear este archivo si el dominio cambia:

```bash
cat > .env <<'EOF'
CORS_ORIGINS=https://reportacasos.innovacloud.co
APP_URL=https://reportacasos.innovacloud.co
FRONTEND_PORT=8095
EOF
```

## 4. Dominio y proxy en HestiaCP

1. En el panel de Hestia: crear el dominio web `reportacasos.innovacloud.co`
   y activar SSL (Let's Encrypt).
2. Instalar la plantilla de proxy propia (incluida en este repo):
   ```bash
   cp deploy/hestia/reportacasos.tpl  /usr/local/hestia/data/templates/web/nginx/
   cp deploy/hestia/reportacasos.stpl /usr/local/hestia/data/templates/web/nginx/
   chown root:root /usr/local/hestia/data/templates/web/nginx/reportacasos.*
   chmod 644       /usr/local/hestia/data/templates/web/nginx/reportacasos.*
   ```
3. Asignar la plantilla al dominio (por CLI o en el panel:
   Web → dominio → Editar → Proxy Template → `reportacasos`):
   ```bash
   v-change-web-domain-proxy-tpl USUARIO reportacasos.innovacloud.co reportacasos
   nginx -t
   ```

La plantilla reenvía todo el tráfico HTTPS a `127.0.0.1:8095` (el contenedor
frontend rutea internamente la SPA, la API y el WebSocket), con manejo especial
de `Upgrade` para Socket.IO y sin buffering para el stream SSE de IA.

## 5. Base de datos — inicializar el esquema (paso crítico)

`synchronize` de TypeORM está **desactivado en producción**
(`app.module.ts`), así que las tablas NO se crean solas. Hay que cargar el
dump y (si el dump está desactualizado) completar el esquema una vez.

```bash
# 5.1 Levantar solo Postgres
docker compose up -d postgres
# esperar a healthy:
docker compose ps

# 5.2 Restaurar el dump del esquema
# Si bd.sql es formato custom generado con pg_dump 17+, el pg_restore 16 del
# contenedor no lo lee ("unsupported version"). Convertirlo primero:
docker run --rm -v "$PWD/backend/BD:/bd" postgres:17 \
  pg_restore --no-owner --no-privileges -f /bd/bd_plain.sql /bd/bd.sql
docker compose exec -T postgres psql -U postgres -d app < backend/BD/bd_plain.sql

# (Si bd.sql ya fuera SQL plano o custom compatible, basta:
#  docker compose exec -T postgres pg_restore -U postgres -d app --no-owner < backend/BD/bd.sql)

# 5.3 Si el dump es más viejo que el código: limpiar datos transaccionales
# que chocan con columnas NOT NULL nuevas (PII cifrada). NO tocar users,
# configuracion, colegios ni widget_config:
docker compose exec -T postgres psql -U postgres -d app \
  -c "TRUNCATE TABLE sessions, messages, ratings, ai_logs CASCADE;"

# 5.4 Arranque ÚNICO en modo development para que synchronize cree las
# tablas/columnas que falten (tickets, faqs, teams_tokens, whatsapp_*):
docker compose run --rm --no-deps -e NODE_ENV=development backend
# cuando aparezca "Backend corriendo en puerto 3001" → Ctrl+C
# (si Ctrl+C no responde, desde otra terminal:
#  docker ps --filter "name=backend-run" -q | xargs -r docker stop)

# 5.5 Verificar: deben existir 16 tablas
docker compose exec -T postgres psql -U postgres -d app -c "\dt"
```

> 💡 Para que los pasos 5.3–5.4 no hagan falta nunca más: con la BD ya
> completa, regenerar el dump con el pg_dump del propio contenedor (así la
> versión siempre es compatible) y commitearlo:
> ```bash
> docker compose exec postgres pg_dump -U postgres -d app -Fc -f /tmp/bd.dump
> docker compose cp postgres:/tmp/bd.dump backend/BD/bd.sql
> rm -f backend/BD/bd_plain.sql
> ```

## 6. Levantar la aplicación

```bash
docker compose up -d --build
docker compose ps        # backend debe quedar "healthy" (~30-60s)
```

Notas ya resueltas en el repo (no requieren acción, solo no revertirlas):
- `frontend/nginx.conf` usa `set $backend http://backend:3001;` con
  `resolver 127.0.0.11` — **nunca** `host.docker.internal`, que no resuelve
  en Docker Engine de Linux y produce 502 en todas las llamadas a la API.
- Los defaults de `CORS_ORIGINS`/`APP_URL` del compose ya apuntan al dominio
  correcto.

## 7. Verificación

```bash
curl -f http://127.0.0.1:3001/health          # backend directo
curl -s http://127.0.0.1:8095/agora/health    # backend vía proxy del frontend
curl -sI http://127.0.0.1:8095/ | head -1     # 302 → /agora/
curl -sI https://reportacasos.innovacloud.co/ | head -1
```

En el navegador: `https://reportacasos.innovacloud.co/` → redirige a
`/agora/` → login → verificar en la consola que no haya errores de CORS y
que el WebSocket (Socket.IO) conecte.

## 8. Solución de problemas (lecciones aprendidas)

| Síntoma | Causa | Solución |
|---|---|---|
| 500/502 en todo el dominio | Contenedores Docker apagados | `docker compose up -d` |
| Backend en bucle `Restarting`, log `relation "X" does not exist` | Esquema de BD no inicializado (synchronize off en prod) | Paso 5 completo |
| `pg_restore: unsupported version (1.16)` | Dump creado con pg_dump 17, contenedor es PG16 | Convertir con imagen `postgres:17` (paso 5.2) |
| `column "..." contains null values` durante synchronize | Datos viejos del dump chocan con columnas NOT NULL nuevas | Truncar tablas transaccionales (paso 5.3) |
| SPA carga pero API responde 502 | `host.docker.internal` en nginx del frontend (no resuelve en Linux) | Ya corregido en repo; rebuild del frontend |
| Errores de CORS / WebSocket no conecta | `CORS_ORIGINS`/`APP_URL` con dominio equivocado — ojo: `environment:` del compose pisa a `backend/.env` | Definirlos en `.env` de la raíz o en los defaults del compose |
| Cert SSL no renueva | Plantilla proxy sin passthrough ACME | Ya incluido en `reportacasos.tpl/.stpl` (`/.well-known/acme-challenge/`) |

## 9. Pendientes conocidos

- [ ] Atar el frontend a localhost en `docker-compose.yml`:
      `"127.0.0.1:${FRONTEND_PORT:-8095}:80"` (hoy 8095 queda expuesto al exterior).
- [ ] Regenerar `backend/BD/bd.sql` con dump fresco (ver nota del paso 5).
- [ ] Añadir `backend/BD/bd_plain.sql` a `.gitignore` o eliminarlo.
- [ ] Backups periódicos: `deploy/backup.sh` (ver `CONFIGURACION.md` §10).
