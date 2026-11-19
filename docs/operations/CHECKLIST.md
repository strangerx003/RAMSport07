# RAMSport release checklist

Use this checklist before publishing a build. It applies to the server-backed variant.

## Build

- [ ] `npm ci` completes with no errors.
- [ ] `npm run check` passes (type check, conformance scan and production build).
- [ ] `npm run start` serves `/`, `/login`, `/dashboard`, `/data-register`, `/rbd`, `/fta`, `/weibull`, `/mil-std-217f`, `/fmeca`, `/profile`, `/admin` and `/api/health`.
- [ ] No `.env.local`, `.ramsport-data/`, user data, audit logs or exported documents are included in the deployment.
- [ ] `package.json` contains no `dotnet` or backend scripts.

## Security

- [ ] `next.config.ts` sends CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP.
- [ ] Production CSP does not allow `unsafe-eval`.
- [ ] `next.config.ts` contains no `/api/*` rewrite to a backend.
- [ ] No source file uses localStorage, sessionStorage or IndexedDB for application data.
- [ ] Every API endpoint except login/logout/health resolves the session before doing work.
- [ ] Account ids come from the signed session, never from a request body or query string.
- [ ] Every record key is built with `rowKey(resource, accountId)` or `workspaceRecordKey`.
- [ ] Administrator endpoints require the administrator role.
- [ ] Built-in accounts cannot be removed.
- [ ] Path traversal, unknown extensions, oversized documents and oversized photos are rejected.
- [ ] Login is rate-limited. The **Test access** hint is intentional for evaluation builds; set `NEXT_PUBLIC_SHOW_TEST_ACCESS=off` before a public production release if it should be hidden.
- [ ] `MONGODB_URI` and `RAMSPORT_SESSION_SECRET` are set in production.
- [ ] The deployment is served over HTTPS.

## Behaviour

- [ ] A standard user can sign in and reach the dashboard.
- [ ] The administrator can open `/admin`; a standard user is redirected to `/dashboard`.
- [ ] Creating, renaming and deleting projects, folders and documents updates the tree.
- [ ] Creating or renaming an entry happens inline in its row with no popup; `Enter` saves, `Escape` cancels, and duplicate names are refused in place.
- [ ] The sign-in **Test access** hint fills `test` / `test` and signs in.
- [ ] Every module opens from the tree and by URL and hydrates its document from the server.
- [ ] Edits autosave and survive a page reload.
- [ ] Two accounts do not see each other's files, profile, scratchpads or save locations.
- [ ] Profile display name and stock avatar persist after reload; the avatar faces left.
- [ ] A profile photo upload, replace and remove work within the 5 MB limit.
- [ ] Export to PDF, XLSX, PPTX and DOCX produces a readable file.
- [ ] Dark mode persists across reloads.
- [ ] The layout works at 360 px, 390 px, 768 px and 1440 px widths.
- [ ] Risk-matrix cells wrap text instead of overflowing.

## Accessibility

- [ ] Every page has one main heading and a logical landmark structure.
- [ ] All controls are reachable and operable by keyboard.
- [ ] Dialogs trap focus and close with Escape.
- [ ] Icon-only buttons have accessible names.
- [ ] Colour contrast meets WCAG 2.2 AA.
- [ ] Lighthouse accessibility is at least 90.

## Documentation

- [ ] `README.md` matches the deployment steps.
- [ ] `docs/operations/DEPLOY.md`, `AUTH.md`, `SECURITY.md`, `ENV.md` and `STRUCTURE.md` match the code.
- [ ] `docs/operations/BACKEND_SCHEMA.md` and `RLS_POLICIES.md` describe the current server records.
- [ ] Known limitations are recorded in `docs/operations/PRODUCT_STATUS.md` and `todolist.md`.
- [ ] `compliance/compliance-matrix.md` reflects the current engine symbols and verification commands.
- [ ] `docs/operations/TRACEABILITY.md` links changed requirements to implementation and evidence.
- [ ] The release record identifies the source revision, environment, executor, reviewer, results and approved deviations.
