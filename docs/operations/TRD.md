# Technical requirements document

RAMSport is a RAMS engineering web application supporting RBD, FTA, Data Register, Weibull,
MIL-HDBK-217F, FMEA/FMECA and, as modules mature, PM/CM, spare-parts analysis, RCIL, SCIL and
LCC.

This copy is the **server-backed build**: the Next.js `/api/*` route handler stores accounts,
projects, documents, profiles and module snapshots in MongoDB (production) or a filesystem
fallback (local development). The browser holds only a signed HttpOnly session cookie.

## Functional requirements

- Authenticated users manage project folders and `.rbd`, `.fta`, `.data`, `.wbl`, `.217f` and
  `.fmeca` files on the server.
- Every module originates its component list from the project Data Register.
- RBD/FTA editors, Weibull, MIL-217F and FMECA calculate and export traceable results.
- Profiles, uploaded photos and engineering files persist on the server across devices and
  redeploys.
- Administrators manage authorized accounts; standard users cannot access admin functions.
- Security-relevant user and administrator actions are attributable and auditable.

## Non-functional requirements

- API p95 target below 300 ms for metadata operations on a co-located database.
- WCAG 2.2 AA target and readable typography on 13-inch displays; phone layout at 390 px.
- MongoDB is the durable production store; the filesystem driver is a development fallback.
- Sessions are HMAC-signed, HttpOnly, SameSite=Lax cookies with an eight-hour expiry; every
  request re-resolves the account record.
- Ownership is enforced by row keys (`resource:accountId`) and is never accepted from a
  request body or query string.
- Writes use optimistic concurrency or a per-key queue plus atomic rename.
- Calculation engines require regression fixtures and independently checked reference cases.
- Production availability follows the hosting provider and MongoDB cluster.

## Stack

- Frontend: Next.js 16.4.2, React 19.3.1, TypeScript 5.7.
- API: `src/app/api/[...path]/route.ts` ? `src/server/api.ts`, Node.js runtime.
- Storage: MongoDB (`mongodb` driver) or the filesystem store in `src/server/store.ts`.
- Password hashing: PBKDF2-SHA-256, 310,000 iterations, 16-byte salt.
- Host integration: `next.config.ts` security headers; no `/api/*` rewrite.

Acceptance requires passing TypeScript, the workbench regression checks, a production build,
an API integration test (authentication, ownership isolation, traversal, admin gate,
cross-site rejection), module hydration, Data Register autosave, mobile layout and
accessibility checks. Back up the MongoDB database or the data directory; see
[DEPLOY.md](DEPLOY.md) and [SECURITY.md](SECURITY.md).
