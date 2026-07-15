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

sed -i 's|</head>|<script src="env-config.js"></script></head>|' /usr/share/nginx/html/index.html

exec nginx -g 'daemon off;'
