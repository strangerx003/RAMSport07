# RAMSport

Reliability, availability, maintainability and safety workbench for RBD, FTA, Weibull,
MIL-HDBK-217F prediction, FMEA/FMECA and the project Data Register.

This is the **server-backed build**. Accounts, projects, documents, profiles, remembered
locations and module snapshots are stored on the server. The browser only holds a signed,
HttpOnly session cookie; it writes nothing to localStorage, sessionStorage or IndexedDB.

## Start

```sh
npm ci
npm run dev
```

Open <http://localhost:3000/>. For a production build:

```sh
npm run build
npm run start
```

Node.js 20 or newer is required.

Without `MONGODB_URI` the server uses a local JSON store under `.ramsport-data/`, which is
enough for development and single-machine installs. **Set `MONGODB_URI` before deploying to
Vercel or any host without a persistent disk** — otherwise data is lost on redeploy. See
[.env.example](.env.example) and [docs/operations/ENV.md](docs/operations/ENV.md).

## Sign in

The public landing page is at `/`. Sign in at `/login`.

- The built-in administrator account opens `/admin` directly.
- Administrators create and remove accounts from the **Admin** tab in the sidebar.
- Built-in accounts are seeded on first use and cannot be removed, so the workspace can
  always be opened again.
- The sign-in card shows a **Test access** hint (`test` / `test`) for evaluation and QA,
  with a one-click **Use test credentials** button. Set `NEXT_PUBLIC_SHOW_TEST_ACCESS=off`
  and rebuild to hide it on a public production site.

## How it works

```text
Browser
  └── Next.js 16 UI  ──HTTPS──▶  /api/* route handler (Node runtime)
                                   ├── src/server/api.ts       endpoints + ownership
                                   ├── src/server/session.ts   signed HttpOnly cookie
                                   ├── src/server/users.ts     account directory
                                   └── src/server/store.ts     MongoDB or filesystem store
```

The browser calls a same-origin `/api/*` contract:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET|POST|PATCH|DELETE /api/files`
- `GET|PUT /api/files/content`
- `GET|POST|DELETE /api/profile`, `GET /api/profile/image`
- `GET|POST /api/save-locations`
- `GET|PUT /api/workspace`
- `POST /api/audit`
- `GET|POST /api/admin/users`, `DELETE /api/admin/users/{id}`
- `GET /api/health`

Every record is keyed by the signed-in account (`resource:accountId`). The account id is
always taken from the signed session cookie — never from a request body. Administrator
endpoints re-check the role. Path validation, filename rules and document-size limits are
enforced on the server.

### Storage

- **MongoDB** when `MONGODB_URI` is set. This is the production driver.
- **Filesystem** otherwise: atomic JSON records under `RAMSPORT_DATA_DIR` (default
  `.ramsport-data/`, or a temp directory on Vercel). Not durable on serverless hosts.

Writes use optimistic concurrency in MongoDB and a per-key queue plus atomic rename on the
filesystem, so two simultaneous saves cannot silently overwrite each other.

## Modules

| Module | Route | Standard |
|---|---|---|
| Data Register | `/data-register` | Project component source of truth |
| Reliability Block Diagram | `/rbd` | IEC 61078 |
| Fault Tree Analysis | `/fta` | IEC 61025 |
| Weibull Analysis | `/weibull` | IEC 61649 |
| RAM Prediction | `/mil-std-217f` | MIL-HDBK-217F (Notice 2) |
| FMEA / FMECA | `/fmeca` | EN 50126-1:2017 · MIL-STD-1629A |

Every module originates its components from the project Data Register. Project files are
plain folders, so documents can live wherever the user creates them; the resolver finds the
project's `.data` register and falls back to a saved register snapshot only when none exists.

## Deploy

### Vercel

1. Push this folder to a Git repository.
2. Import it in Vercel. Framework preset: **Next.js**.
3. Set `MONGODB_URI` (and preferably `RAMSPORT_SESSION_SECRET`) in the project environment.
4. Deploy.

`vercel.json` pins the framework and commands. Security headers are defined in
`next.config.ts`.

### Render

Apply `render.yaml` or create a **Web Service**:

- Build command: `npm ci && npm run build`
- Start command: `npm run start -- -p $PORT`
- Set `MONGODB_URI` and `RAMSPORT_SESSION_SECRET` in the service environment.

A static site or GitHub Pages deployment cannot run the `/api/*` route handler. This build
requires a Node.js host plus a durable database.

## Workspace

The dashboard is a server-backed file manager for the signed-in account. It behaves like
Windows Explorer: **New project**, **New folder** and **New document** create the entry with
a unique default name and immediately turn its row into an inline name field — no popup.
`Enter` or clicking elsewhere saves the name, `Escape` cancels, and files keep their
extension while only the base name is selected. The tree also offers search, keyboard
navigation (`F2` rename, `Delete` delete, arrow/Home/End/Enter control), a right-click menu
with an **New** submenu, and a `?folder=1/RBD` deep link.

Opening a document puts its path in the address bar, for example
`/rbd?project=Line%201&file=Line%201/RBD/Line%201.rbd`. The editor loads that file from the
server, autosaves changes after a short debounce, and writes back when the page is closed.

The account menu opens **Profile**, where the display name can be changed and an optional
PNG, JPEG or WebP photo (up to 5 MB) can be uploaded, replaced or removed. Bundled line-art
avatars are mirrored so the character faces left; uploaded photos are never mirrored.

## Structure

- `src/app` — Next.js routes and the `/api/[...path]` handler
- `src/server` — API endpoints, session cookies, accounts, password hashing, record store
- `src/components` — React components: `marketing`, `auth`, `layout`, `files`, `documents`, `profile`, `rbd`, `fta`, `weibull`, `mil217f`, `fmeca`, `lcc`, `spares`, `reporting`, `ui`, `system`
- `src/engine` — pure calculation and geometry, no React
- `src/services` — document client, project-register bridge, auth clients
- `src/data` — stored models and module document shapes
- `src/lib` — base path, icons, document URL context, formatting and viewport hooks
- `src/styles` — all CSS
- `scripts/` — regression checks plus `scripts/diagnostics/` for CDP and DOM tooling
- `docs/` — all project documentation:
  - `docs/specifications/` — TRD, app flow, UI/UX, schema, plan and architecture
  - `docs/operations/` — operations, security, deployment and product notes
  - `docs/status/` — historical build and UI status records (non-authoritative)
  - `docs/archive/` — historical audits and design references
- `compliance/` — standards compliance matrix and evidence

## Verification

```sh
npm run check
```

## Documentation

| File | Contents |
|---|---|
| [docs/operations/MANUAL.md](docs/operations/MANUAL.md) | Step-by-step user manual |
| [docs/operations/INDEX.md](docs/operations/INDEX.md) | Documentation map and ownership |
| [docs/operations/APP_FLOW.md](docs/operations/APP_FLOW.md) | User journeys and engineering workflow |
| [docs/operations/STRUCTURE.md](docs/operations/STRUCTURE.md) | Folder map and where new files belong |
| [docs/operations/DEPLOY.md](docs/operations/DEPLOY.md) | Hosting, environment and backups |
| [docs/operations/SECURITY.md](docs/operations/SECURITY.md) | Security model and limits |
| [docs/operations/CHECKLIST.md](docs/operations/CHECKLIST.md) | Release gates |
| [docs/DEPLOYMENT_READINESS.md](docs/DEPLOYMENT_READINESS.md) | Build, security audit and deployment status |
| [docs/specifications/README.md](docs/specifications/README.md) | Technical requirements, app flow, UI/UX, schema, plan and architecture |
| [compliance/compliance-matrix.md](compliance/compliance-matrix.md) | Standards compliance matrix and evidence |
