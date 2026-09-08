#!/bin/sh
set -e

echo "[ai-hub] applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  echo "[ai-hub] seeding demo data..."
  npx tsx prisma/seed.ts
fi

echo "[ai-hub] starting server on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
