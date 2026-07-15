# Plan: Puerto 3001 + Configuración VDS con SSL

## 1. Cambiar puerto 3000 → 3001 en todos los archivos

### docker-compose.yml (3 cambios)
- Línea 40: `"127.0.0.1:3000:3000"` → `"127.0.0.1:3001:3001"`
- Línea 47: `http://localhost:3000/health` → `http://localhost:3001/health`
- Líneas 78, 80: ngrok comments `backend:3000` → `backend:3001`

### backend/.env (3 cambios)
- Línea 18: `PORT=3000` → `PORT=3001`
- Línea 33: `APP_URL=http://localhost:3000` → `http://localhost:3001`
- Línea 48: `MICROSOFT_REDIRECT_URI=...3000/...` → `...3001/...`

### backend/.env.example (3 cambios)
- Línea 21: `PORT=3000` → `PORT=3001`
- Línea 42: `APP_URL=http://localhost:3000` → `http://localhost:3001`
- Línea 64: `MICROSOFT_REDIRECT_URI=...3000/...` → `...3001/...`

### backend/Dockerfile (1 cambio)
- Línea 31: `EXPOSE 3000` → `EXPOSE 3001`

### backend/src/main.ts (2 cambios)
- Línea 17: `'http://localhost:3000'` → `'http://localhost:3001'`
- Línea 96: `PORT ?? 3000` → `PORT ?? 3001`

### backend/src/app.module.ts (1 cambio)
- Línea 56: `default(3000)` → `default(3001)`

### frontend/nginx.conf (1 cambio)
- Línea 2: `server backend:3000;` → `server backend:3001;`

### frontend/proxy.conf.json (13 cambios)
- Todas las entradas `"target": "http://localhost:3000"` → `"target": "http://localhost:3001"`
- Se puede usar replaceAll

### frontend/src/environments/environment.ts (2 cambios)
- Línea 3: `apiUrl: 'http://localhost:3000'` → `'http://localhost:3001'`
- Línea 4: `wsUrl: 'http://localhost:3000'` → `'http://localhost:3001'`

### ngrok.yml (1 cambio)
- Línea 5: `addr: 3000` → `addr: 3001`

### deploy/setup-vps.sh (1 cambio)
- Línea 60: `http://localhost:3000/health` → `http://localhost:3001/health`

### start.ps1 (1 cambio)
- Línea 60: `http://localhost:3000` → `http://localhost:3001`

### 4 archivos backend con fallback URL (1 cambio cada uno)
- `backend/src/advisor-whatsapp/teams-meetings.service.ts:423`
- `backend/src/advisor-whatsapp/advisors-whatsapp.service.ts:2771`
- `backend/src/comunicados/comunicados.service.ts:76`
- `backend/src/documentos/documentos.controller.ts:76`
- Todos: `'http://localhost:3000'` → `'http://localhost:3001'`

---

## 2. Configuración Nginx para VDS con SSL

### deploy/nginx-host.conf (reescribir con SSL)
```nginx
# ─── Nginx del HOST con SSL ──────────────────────────────
# Instalación: sudo cp deploy/nginx-host.conf /etc/nginx/sites-available/chat
#              sudo ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/
#              sudo nginx -t && sudo systemctl reload nginx
# ─────────────────────────────────────────────────────────

# ── HTTP → HTTPS redirect ────────────────────────────────
server {
    listen 80;
    server_name midominio.com;
    return 301 https://$host$request_uri;
}

# ── HTTPS ─────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name midominio.com;

    ssl_certificate     /etc/letsencrypt/live/midominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/midominio.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 50M;
    server_tokens off;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:8095;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### deploy/setup-vps.sh (actualizar con SSL)
Agregar al script existente entre pasos [3] y [4]:
```bash
# ── 3b. SSL con Let's Encrypt ──────────────────────────────
echo "[3b] Configurando SSL con Let's Encrypt..."
apt install -y certbot python3-certbot-nginx

# Reemplazar midominio.com con tu dominio real
certbot --nginx -d midominio.com --non-interactive --agree-tos -m admin@midominio.com

# Renovación automática
systemctl enable --now certbot.timer
```

---

## 3. Rutas que Nginx proxy al backend

Todas las rutas que el frontend Nginx (`frontend/nginx.conf`) redirige al backend (`backend:3001`):

| Ruta | Propósito | Especial |
|------|-----------|----------|
| `/health` | Healthcheck Docker | — |
| `/ai/stream` | SSE streaming IA | `proxy_buffering off` |
| `/socket.io/` | WebSockets | `proxy_set_header Upgrade $http_upgrade` |
| `/auth/*` | Login, registro, refresh | — |
| `/sessions/*` | CRUD sesiones | — |
| `/advisors/*` | Asesores CRUD | — |
| `/advisors-whatsapp/*` | WhatsApp webhook | — |
| `/ai/*` | Chat IA | — |
| `/documentos/*` | PDF uploads | — |
| `/comunicados/*` | Comunicados | — |
| `/configuracion/*` | Config global | — |
| `/widget-config/*` | Config widget | — |
| `/track/*` | Tracking público | — |
| `/uploads/*` | Archivos estáticos | — |
| `/faq/*` | Preguntas frecuentes | — |
| `/tickets/*` | Tickets soporte | — |

---

## 4. Flujo de red completo

```
Usuario ──► Internet
                 │
           Host Nginx (puerto 443 SSL)
                 │ proxy_pass https://127.0.0.1:8095
                 ▼
      Frontend Container (Nginx, puerto 80)
           │              │              │
           ▼              ▼              ▼
    /socket.io ◄──► backend:3001    index.html (SPA)
    /ai/stream  ◄──► backend:3001
    /auth, etc. ◄──► backend:3001
```

---

## 5. Comandos para desplegar en VDS

```bash
# 1. Subir proyecto al VDS
scp -r . root@<IP>:/opt/chat

# 2. Conectarse al VDS
ssh root@<IP>

# 3. Ejecutar setup (instala Docker, Nginx, Certbot, SSL, y levanta contenedores)
cd /opt/chat && chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh

# 4. Reemplazar midominio.com en nginx-host.conf y setup-vps.sh con tu dominio real
```
