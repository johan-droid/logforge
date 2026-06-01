# LogForge

LogForge is a polycloud observability platform for connecting deployment providers, discovering services, and streaming live logs from one operational console.

## Product Scope

The canonical v1 scope is documented in [docs/V1_SCOPE.md](docs/V1_SCOPE.md).
If implementation details conflict with this README, use [docs/V1_SCOPE.md](docs/V1_SCOPE.md) as source of truth.

## Architecture

This repository is a PNPM + Turborepo monorepo.

- `apps/web`: Next.js 16 application for auth, provider onboarding, account menu, dashboard, and log UX.
- `apps/api`: Fastify service for session auth, provider credential vaulting, service discovery, polling, and SSE streaming.
- `packages/shared`: shared provider enums, contracts, and types.
- `packages/ui`: reusable UI components.

## Provider Support (v1)

- `render`: token + OAuth, app discovery, SSE available
- `vercel`: token + OAuth, app discovery, SSE available
- `heroku`: token + OAuth, app discovery, SSE available
- `cloudflare`: token + OAuth, Pages discovery, SSE available
- `railway`: token storage only (discovery/polling not yet implemented)

## Requirements

- Node.js `>= 18`
- PNPM `9.x`

## Quick Start

1. Install dependencies:

```sh
pnpm install
```

2. Configure API environment:

```sh
copy apps\api\.env.example apps\api\.env.local
```

3. Configure Web environment:

```sh
copy apps\web\.env.example apps\web\.env.local
```

4. Run all apps in development mode:

```sh
pnpm dev
```

Default ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## Environment Variables

Full templates:

- [apps/api/.env.example](apps/api/.env.example)
- [apps/web/.env.example](apps/web/.env.example)

Critical API keys:

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY` (must resolve to 32 bytes)
- `WEB_BASE_URL`

Critical Web keys:

- `API_PROXY_TARGET`
- `NEXT_PUBLIC_APP_NAME` (optional branding)

## Scripts

Root scripts:

```sh
pnpm --filter web prebuild
pnpm dev
pnpm lint
pnpm build
pnpm test
pnpm check-types
pnpm format
```

Targeted app scripts:

```sh
pnpm --filter web dev
pnpm --filter web test:watch
pnpm --filter api dev
pnpm --filter api build
```

## Deployment (Render)

This repository includes [render.yaml](render.yaml) for Blueprint-based deployment.

Provisioned services:

- `logforge-api`
- `logforge-web`

Deployment flow:

1. Create a Render Blueprint deployment connected to this repo.
2. Render reads [render.yaml](render.yaml) and provisions both services.
3. Set required environment variables in each service dashboard.
4. Redeploy both services after env values are configured.

## API Surface (Current)

- `GET /api/auth/me`
- `GET /api/providers`
- `GET /api/providers/:provider/apps`
- `GET /api/services`
- `GET /api/branches/:svcId`
- `GET /api/rate-limits`
- `GET /api/stream/:provider/:serviceId` (SSE)

## Security Notes

- Provider tokens are encrypted at rest.
- Auth relies on HTTP-only session cookies.
- OAuth state validation is enforced for callback flows.

For reporting vulnerabilities, see [SECURITY.md](SECURITY.md).

## CI and Quality Gates

GitHub Actions CI runs lint, build, and tests for pushes and pull requests via [ci.yml](.github/workflows/ci.yml).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and pull request expectations.
