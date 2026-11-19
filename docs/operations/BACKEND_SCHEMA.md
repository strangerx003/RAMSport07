# Server storage model

All workspace data is persisted by the server. The browser never writes application data to
localStorage, sessionStorage or IndexedDB.

## Drivers

`src/server/store.ts` exposes one interface over two drivers:

| Driver | Selected when | Notes |
|---|---|---|
| MongoDB | `MONGODB_URI` is set | Production. Survives redeploys and works across instances. |
| Filesystem | `MONGODB_URI` is unset | Development / single machine. Atomic JSON files under `RAMSPORT_DATA_DIR`. |

Both drivers store whole JSON documents keyed by a namespaced string. MongoDB uses a
`version` field for optimistic concurrency; the filesystem driver serialises writes per key
and replaces files with an atomic rename.

## Records

| Key | Type | Notes |
|---|---|---|
| `users` | `StoredUser[]` | Global account directory; never returned to standard users |
| `files:<accountId>` | `Record<string, StoredFile>` | Account file tree |
| `profile:<accountId>` | `ProfileRecord` | Display name, avatar preset, photo data URL |
| `save-locations:<accountId>` | `SaveLocations` | Last document per module (`rbd`, `fta`, `weibull`, `mil217f`, `fmeca`) |
| `audit:<accountId>` | `AuditRecord[]` | Last 200 events |
| `workspace:<accountId>:<key>` | JSON | Module scratchpads (register snapshots, diagrams, analysis documents) |
| `system:session-secret` | `string` | Generated HMAC key when `RAMSPORT_SESSION_SECRET` is unset |

## Shapes

```ts
type StoredUser = {
  accountId: string;
  username: string;
  usernameKey: string;
  role: "admin" | "user";
  passwordSalt: string;   // base64, 16 bytes
  passwordHash: string;   // base64, PBKDF2-SHA-256, 310,000 iterations
  active: boolean;
  createdAt: string;
  createdBy: string;
};

type StoredFile =
  | { kind: "dir"; modified: string }
  | { kind: "file"; modified: string; content: string };

type ProfileRecord = {
  displayName: string;
  avatarPreset: string | null;
  avatarDataUrl: string | null;
  updatedAt: string;
};
```

## File paths

Paths are relative to the account workspace, for example:

```text
Line 1
Line 1/RBD
Line 1/RBD/Line 1.rbd
Line 1/FTA/Line 1.fta
Line 1/Data Register/Line 1.data
```

Rules: at most 8 segments, each 1?80 letters/numbers/spaces/dot/dash/underscore, no `.` or
`..` segment. The document endpoint accepts `.rbd`, `.fta`, `.data`, `.wbl`, `.217f` and
`.fmeca` files, capped at 2 MB. Module scratchpads are capped at 5 MB.

## Migration

Record keys and document formula versions are stable. Changing a key format or a document
schema requires a migration that reads the old records and writes the new ones before the
first request. The `files:<accountId>` map is the only source of project documents; module
scratchpads are caches and may be regenerated.
