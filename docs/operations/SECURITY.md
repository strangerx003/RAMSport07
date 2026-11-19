# Security policy

RAMSport is a server-backed application. The browser holds only a signed, HttpOnly session
cookie; every account, project, document, profile and module snapshot is stored and
authorized on the server.

## Trust boundary

The trust boundary is the Next.js `/api/*` route handler. It resolves the session cookie,
loads the account from the server directory and derives the owner account id from that
session. Request bodies and query strings never choose the account.

The filesystem fallback (used when `MONGODB_URI` is unset) trusts the host's disk. Protect
that directory and the MongoDB credentials at the operating-system level.

## Implemented controls

- Every `/api/*` endpoint except sign-in, sign-out and health resolves a live server session
  before doing work.
- Sessions are HMAC-SHA-256 signed tokens in an `HttpOnly`, `SameSite=Lax` cookie with an
  eight-hour expiry; the `Secure` flag follows HTTPS. Signatures are compared in constant
  time and the account is re-read on every request.
- The account id comes from the session, never from a request body or query string.
- Every record key is namespaced with the validated owner account id:
  `resource:accountId`, with `^[A-Za-z0-9_-]{1,80}$`.
- Administrator endpoints re-check the role against the stored account record.
- State-changing requests must be same-origin (`Origin`/`Sec-Fetch-Site`), in addition to the
  SameSite cookie.
- Passwords use PBKDF2-SHA-256 with 310,000 iterations and a 16-byte random salt, and are
  compared in constant time.
- Login attempts are throttled per username in a 15-minute window; the limiter is bounded.
- File names and paths reject traversal, control characters and unknown extensions.
- Documents are limited to 2 MB, profile photos to 5 MB and only PNG, JPEG or WebP are
  accepted and served back.
- Workspace scratchpads are limited to 5 MB and reject path-traversal keys.
- Audit actions are allow-listed, and `admin.*` audit actions require an administrator.
- Built-in accounts cannot be removed, so the workspace cannot lose its administrator.
- Responses from the API are marked `Cache-Control: no-store`.
- The deployment sends CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP and CORP headers. Production CSP does not
  allow `unsafe-eval`.

## Storage

- Primary store: MongoDB database `ramsport`, collection `records`.
- Fallback: atomic JSON files under `RAMSPORT_DATA_DIR/records/`.
- Session state: signed `ramsport_session` cookie only. No localStorage, sessionStorage or
  IndexedDB is used for application data.
- The theme preference is a first-party `ramsport-theme` cookie.

## Operational guidance

- Serve the app over HTTPS. The security headers include HSTS, but a host that terminates
  TLS must forward the request as HTTPS.
- Set `MONGODB_URI` in production. The filesystem fallback is not durable on serverless
  hosts and the server logs a warning when it is used there.
- Set `RAMSPORT_SESSION_SECRET` to a random value of at least 32 characters. Rotating it
  signs every user out.
- Restrict network access to the MongoDB cluster and use a least-privilege database user.
- Back up the database or the data directory; there is no built-in backup job.
- Do not add third-party scripts to the page. The CSP allows inline scripts because Next.js
  hydrates the app with them; adding remote scripts would weaken the boundary further.
- Report a vulnerability privately to the repository owner rather than opening a public
  issue with exploit details.
