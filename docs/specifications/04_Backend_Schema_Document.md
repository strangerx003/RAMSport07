# Backend Schema Document - RAMSport

**Version:** 1.0  
**Date:** 2026-10-29  
**Project:** RAMSport  
**Path:** `C:\Users\SIVA SAI\Desktop\RAMSPort\RAMSport02`

## 1. Overview

RAMSport has **no traditional backend server**. All data is stored client-side in `localStorage` with account-based isolation. Authentication uses Web Crypto API (PBKDF2-SHA-256). This document describes the logical schema as stored in the browser.

## 2. Storage Strategy

- **Scope:** Per-origin, per-browser
- **Isolation:** Account-specific keys via `accountStorageKey()` 
- **Format:** JSON
- **Events:** Custom events dispatched on changes for reactive updates

## 3. Authentication Schema

### 3.1 Users Store
**Key:** `ramsport-users`  
**Type:** `StoredUser[]`

```typescript
type AccountRole = "user" | "admin";

type StoredUser = {
  id: string;           // crypto.randomUUID()
  username: string;     // Display name
  usernameKey: string;  // Lowercase trimmed for lookup
  role: AccountRole;
  salt: string;         // Base64
  hash: string;         // Base64 PBKDF2-SHA256
  createdAt: string;    // ISO 8601
  createdBy: string;    // "system" or creator username
};
```

**Built-ins:**
- Admin: `siva905` (bootstrapped with hardcoded salt/hash)
- Test: `test` (bootstrapped with hardcoded salt/hash, role: user)

**Security:**
- PBKDF2 iterations: 310000
- Hash algorithm: SHA-256
- Salt length: 16 bytes (random for user-created accounts)
- Password requirements: 12-128 chars, must have upper/lower/number
- Username: 3-32 chars, alphanumeric + . _ -

### 3.2 Session Store
**Key:** Account session (managed by `services/auth/session.ts`)

```typescript
type AccountSession = {
  username: string;
  accountId: string;
  role: AccountRole;
  signedInAt: string;
};
```

Stored via `saveAccountSession()`, retrieved for auth checks and key isolation.

## 4. Application Data Schema

### 4.1 Data Register (Assets)
**Key:** Account-isolated `register` (via `accountStorageKey(REGISTER_KEY)`)  
**Event:** `ramsport-register-updated`  
**Type:** `Asset[]`

```typescript
type Asset = {
  id: string;
  tag: string;           // e.g., "SIG-CBI-001"
  description: string;
  system: string;        // e.g., "Signalling", "Power"
  qty: number;
  lambda: number;        // Failure rate
  mttr: number;          // Mean Time To Repair
  mission: number;       // Mission time (hours)
  criticality: string;   // "Safety critical" | "Mission critical" | "Operational"
  status: string;        // "Validated" | "In review" | "Draft"
};
```

**Defaults:** `starterAssets` provided if no data exists.

### 4.2 RBD Groups
**Key:** Account-isolated `rbd-groups`  
**Event:** `ramsport-rbd-groups-updated`  
**Type:** `RbdGroup[]`

```typescript
type RbdGroup = {
  id: string;
  tag: string;
  name: string;
  failureRate: number;
  mtbf: number;
  mttr: number;
  availability: number;
  configuration: string;
  paths: number;
  memberCount: number;
  createdAt: string;
  formulaVersion: "rbd-sheet-v1";
};
```

Only groups with `formulaVersion === "rbd-sheet-v1"` are loaded.

### 4.3 Diagrams (RBD/FTA)
**Key:** Account-isolated `${mode}-diagram` where mode is `"rbd"` or `"fta"`  
**Type:** `DiagramState`

```typescript
type DiagramNode = {
  id: number;
  x: number;
  y: number;
  type: string;
  title: string;
  subtitle: string;
  assetId?: string;
  groupId?: string;
  failureRate?: number;
  mttr?: number;
  mission?: number;
};

type DiagramEdge = {
  from: number;
  to: number;
  style: "straight" | "elbow";
  waypoint?: { x: number; y: number };
  fromSide?: "left" | "right" | "top" | "bottom";
  toSide?: "left" | "right" | "top" | "bottom";
};

type DiagramState = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};
```

No automatic event dispatch on diagram save (just localStorage write).

## 5. Data Relationships

```
User (StoredUser)
  ??? Session (AccountSession) - 1:1 active
  ??? Workspace Data (per account)
      ??? Assets (1:N)
      ??? RBD Groups (1:N)
      ??? Diagrams RBD/FTA (1:1 each)
```

All workspace data is namespaced by account ID via `accountStorageKey()`.

## 6. Key Functions

| Function | Module | Purpose |
|---|---|---|
| `authenticate()` | `services/auth/users.ts` | Verify credentials via PBKDF2 |
| `createUser()` | `services/auth/users.ts` | Create user with validation |
| `removeUser()` | `services/auth/users.ts` | Remove user with guards |
| `listUsers()` | `services/auth/users.ts` | Get all users, ensure bootstraps exist |
| `readAssets()` / `saveAssets()` | `data/workspace.ts` | Data Register CRUD |
| `readRbdGroups()` / `saveRbdGroups()` | `data/workspace.ts` | Groups CRUD |
| `readDiagram()` / `saveDiagram()` | `data/workspace.ts` | Diagram persistence |
| `accountStorageKey()` | `services/auth/session.ts` | Generate account-isolated key |

## 7. Data Migration

- `createLegacyAccountId()` - Creates legacy ID from username/password
- `migrateAccountData()` - Migrates old data to new account ID
- Called on login after successful auth

## 8. Constraints & Notes

- **No server schema** - logical schema only
- **localStorage limits** - ~5-10MB per origin, varies by browser
- **No encryption at rest** beyond password hashing - data is plain JSON in localStorage
- **Browser-specific** - data doesn't sync across devices/browsers
- **Client-side only** - no backup/recovery mechanism built-in
- **Export formats** - generated client-side from in-memory data

## 9. Future Considerations

If migrating to backend:
- Users table with hashed passwords
- Assets, diagrams, groups as proper tables with foreign keys
- Sessions/tokens
- API endpoints
- Role-based access control enforcement server-side