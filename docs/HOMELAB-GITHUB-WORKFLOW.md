# Homelab + GitHub Manual Deploy Workflow

This workflow keeps development and production cleanly separated:

- Local machine (`Codex` / `VS Code`) = development
- GitHub = source of truth for code history
- Homelab server (`docker compose`) = runtime service

## 1) Local development and GitHub

1. Make changes locally.
2. Commit locally:

```bash
git add -A
git commit -m "Describe your change"
```

3. Push to GitHub:

```bash
git push origin main
```

Nothing is uploaded automatically on file save. Code is only published after `git commit` + `git push`.

## 2) Manual server update (pull + migrate + restart)

On the server, from the repo directory:

```bash
bash scripts/homelab-manual-update.sh /path/to/workout-cool
```

This does:

1. `git pull` latest code
2. Ensure Postgres container is running
3. Run `prisma migrate deploy`
4. Rebuild/restart `workout_cool` container

## 3) Transfer local DB data to server DB

### Export locally

```bash
bash scripts/db-export-local.sh
```

This creates a dump in `backups/` and prints the file path.

### Copy dump to server

Example:

```bash
scp backups/workout_cool_YYYYMMDD_HHMMSS.dump user@server:/path/to/workout-cool/backups/
```

### Import on server

```bash
bash scripts/db-import-server.sh /path/to/workout-cool/backups/workout_cool_YYYYMMDD_HHMMSS.dump
```

## 4) Notes

- Database data is **not** stored in GitHub.
- GitHub stores code history only.
- Keep `.env` private (already ignored by `.gitignore`).
