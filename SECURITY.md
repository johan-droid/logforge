# Security Policy

## Supported Scope

Security reports are accepted for all applications and packages in this repository.

## Reporting a Vulnerability

Please report vulnerabilities privately and include:

- A clear description of the issue
- Reproduction steps
- Potential impact
- Suggested mitigation (if available)

Do not open public issues for unpatched vulnerabilities.

## Handling Secrets

- Never commit `.env` files.
- Never commit provider API tokens or OAuth credentials.
- Rotate any secret immediately if exposure is suspected.

## Current Security Controls

- Provider tokens are encrypted at rest.
- Session auth uses HTTP-only cookies.
- OAuth state validation is enforced on callbacks.
