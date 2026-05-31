# LogForge V1 Scope Contract

Status: Active
Last updated: 2026-05-31

This file locks product and implementation scope for LogForge v1.
Use this as the source of truth for Phase 3+ implementation work.

## Objective

Deliver a working single-user observability MVP that can:

- authenticate a user with cookie-based sessions
- store provider credentials securely
- discover provider apps/services where implemented
- open an SSE log stream for selected provider + service

## Provider support tiers

### Tier A (v1 implemented path)

- `render`: token + OAuth credential connect, app discovery endpoint, stream route available
- `vercel`: token + OAuth credential connect, app discovery endpoint, stream route available
- `heroku`: token + OAuth credential connect, app discovery endpoint, stream route available
- `cloudflare`: token + OAuth credential connect, Pages app discovery endpoint (account id required), stream route available

### Tier B (v1 partial only)

- `railway`: token can be stored, but service discovery, polling, and live logs are not in v1

## Auth and session model (locked)

- session auth is cookie-first using `logforge_session` (HTTP-only, SameSite=Lax)
- Google OAuth callback issues the session cookie
- dev login route (`POST /api/auth/login`) is allowed for local testing
- OAuth CSRF state is mandatory for `GET /api/auth/google` -> `GET /api/auth/google/callback`
- OAuth CSRF state is mandatory for `GET /api/providers/:provider/auth` -> `GET /api/providers/:provider/callback`
- callback requests without valid state are rejected

## Credential model (locked)

- credentials are encrypted at rest using AES-256-GCM
- each credential row references a persisted user row
- session user persistence is required before credential writes

## Log persistence model (locked for v1)

- v1 log UX is ephemeral streaming
- frontend keeps a per-service in-memory buffer capped at 5000 lines
- backend persistent log history is out of scope for v1 APIs
- existing `logs` table and cleanup job are treated as non-v1 internal artifacts until history APIs exist

## APIs in scope for v1 delivery

- `POST /api/auth/login`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/auth/logout`
- `GET /api/providers`
- `GET /api/providers/:provider/auth`
- `GET /api/providers/:provider/callback`
- `GET /api/providers/:provider/apps`
- `GET /api/credentials`
- `POST /api/credentials`
- `DELETE /api/credentials/:id`
- `GET /api/services`
- `GET /api/branches/:svcId`
- `GET /api/rate-limits`
- `GET /api/stream/:provider/:serviceId`

## Background sync behavior (Phase 4)

- provider service discovery is executed by a background coordinator
- bootstrap runs one sync pass at API startup using stored credentials
- recurring sync jobs are scheduled per credential using the polling scheduler
- adding/removing credentials refreshes scheduler jobs automatically
- `/api/services` reads from persisted `services` rows instead of discovering on every request

## Non-goals for v1

- multi-user tenant sharing
- historical log search UI
- branch manifest UI and backend sync
- provider polling scheduler parity across all providers
