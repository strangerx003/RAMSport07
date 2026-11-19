# Requirements traceability

Status: maintained baseline

This table links current requirements to implementation and available evidence. ?Planned?
means the requirement is not yet supported by objective executable evidence and cannot be
claimed as verified.

| ID | Requirement | Implementation | Evidence | State |
|---|---|---|---|---|
| FR-AUTH-01 | Authenticated, role-controlled access | `src/server/session.ts`, `src/server/api.ts`, `src/server/users.ts` | Type check, conformance scan; API integration test planned | Partial |
| FR-DOC-01 | Account-scoped project and document storage | `src/server/api.ts`, `src/server/store.ts` | Type check, conformance scan; isolation test planned | Partial |
| FR-RAM-01 | RBD and FTA analysis | `src/engine/rbd.ts`, `src/engine/fta.ts` | Build and structural scan; controlled reference fixtures planned | Partial |
| FR-RAM-02 | Weibull and MIL-217F analysis | `src/engine/weibull.ts`, `src/engine/mil217f.ts` | Build and structural scan; controlled reference fixtures planned | Partial |
| FR-RAM-03 | FMECA, LCC and spares analysis | `src/engine/fmeca.ts`, `src/engine/lcc.ts`, `src/engine/spares.ts` | Build and standards matrix; controlled reference fixtures planned | Partial |
| NFR-SEC-01 | Signed sessions, origin and ownership controls | `src/server/session.ts`, `src/server/api.ts`, `next.config.ts` | Structural scan; dynamic security tests planned | Partial |
| NFR-DATA-01 | Durable production persistence | `src/server/store.ts` | Production configuration and restore drill required | Planned |
| NFR-PERF-01 | Metadata API p95 below 300 ms | Server API and co-located database | Repeatable load test planned | Planned |
| NFR-ACC-01 | WCAG 2.2 AA target | UI components and styles | Automated and manual accessibility evidence planned | Planned |
| NFR-QUAL-01 | Reproducible quality gate | `package.json`, `tsconfig.json`, `scripts/verify-workbench.mjs` | `npm run check` | Implemented |

Update this table whenever a requirement, implementation location or verification method
changes. Release evidence must reference the applicable IDs and exact source revision.
