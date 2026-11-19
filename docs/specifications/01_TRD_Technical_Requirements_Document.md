# Technical Requirements Document (TRD) - RAMSport

**Version:** 1.0  
**Date:** 2026-10-29  
**Project:** RAMSport - Reliability, Availability, Maintainability & Safety (RAMS) Engineering Workbench  
**Path:** `C:\Users\SIVA SAI\Desktop\RAMSPort\RAMSport02`

## 1. Objective

RAMSport is a browser-based RAMS engineering workbench for Reliability Block Diagram (RBD) and Fault Tree Analysis (FTA). It allows engineers to model systems, trace failure paths, and generate exportable evidence (PDF/Excel/PowerPoint/Word) without requiring a backend server. All data is stored locally in the browser per user account.

## 2. Scope

### In Scope
- Public marketing landing page (`/`)
- User authentication with local account management
- Data Register for component failure data
- RBD canvas with blocks, connections, groups, calculations
- FTA canvas with gates/events, calculations
- Report generation with 4 export formats
- Admin panel for user management
- Account-isolated localStorage

### Out of Scope (Current)
- Cloud sync/multi-device sync
- Real backend API/database
- External authentication providers
- Certification claims (tool provides method support only)

## 3. Functional Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-01 | Public landing page with Why/What/Advantages/Workflow sections | High | Implemented |
| FR-02 | Login screen with account authentication | High | Implemented |
| FR-03 | Admin can create/remove users | High | Implemented |
| FR-04 | Data Register CRUD for components (lambda, MTTR, etc.) | High | Implemented |
| FR-05 | RBD editor with drag/drop, connections, routing | High | Implemented |
| FR-06 | RBD calculations (Series, K-out-of-N, Single block) | High | Implemented |
| FR-07 | FTA editor with gates (AND/OR/XOR/NOT) | High | Implemented |
| FR-08 | FTA calculations (basic events, gate logic) | High | Implemented |
| FR-09 | Export to PDF/XLSX/PPTX/DOCX | High | Implemented |
| FR-10 | Route guards redirect unauthenticated to /login | High | Implemented |
| FR-11 | Account-isolated storage | High | Implemented |

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Static export compatible | Yes (Next.js output: export) |
| NFR-02 | Works offline after first load | Partial (client-side only) |
| NFR-03 | Responsive (desktop/tablet/mobile) | 320px - 1920px |
| NFR-04 | No server required | Yes |
| NFR-05 | Password security | PBKDF2-SHA-256 (310000 iterations) |
| NFR-06 | Type safety | TypeScript strict mode |
| NFR-07 | Browser support | Modern Chrome/Edge/Firefox/Safari |

## 5. Technical Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.4.2 |
| UI Library | React | 19.3.1 |
| Language | TypeScript | 5.7.0 |
| Styling | CSS (globals, landing, professional, workbench) | Native |
| UI Primitives | Radix UI | 1.8.1 |
| Icons | Custom SVG set | - |
| Exports | jsPDF, ExcelJS, pptxgenjs, docx, html-to-image | Various |
| Auth | ASP.NET Core API with PBKDF2-SHA-256 (310000 iterations) | .NET 8 |
| Storage | MongoDB (accounts, sessions, profiles, file index, save locations, audit events) +
  local disk (engineering documents and profile photos) |

## 6. Constraints

- .NET 8 API and MongoDB are required at runtime.
- Frontend (Next.js) proxies /api/* to the ASP.NET Core API; all authentication and
  authorization is server-enforced.
- Frontend state is never trusted; every API endpoint verifies authentication and
  authorization.
- MongoDB collections, indexes and seed accounts are created on API startup.
- Audit events are written to MongoDB and daily JSONL files in user data/audit logs/.
- File index in MongoDB is advisory; the authoritative file store is the account's
  project/ directory on local disk.
- Production availability target is 99.5% excluding operator-planned maintenance.
- Acceptance requires passing TypeScript, unit/regression, production build, authorization,
  IDOR, export, accessibility, backup, restore, and calculation-verification checks.
