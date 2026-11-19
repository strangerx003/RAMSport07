# Deployment

RAMSport is a Next.js application with a server-side `/api/*` route handler. It needs a
Node.js host and a durable database. Accounts, projects, documents, profiles and module
snapshots are stored on the server; the browser only holds an HttpOnly session cookie.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A MongoDB database for production (`MONGODB_URI`), or a persistent disk for the
  filesystem fallback

## Local production build

```sh
npm ci
npm run build
npm run start
```

The app is served at <http://localhost:3000/>. Without `MONGODB_URI` it writes to
`.ramsport-data/`; that is fine for a single machine but not for a serverless host.

## Vercel

1. Push this folder to a Git repository.
2. In Vercel, choose **Add New ? Project** and import the repository.
3. Keep the detected framework as **Next.js**.
4. Build command: `npm run build`. Install command: `npm ci`.
5. Add environment variables:
   - `MONGODB_URI` ? required for durable storage.
   - `MONGODB_DATABASE` ? optional, defaults to `ramsport`.
   - `RAMSPORT_SESSION_SECRET` ? recommended, at least 32 characters.
6. Deploy.

`vercel.json` pins the framework and commands. Security headers are defined in
`next.config.ts` and are applied by Vercel. The `/api/[...path]` route runs in the Node.js
runtime and is never cached.

## Render

Apply `render.yaml` or create a **Web Service**:

- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm run start -- -p $PORT`
- Health check path: `/api/health`
- Environment: `MONGODB_URI`, `RAMSPORT_SESSION_SECRET`

Render supplies `PORT`; the start command passes it to `next start`. The free plan does not
provide a persistent disk, so MongoDB is required there.

## Static hosts and GitHub Pages

A static export cannot serve the `/api/*` route handler, so this build is not compatible
with GitHub Pages, `output: "export"` or a static-site plan. Use a Node.js host plus MongoDB
instead.

## Data and backups

Workspace data is stored on the server:

- **MongoDB**: database `ramsport` (or `MONGODB_DATABASE`), collection `records`. Each record
  is one JSON document with a namespaced `_id`, a `version` for optimistic concurrency and an
  `updatedAt` timestamp. Back up the database with your normal MongoDB tooling.
- **Filesystem**: one JSON file per record under `RAMSPORT_DATA_DIR/records/`, written with
  an atomic rename. Back up that directory.

Profiles and uploaded photos are records too, so a database backup captures the whole
workspace. Export important engineering documents from the workbench as an additional copy.

## Updating

Deploying a new build does not clear server data. Record keys and document formula versions
are stable; keep them stable when upgrading so existing workspaces remain readable. Changing
`RAMSPORT_SESSION_SECRET` signs out every user.
