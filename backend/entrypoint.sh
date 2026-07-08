#!/bin/sh
set -e

export NODE_ENV=${NODE_ENV:-production}

exec node dist/src/main
