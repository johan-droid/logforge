# Security Policy

Observability requires handling sensitive credentials. We aim to keep your integration tokens and logs secure at all times.

## Reporting Vulnerabilities

Do not open public GitHub issues for security vulnerabilities. If you discover a security issue, please email us directly at **sahooashutosh2022@gmail.com** with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- If possible, any suggested patches or mitigations.

We will acknowledge receipt of your report within 48 hours and coordinate a disclosure timeline.

## Data Handling & Storage Policy

LogForge is designed to minimize the storage of sensitive secrets. Depending on your configuration, we offer two modes:

### 1. Default DB-Backed Observability
- **Encryption at Rest**: Provider access tokens are encrypted in the database using AES-256-GCM.
- **Key Separation**: Encryption keys are managed via the host environment (`ENCRYPTION_KEY`) and are never written to the database.
- **Salt & IV**: Every encrypted credential uses a unique Initialization Vector (IV) and stores its authentication tag to prevent tampering.

### 2. Secure Valve (Stateless Bypass Mode)
- **Zero-Storage**: Credentials provided through the Secure Valve are never written to the database, logs, or persistent disk.
- **Volatile Execution**: The keys live strictly in application memory (RAM) to authorize requests and are immediately deleted when the live stream disconnects.
- **Short-Lived Tickets**: We use single-use, 10-second ticket tokens (`ticketId`) to establish Server-Sent Events (SSE) connections. This avoids passing raw tokens in URL parameters or query strings.

## Session & Transport Security

- **Transit Security**: All connections must be served over HTTPS.
- **Auth Cookies**: Client session cookies are marked `HttpOnly`, `Secure`, and `SameSite=Lax` to mitigate XSS and CSRF risks.
- **OAuth Callbacks**: OAuth integrations validate unique, cryptographically secure `state` parameters to prevent authorization hijacking.
