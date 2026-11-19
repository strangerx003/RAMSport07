# RAMSport structure

The application is a single Next.js project. The same-origin `/api/*` contract is served by
a Node.js route handler in `src/app/api/[...path]`, backed by `src/server`.

```text
.
|-- src/
|   |-- app/                    Next.js routes and the /api/[...path] handler
|   |-- components/             React UI grouped by feature
|   |   |-- auth/               Sign-in screen
|   |   |-- documents/          Save dialog
|   |   |-- files/              File manager, tree and previews
|   |   |-- fta/                Fault tree editor
|   |   |-- fmeca/              FMEA / FMECA worksheet
|   |   |-- layout/             Application shell
|   |   |-- marketing/          Public landing page
|   |   |-- mil217f/            MIL-HDBK-217F prediction workbench
|   |   |-- profile/            Avatar
|   |   |-- rbd/                Reliability block diagram editor
|   |   |-- reporting/          Export helpers
|   |   |-- ui/                 Shared primitives and dialogs
|   |   `-- weibull/            Weibull analysis workbench
|   |-- data/                   Stored models and module document shapes
|   |-- engine/                 Pure calculation and geometry, no React
|   |-- lib/                    Base path, icons, document URL context, formatting
|   |-- server/
|   |   |-- api.ts              Endpoints, ownership, validation, audit
|   |   |-- crypto.ts           PBKDF2-SHA-256 password hashing
|   |   |-- session.ts          Signed HttpOnly session cookies and origin checks
|   |   |-- store.ts            MongoDB / filesystem record store
|   |   `-- users.ts            Account directory and seeding
|   |-- services/
|   |   |-- auth/               Session and user-directory clients
|   |   `-- documents/          Document load/save and Data Register bridge
|   `-- styles/                 All CSS
|-- public/                     Brand assets and bundled avatars
|-- scripts/                    Regression checks
|-- docs/
|   |-- operations/             Maintained operations, security and product notes
|   |-- specifications/         Original requirements and design records
|   |-- status/                 Historical snapshots; not current release evidence
|   `-- archive/                Superseded audits and design references
|-- compliance/                 Standards compliance matrix and evidence
|-- next.config.ts              Security headers and build configuration
|-- vercel.json                 Vercel deployment settings
|-- render.yaml                 Render blueprint
`-- package.json
```

## Where new code belongs

- A new route: `src/app/<route>/page.tsx`.
- A new endpoint: add a handler in `src/server/api.ts` and route it in `handleApi`.
- A new stored record: choose a `resource` name and key it with `rowKey(resource, accountId)`.
- A new shared control: `src/components/ui`.
- A new calculation: `src/engine`, with no React imports.
- A new stylesheet rule: `src/styles`, using the existing tokens in `design-system.css`.

## Data model

Server records keyed by a namespaced string:

| Key | Value |
|---|---|
| `users` | Account directory, including password salts and hashes |
| `files:<accountId>` | Map of path ? directory or file record |
| `profile:<accountId>` | Display name, avatar preset and optional photo data URL |
| `save-locations:<accountId>` | Last document per module |
| `audit:<accountId>` | Bounded audit trail (last 200 events) |
| `workspace:<accountId>:<key>` | Module scratchpad (register snapshot, diagram, analysis document) |

MongoDB stores one document per key in the `records` collection. The filesystem fallback
stores one JSON file per key under `RAMSPORT_DATA_DIR/records/`. See
[BACKEND_SCHEMA.md](BACKEND_SCHEMA.md).
