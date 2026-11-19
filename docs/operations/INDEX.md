# RAMSport documentation

All maintained product and engineering documentation belongs in this directory. This is the
server-backed build: the Next.js `/api/*` route handler stores accounts, projects, documents,
profiles and module snapshots in MongoDB (or a filesystem fallback for local development).

| Document | Purpose |
|---|---|
| [MANUAL.md](MANUAL.md) | Step-by-step user manual: start, sign in, and use every module |
| [APP_FLOW.md](APP_FLOW.md) | User journeys, state transitions and module boundaries |
| [AUTH.md](AUTH.md) | Server authentication, signed sessions and authorization matrix |
| [SECURITY.md](SECURITY.md) | Implemented controls and operating requirements |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Assets, boundaries, threats and residual risks |
| [RLS_POLICIES.md](RLS_POLICIES.md) | Account-scoping rules for server records |
| [ENV.md](ENV.md) | Environment variables |
| [BACKEND_SCHEMA.md](BACKEND_SCHEMA.md) | Server storage model (drivers, records and keys) |
| [TRD.md](TRD.md) | Technical requirements |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Delivery state and security milestones |
| [UI_UX_DESIGN.md](UI_UX_DESIGN.md) | Interaction and visual requirements |
| [DEPLOY.md](DEPLOY.md) | Vercel and Render hosting, MongoDB and backups |
| [STRUCTURE.md](STRUCTURE.md) | Repository layout and file-placement rules |
| [CHECKLIST.md](CHECKLIST.md) | Pre-release and regression checks |
| [PRODUCT_STATUS.md](PRODUCT_STATUS.md) | Beta scope, released modules and known constraints |
| [todolist.md](todolist.md) | Open decisions and limitations |
| [QUALITY_PLAN.md](QUALITY_PLAN.md) | Quality controls, responsibilities and release evidence |
| [TRACEABILITY.md](TRACEABILITY.md) | Requirements-to-implementation verification map |

Update the relevant document whenever a route, storage model, export, deployment step or
module status changes. Accessibility ownership must be assigned before production release;
the target is WCAG 2.2 AA with a Lighthouse accessibility floor of 90.

The files under `specifications/` are the original design record. Where they describe
browser storage, they are superseded historical records; the maintained documents above
describe the current server-backed build. Files under `docs/status/` and `docs/archive/`
are non-authoritative snapshots and must not be used as current release evidence.
