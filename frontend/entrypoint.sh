#!/bin/sh
set -e

CONFIG_FILE=/usr/share/nginx/html/env-config.js

cat > "$CONFIG_FILE" <<EOF
window.__ENV__ = {
  apiUrl: '${API_URL:-/agora}',
  wsUrl: '${WS_URL:-}',
  apiKey: '${API_KEY:-token2025}',
};
EOF

exec nginx -g 'daemon off;'
