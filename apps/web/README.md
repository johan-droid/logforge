# LogForge Web

This app is the LogForge frontend built with Next.js 16 and the App Router.

## Commands

```sh
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test
pnpm --filter web test:watch
```

## Env

The web app reads [apps/web/.env.example](/D:/Logforge/apps/web/.env.example:1).

- `NEXT_PUBLIC_API_BASE_URL`: API base URL, defaults to `http://localhost:3001`
- `NEXT_PUBLIC_API_BASE`: legacy fallback key (still supported)
- `NEXT_PUBLIC_APP_NAME`: display label for the app

## Routes

- `/`: landing page and Google sign-in entry
- `/dashboard`: connected services and log viewer
- `/settings`: provider credential and OAuth connection screen
- `/account`: authenticated user menu with session actions
- `/auth/callback`: fallback redirect page to `/dashboard` (session is cookie-based)

## Auth model

- The web app relies on API-issued HTTP-only session cookies.
- It does not store auth tokens in `localStorage`.

For full workspace setup and v1 scope lock, see:

- [README.md](/D:/Logforge/README.md:1)
- [docs/V1_SCOPE.md](/D:/Logforge/docs/V1_SCOPE.md:1)
