# Contributing to LogForge

## Prerequisites

- Node.js >= 18
- PNPM 9

## Local Development

1. Install dependencies:

```sh
pnpm install
```

2. Configure environment files:

```sh
copy apps\api\.env.example apps\api\.env.local
copy apps\web\.env.example apps\web\.env.local
```

3. Start development:

```sh
pnpm dev
```

## Quality Gates

Before opening a pull request, run:

```sh
pnpm lint
pnpm build
pnpm test
```

## Branch and PR Guidelines

- Keep changes focused and small.
- Include a clear problem statement and solution summary in PR description.
- Add or update tests when behavior changes.
- Update docs for user-facing or operational changes.

## Commit Guidance

Use clear, imperative commit messages, for example:

- `feat(web): add provider health card`
- `fix(api): validate oauth callback state`
- `docs: update render deployment section`

## Security

Do not commit secrets, local databases, or generated artifacts.
If you discover a vulnerability, follow [SECURITY.md](SECURITY.md).
