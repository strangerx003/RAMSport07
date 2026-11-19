# Product status

RAMSport is a **Beta** product. The interface, storage model, calculations, and report layouts may change before production release.

This is the **server-backed build**. Accounts, projects, documents, profiles and module
snapshots are stored on the server (MongoDB in production, a filesystem fallback for local
development). The browser holds only a signed HttpOnly session cookie.

| Module | Status | Current scope |
|---|---|---|
| Data Register | Beta | Component reliability and maintainability baseline; source of truth for every module |
| RBD | Beta | System topology, reusable groups, RAM calculation, explanation, export |
| FTA | Beta | Event/gate modelling, top-event evaluation, explanation, export |
| Weibull Analysis | Beta | IEC 61649 life-data analysis, B-lives, confidence, export |
| RAM Prediction | Beta | MIL-HDBK-217F Notice 2 parts-stress prediction, export |
| FMEA / FMECA | Beta | EN 50126-1:2017 risk assessment with optional MIL-STD-1629A Cm/Cr |
| LCC (PM/CM) | Planned | Preventive and corrective maintenance lifecycle cost |
| Spare Parts Analysis | Planned | Demand, stock, repair, and lead-time analysis |
| RCIL | Planned | Reliability Critical Items List and associated controls |
| SCIL | Planned | Safety Critical Items List and associated assurance evidence |

Planned modules are product direction, not released functionality. Marketing and sales material must preserve this distinction.

## Release targets

- Primary environment: desktop and corporate-network browsers; phone layout verified at 390?844.
- Core Web Vitals: LCP at or below 2.0 seconds, INP at or below 200 ms, CLS at or below 0.1 at p75.
- JavaScript budget: 150 KB gzip per public route where practical.
- Lighthouse floors: accessibility 90 and performance 85.
- Accessibility target: WCAG 2.2 AA. A named accessibility owner is required before production release.

## Storage and deployment status

- Workspace data: MongoDB (`MONGODB_URI`) or the filesystem fallback under `RAMSPORT_DATA_DIR`.
- Accounts: seeded built-ins plus administrator-created accounts in the server directory.
- Session: signed `ramsport_session` HttpOnly cookie with an eight-hour expiry.
- Hosting: Next.js on a Node.js host (Vercel or Render) plus MongoDB. Static hosting is not supported.
- Security boundary: the Next.js `/api/*` route handler. See [SECURITY.md](SECURITY.md).

## Known constraints

- MongoDB is required for durable production storage; the filesystem fallback is ephemeral on serverless hosts.
- The MongoDB driver is implemented but has only been exercised against the filesystem driver in local verification; validate against the production cluster before go-live.
- The EN 50126 frequency/severity/matrix implementation follows the inferred Annex C structure; confirm against the licensed standard before using it as a certification basis.
- There is no MFA, self-service password reset or per-session revocation; rotate `RAMSPORT_SESSION_SECRET` to revoke all sessions.
- The audit trail is bounded to the last 200 events per account.
