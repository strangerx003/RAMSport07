# App Flow Document - RAMSport

**Version:** 1.0  
**Date:** 2026-10-29  
**Project:** RAMSport  
**Path:** `C:\Users\SIVA SAI\Desktop\RAMSPort\RAMSport02`

## 1. Overview

RAMSport is a full-stack engineering workbench with a Next.js frontend and an ASP.NET Core 8 API
backed by MongoDB. Users sign in through the API; accounts, sessions and metadata live in
MongoDB; engineering files and profile photos stay on local disk.

## 2. Entry Points

| Route | Type | Purpose |
|---|---|---|
| `/` | Public | Marketing landing page |
| `/login` | Public | Authentication screen; posts to the C# API |
| `/dashboard` | Authenticated | File manager for the account's project/ folder |
| `/data-register` | Authenticated | Component failure data CRUD |
| `/rbd` | Authenticated | RBD editor |
| `/fta` | Authenticated | FTA editor |
| `/profile` | Authenticated | Display name and photo editing |
| `/admin` | Administrator | User management |

## 3. Authentication Flow

```mermaid
flowchart LR
  A[User visits app] --> B{Has valid session cookie?}
  B -->|No| C[/login]
  C --> D[Enter username and password]
  D --> E[ASP.NET Core API verifies PBKDF2-SHA-256 credentials]
  E -->|Success| F[API creates MongoDB session; sets HttpOnly SameSite=Strict cookie]
  F --> G{Role == admin?}
  G -->|Yes| H[/admin]
  G -->|No| I[/dashboard]
  E -->|Failure| J[Show error on login form]
  J --> D
  B -->|Yes| K[Route by role from MongoDB session]
```

Session state lives in MongoDB with TTL-based expiry (8-hour lifetime). The cookie is
HttpOnly, SameSite=Strict, and its `Secure` flag follows the request protocol or
`RAMSPORT_COOKIE_SECURE`.

**Notes:**
- Built-in administrator: `siva905` role: admin ? redirects to `/admin`
- Test account: `test` / `test` role: user ? redirects to `/dashboard`
- Passwords validated: min 12 chars, must have uppercase, lowercase, number
- New accounts are created and hashed through the API admin endpoints
- Sessions survive API restarts because they live in MongoDB

## 4. Post-Auth Navigation

After login, users land in the workspace layout with sidebar navigation:

| Route | Role | Purpose |
|---|---|---|
| `/dashboard` | user/admin | Overview/entry point |
| `/data-register` | user/admin | Component failure data CRUD |
| `/rbd` | user/admin | Reliability Block Diagram editor |
| `/fta` | user/admin | Fault Tree Analysis editor |
| `/admin` | admin only | User management (create/remove users) |

Route guards redirect unauthenticated users to `/login`. Admin-only routes protected.

## 5. Data Register Flow

```mermaid
flowchart TD
    A[/data-register] --> B[Load assets from localStorage]
    B --> C{Has data?}
    C -->|No| D[Show starterAssets]
    C -->|Yes| E[Display table]
    E --> F[User actions]
    F --> G[Add/Edit/Delete row]
    G --> H[saveAssets() to account-isolated key]
    H --> E
```

**Fields:** tag, description, system, qty, lambda, mttr, mission, criticality, status

## 6. RBD Editor Flow

```mermaid
flowchart TD
    A[/rbd] --> B[Load diagram from localStorage]
    B --> C[Render canvas with nodes/edges]
    C --> D[User interactions]
    D --> E[Drag nodes, connect, group]
    E --> F[Auto-save diagram]
    F --> C
    D --> G[Calculate reliability]
    G --> H[Compute series/k-out-of-n/single]
    H --> I[Display results]
    D --> J[Create group]
    J --> K[saveRbdGroups()]
    D --> L[Export report]
    L --> M[Generate PDF/XLSX/PPTX/DOCX]
```

**Components:** `DiagramEditor`, routing logic (`rbd-routing.ts`), calculation engine (`engine/rbd.ts` + extracted `rbd-core.ts`, `rbd-formulas.ts`, `rbd-workspace.ts`)

## 7. FTA Editor Flow

```mermaid
flowchart TD
    A[/fta] --> B[Load diagram]
    B --> C[Canvas with gates/events]
    C --> D[User builds tree]
    D --> E[Connect gates to events]
    E --> F[Calculate top event probability]
    F --> G[Show minimal cut sets if applicable]
    D --> H[Export report]
```

**Gates:** AND, OR, XOR, NOT (as supported). Calculations via `engine/fta.ts`.

## 8. Export Flow

All reports export from Data Register/RBD/FTA contexts:
1. User clicks Export
2. Collect current diagram/data + report rows
3. Generate via jsPDF/ExcelJS/pptxgenjs/docx/html-to-image
4. Download file to browser

## 9. Admin Flow

```mermaid
flowchart TD
    A[/admin] --> B[Check role == admin]
    B -->|Yes| C[List all users]
    C --> D[Create user form]
    D --> E[createUser() with validation]
    E --> C
    C --> F[Remove user]
    F --> G[removeUser() with guards]
    G -->|Cannot remove self/built-in admin/test| H[Show error]
    G -->|Success| C
```

**Guards:** Cannot remove self, cannot remove built-in admin (`siva905`), cannot remove test account.

## 10. State Management

- **Auth:** Session in `localStorage` via `services/auth/session.ts`
- **Users:** `ramsport-users` key, managed by `services/auth/users.ts`
- **Data:** Account-isolated keys via `accountStorageKey()` from session
- **Diagrams:** `${mode}-diagram` per account
- **Groups:** `rbd-groups` per account
- **Assets:** `register` per account

All client-side, no global state library - uses React state + localStorage + custom events.