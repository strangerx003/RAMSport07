# Authentication and authorization

## Design

Credentials are verified by the server at `POST /api/auth/login`. Passwords use
PBKDF2-SHA-256 with 310,000 iterations and a unique salt, matching the hashes issued by the
original ASP.NET Core service. A successful login returns a signed session token in an
`HttpOnly` cookie named `ramsport_session` with an eight-hour expiry.

The token payload holds the account id, username, role, issued-at and expiry, and is signed
with HMAC-SHA-256. `verifySessionToken()` checks the signature in constant time and the
expiry. Every request then calls `requireUser()`, which re-reads the server account
directory and confirms that the account still exists and is active. Administrator endpoints
call `requireUser(true)` and re-check the role.

Identity and account ownership always come from the signed cookie. No endpoint accepts an
`accountId` from the request.

## Cookie flags

- `HttpOnly` ? not readable from JavaScript.
- `SameSite=Lax` ? blocks cross-site subresource requests.
- `Secure` ? set when the request is HTTPS (directly or via `X-Forwarded-Proto`), or when
  `RAMSPORT_COOKIE_SECURE=true`.
- `Max-Age` ? eight hours, matching the signed expiry.

State-changing requests additionally require a same-origin `Origin` or `Sec-Fetch-Site`.

## Row-level ownership

Records are stored under keys of the form `resource:accountId`:

- `files:<accountId>`
- `profile:<accountId>`
- `save-locations:<accountId>`
- `audit:<accountId>`
- `workspace:<accountId>:<key>`

The account id must match `^[A-Za-z0-9_-]{1,80}$`. Because the key is built from the
session, a caller cannot read or write another account's rows by changing a request.

## Rules

- Return 401 when there is no valid session or the account no longer exists.
- Return 403 for an authenticated account that lacks the administrator role.
- Never accept `accountId`, user id or role from the browser as authorization evidence.
- Never log passwords, hashes or salts.
- Keep built-in accounts non-removable.
- The **Test access** card on the sign-in page is an explicit, build-time choice for
  evaluation builds (`NEXT_PUBLIC_SHOW_TEST_ACCESS`). Set it to `off` for a public
  production release; do not add any other credential hint.
- Sign-out clears the cookie; changing `RAMSPORT_SESSION_SECRET` invalidates every session.

## Limits

The server is the trust boundary, but it inherits the host's security. Protect the MongoDB
credentials, the session secret and the filesystem data directory. There is no MFA,
self-service password reset or per-session revocation list; rotating the signing secret
revokes all sessions. See [SECURITY.md](SECURITY.md).
