#!/bin/sh
set -e

chown -R node:node /app/uploads 2>/dev/null || true

export NODE_ENV=${NODE_ENV:-production}

exec node dist/src/main
