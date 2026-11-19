# RAMSport ? Todo List

Open items for the server-backed build. Accounts and workspace data are stored on the server;
the browser holds only a signed HttpOnly session cookie.

## Decisions needed

- [ ] **Rotate the bootstrap credentials.** The built-in `siva905` administrator and the
      `test` / `test` and `user` / `user` accounts are still seeded automatically. Decide
      whether the test account should be disabled outside development and how the
      administrator password is rotated for a shared installation.
- [ ] **Confirm the production database.** Set `MONGODB_URI` and verify the driver against the
      real cluster; local verification used the filesystem fallback.
- [ ] **Confirm the EN 50126 table.** The frequency/severity/matrix implementation follows the
      inferred Annex C structure; validate against the licensed standard before using it as a
      certification basis.
- [ ] **Decide the audit retention period.** The trail keeps the last 200 events per account.
      Choose whether that is enough or whether export is required.
- [ ] **Decide whether to encrypt records at rest.** MongoDB/database encryption is delegated
      to the hosting provider; application-level encryption would raise the bar further.

## Known limitations

- [ ] There is no password reset, MFA, account lockout or per-session revocation. Rotating
      `RAMSPORT_SESSION_SECRET` revokes every session.
- [ ] The login rate limiter is per process and resets on restart.
- [ ] The filesystem fallback is ephemeral on serverless hosts.
- [ ] There is no per-account storage quota.
- [ ] No permanent automated end-to-end browser suite runs in this environment; regression
      checks are static plus runtime verification scripts kept outside the repository.
- [ ] The MongoDB driver has not been exercised against a live server.

## Follow-ups

- [ ] Add a script to generate a new PBKDF2 salt/hash pair for rotating the built-in
      administrator password.
- [ ] Add browser tests for login, logout, admin create/delete, cross-account access,
      expired sessions, traversal attempts, oversized uploads and rate limits.
- [ ] Add whole-workspace export/import for backup and migration.
- [ ] Add a storage-quota warning and cleanup flow in the file manager.
- [ ] Update `docs/operations/CHECKLIST.md` whenever the authentication or storage model
      changes again.

## Completed

- [x] Replaced browser storage with a server API and record store.
- [x] Added MongoDB support with a filesystem fallback for local development.
- [x] Preserved PBKDF2-SHA-256 hashes, seeded accounts and API response shapes.
- [x] Added row-level ownership: `resource:accountId`, with the account id from the session.
- [x] Added endpoint authorization and administrator role re-checks.
- [x] Added account-scoped path validation, size limits and a server audit trail.
- [x] Added signed HttpOnly session cookies and same-origin enforcement.
- [x] Added CSP, HSTS and the other security headers in `next.config.ts`.
- [x] Added Vercel and Render configuration and deployment docs.
- [x] Added the Weibull, MIL-217F and FMEA/FMECA modules.
- [x] Added the Data Register bridge for every module.
- [x] Added mobile layout fixes, scrollable toolbars and wrapping risk-matrix cells.
- [x] Updated regression checks to target the server-backed architecture.
