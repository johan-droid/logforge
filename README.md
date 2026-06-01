# LogForge

LogForge is an observability console designed to stream and inspect live deployment logs across cloud providers from a unified, low-latency interface.

## Monorepo Layout

This project is a Turborepo-managed monorepo:

- **`apps/web`**: Next.js 16 dashboard application using standard styling and modern typography.
- **`apps/api`**: Fastify backend coordinator managing session authentication, credential vaulting, polling budgets, and SSE log streaming.
- **`packages/shared`**: Common type schemas, providers, and shared constants.
- **`packages/ui`**: Base design system primitives.

## Features

- **Stateless Log streaming (Secure Valve)**: Direct observation using API tokens strictly in volatile memory. Discarded automatically on disconnect.
- **Polycloud Support**: Native logs streaming engines for Vercel, Heroku, Cloudflare Pages, Railway, and Render.
- **Unified Observation**: Automatically polls and aggregates logs across all active services of a cloud integration under one viewport.
- **Observed Budget Limits**: Intelligent polling schedule limits rate usage to protect provider API quotas.

## Getting Started

### 1. Install Dependencies
```sh
pnpm install
```

### 2. Configure Environment Files
Set up localized configurations for both the API service and the web app:

```sh
# API Service
copy apps\api\.env.example apps\api\.env.local

# Web Interface
copy apps\web\.env.example apps\web\.env.local
```

### 3. Run Development Server
```sh
pnpm dev
```

The services will launch on:
- Web console: `http://localhost:3000`
- API gateway: `http://localhost:3001`

## API Routing

- `/api/auth/me` — Current user session verification.
- `/api/providers` — Configured cloud integrations list.
- `/api/services` — Discovered user applications.
- `/api/stream/:provider/:serviceId` — SSE live log pipe.
- `/api/valve/apps` — Stateless app discovery.
- `/api/valve/ticket` — Generate single-use connection ticket.
- `/api/valve/stream` — Ephemeral SSE live log pipe.

## Security Controls

- Integration tokens saved to the database are encrypted at rest using AES-256-GCM.
- Session authorization relies on HTTP-only cookies.
- Single-use, ticket-based handshake for SSE keeps tokens out of browser address bars.

For security reports, please refer to [SECURITY.md](SECURITY.md).
