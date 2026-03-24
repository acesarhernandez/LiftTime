<div align="center">
  <img src="public/logo.png" alt="LiftTime Logo" width="120" height="120" />
  <h1>LiftTime</h1>
  <p><em>Open-source fitness coaching platform</em></p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" /></a>
  </p>
</div>

## Overview

LiftTime is a modern fitness app for building workouts, tracking sessions, and monitoring progress over time.

## Core Features

- Workout builder with exercise selection and session flow
- Progress tracking and statistics
- Multi-language interface
- Email/password authentication
- Optional Keyholder (Authentik) SSO integration
- Self-host friendly Docker setup

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Better Auth
- Tailwind CSS + shadcn/ui + daisyUI

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker (recommended)

### 1) Clone

```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

### 2) Configure env

```bash
cp .env.example .env
```

### 3) Start with Docker (recommended)

```bash
docker compose up -d --build
```

Then open [http://localhost:3000](http://localhost:3000).

## Local Dev (without Docker)

1. Install dependencies:

```bash
pnpm install
```

2. Ensure PostgreSQL is running and update `DATABASE_URL` in `.env`.
3. Run migrations:

```bash
npx prisma migrate dev
```

4. Start dev server:

```bash
pnpm dev
```

## Useful Commands

```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # lint checks
pnpm db:seed      # seed sample exercise data
```

## Authentication Notes

- Default auth is email/password.
- For Authentik (OIDC), configure provider/client values in `.env`.
- Keep production callback URLs aligned with your deployed domain.

## Documentation

- Self-hosting: [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)
- Homelab workflow: [docs/HOMELAB-GITHUB-WORKFLOW.md](docs/HOMELAB-GITHUB-WORKFLOW.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
