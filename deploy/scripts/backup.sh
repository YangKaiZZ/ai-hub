#!/usr/bin/env bash
# Dumps the database to backups/ai_hub-<date>.sql.gz and keeps the newest 14.
# Uploaded files live in the aihub-storage volume and are NOT in this dump;
# see README.md for the volume backup line.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups

file="backups/ai_hub-$(date +%Y%m%d-%H%M%S).sql.gz"
# A half-written dump is worse than none: delete it if anything fails.
trap 'rm -f "$file"' ERR

docker compose exec -T db sh -c \
  'exec pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$file"

ls -1t backups/ai_hub-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Saved $file"
