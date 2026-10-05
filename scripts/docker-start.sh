#!/bin/sh
set -e

echo "[ai-hub] applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  echo "[ai-hub] seeding demo data..."
  # Seeding is optional scaffolding. If it fails, say so loudly and serve anyway:
  # a broken seed must not become a restart loop that takes the whole site down.
  if npx tsx prisma/seed.ts; then
    echo "[ai-hub] demo data ready"
  else
    echo "[ai-hub] WARNING: seeding failed; starting the server anyway."
    echo "[ai-hub] Retry by hand with: docker compose exec app npx tsx prisma/seed.ts"
  fi
fi

echo "[ai-hub] starting server on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
