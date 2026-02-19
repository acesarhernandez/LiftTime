#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env not found in $ROOT_DIR"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p backups
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
OUTPUT_FILE="backups/workout_cool_${TIMESTAMP}.dump"

echo "Exporting PostgreSQL database to $OUTPUT_FILE ..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "$OUTPUT_FILE"

echo "Done."
echo "$OUTPUT_FILE"
