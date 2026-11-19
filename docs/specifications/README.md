# Reference specifications

The documents in this folder are the **original design record**. They describe earlier
architectures: a browser-only (localStorage/IndexedDB) build and, before that, a Next.js +
ASP.NET Core 8 + MongoDB reference build. They are kept for historical context.

They are **not** an accurate description of the current build in this folder. Where a
statement mentions localStorage, IndexedDB, the ASP.NET Core API, `backend/`,
`RAMSPORT_API_URL`, `RAMSPORT_USER_DATA_DIR`, static export or GitHub Pages, read it as a
reference to an earlier architecture rather than to this deployment.

For the current server-backed build, use:

| Document | Purpose |
|---|---|
| [../operations/TRD.md](../operations/TRD.md) | Current technical requirements |
| [../operations/APP_FLOW.md](../operations/APP_FLOW.md) | Current user journeys |
| [../operations/AUTH.md](../operations/AUTH.md) | Server authentication, signed sessions and authorization |
| [../operations/SECURITY.md](../operations/SECURITY.md) | Trust boundary and implemented controls |
| [../operations/RLS_POLICIES.md](../operations/RLS_POLICIES.md) | Account-scoped row rules |
| [../operations/BACKEND_SCHEMA.md](../operations/BACKEND_SCHEMA.md) | Server storage model (MongoDB / filesystem) |
| [../operations/STRUCTURE.md](../operations/STRUCTURE.md) | Repository layout |
| [../operations/DEPLOY.md](../operations/DEPLOY.md) | Vercel and Render hosting with MongoDB |

The UI/UX design document (`03_UI_UX_Design_Document.md`) remains broadly valid because the
interface is unchanged; only the persistence and authorization notes are historical.
