# Implementation plan

## Completed foundation

- Server API in `src/server/api.ts` behind the `/api/[...path]` Node.js route handler.
- Server record store in `src/server/store.ts`: MongoDB when `MONGODB_URI` is set, otherwise
  atomic filesystem JSON under `RAMSPORT_DATA_DIR`.
- Optimistic concurrency in MongoDB and a per-key queue plus atomic rename on the filesystem.
- Signed HttpOnly session cookies (`src/server/session.ts`) with an eight-hour expiry,
  constant-time signature checks and same-origin enforcement for state changes.
- Built-in account seeding (`siva905`, `test`, `user`) with the original PBKDF2-SHA-256
  salts and hashes.
- Row-level ownership: every record key is `resource:accountId`, and the account id always
  comes from the signed session.
- Validated paths, filename rules, document, photo and scratchpad size limits, and bounded
  login throttling.
- Server audit trail per account, bounded to the last 200 events.
- Browser-side admin route guard.
- Security headers in `next.config.ts` (CSP, HSTS, nosniff, framing, referrer, permissions,
  COOP/CORP); production CSP omits `unsafe-eval`.
- Vercel and Render configuration, deployment docs and regression checks.
- Module workbenches: RBD, FTA, Weibull (IEC 61649), MIL-HDBK-217F and FMEA/FMECA with
  EN 50126-1:2017 risk assessment.
- Data Register bridge: every module resolves components from the project register.
- Mobile layout, scrollable workbench toolbars and wrapping risk-matrix cells.
- Avatar mirroring for bundled line-art illustrations only.

## Next security milestones

1. Validate the MongoDB driver against the production cluster (only the filesystem driver has
   been exercised locally).
2. Add password change/reset, account lockout and forced sign-out for all sessions.
3. Add MFA if the product is used beyond a trusted corporate network.
4. Add a permanent automated end-to-end suite for 401/403, cross-account access, expired
   sessions, traversal, oversized uploads, rate limits and administrator boundaries.
5. Add whole-workspace export/import for backup and migration.
6. Add per-account storage quotas and a cleanup flow.
7. Rotate the bootstrap credentials before any shared or public deployment.

No production release should claim completion while roadmap controls relevant to its
deployment remain untested or while default bootstrap credentials remain unchanged.

See [SECURITY.md](SECURITY.md) for the trust boundary: the server authorizes every request,
but it inherits the security of its host, database credentials and data directory.
