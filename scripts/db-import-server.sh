#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/workout_cool_YYYYMMDD_HHMMSS.dump"
  exit 1
fi

DUMP_FILE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

if [[ ! -f ".env" ]]; then
  echo ".env not found in $ROOT_DIR"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Importing dump into ${POSTGRES_DB} ..."
docker compose up -d postgres

cat "$DUMP_FILE" | docker compose exec -T postgres pg_restore \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges

echo "Done."
