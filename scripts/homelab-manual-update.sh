#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-$(pwd)}"
BRANCH="${BRANCH:-main}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Git repository not found at: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "[1/5] Fetching latest code from origin/$BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[2/5] Ensuring Postgres is up..."
docker compose up -d postgres

echo "[3/5] Applying Prisma migrations..."
docker compose run --rm workout_cool pnpm prisma migrate deploy

echo "[4/5] Rebuilding and restarting app..."
docker compose up -d --build workout_cool

echo "[5/5] Current container status:"
docker compose ps

echo "Manual update complete."
