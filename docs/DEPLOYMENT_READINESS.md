# RAMSport Deployment Readiness

## Status: ? READY FOR DEPLOYMENT

### Build Verification

| Check | Result |
|-------|--------|
| `next build` (production) | ? Passes ? no errors (Next.js 16.4.6) |
| `node scripts/verify-workbench.mjs` | ? Passes (16/16 regression checks) |
| `next dev` (Turbopack) | ? All 14 routes return 200, no parse errors |
| `tsc --noEmit` (TypeScript) | ? Zero errors |
| `npm audit` | ? **0 vulnerabilities** (was 5: 2 high, 3 moderate) |
| UTF-8 encoding (87 TS/TSX files) | ? All valid |
| UTF-8 encoding (10 CSS files) | ? All valid |

### Security Fixes (2026-11-17)

| Vulnerability | Severity | Fix |
|---------------|----------|-----|
| Next.js info disclosure (GHSA-mfr8-8qww-v76h) | moderate | Upgraded `next` 16.4.2 ? **16.4.6** |
| image-size DoS ?2 (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr) | high | Override `image-size` ? **^2.1.0** (unused dep of pptxgenjs) |
| uuid buffer bounds (GHSA-w5hq-g745-h8pq) | moderate | Override `uuid` ? **^11.1.1** (exceljs uses only `v4`) |

The `? Your version of Next.js is affected by a known security vulnerability` warning is now gone.

### Syntax Errors Fixed

1. **Duplicate `showNotice` function** in `data-register/page.tsx` ? removed the duplicate declaration (lines 182-185).
2. **Missing `}` closing JSX expression** in `data-register/page.tsx` ? added closing brace before `</td>` (line 218).

### Pre-existing Fixes (from earlier sessions)

3. **Invalid UTF-8 byte** in `weibull.css` ? replaced mojibake byte 0xDF with `grade`.
4. **`.workbench-toolbar` centering** ? changed `justify-content: center` to `flex-start` in `professional.css`.
5. **Material table restyle** ? compact headers (`FPMH @ {t} yr`, `R(t)% @ {t} yr`, `MTBF (yr)`, `Replace at (yr)`), borderless inputs, hover/focus borders.

### Deployment Configuration

| File | Status |
|------|--------|
| `vercel.json` | ? Present ? framework: nextjs, `npm ci`, `npm run build` |
| `next.config.ts` | ? Security headers, CSP, `serverExternalPackages: ["mongodb"]` |
| `package.json` | ? `build` script ? `next build`, `start` ? `next start` |
| `.env.local` | ? Contains Vercel OIDC token |

### Storage

- **MongoDB**: Used when `MONGODB_URI` is set (recommended for production).
- **Filesystem fallback**: Used when `MONGODB_URI` is not set ? **ephemeral on Vercel**, data lost on redeploy.
- **Recommendation**: Set `MONGODB_URI` in Vercel project environment variables before deploying to production.

### How to Deploy (when ready)

```bash
# From the project root:
cd C:\Users\SIVA\Desktop\RAMSport\RAMSport06_C#_nostorage

# Option A: Vercel CLI
vercel deploy --prod

# Option B: Vercel CLI with explicit project
vercel deploy --prod --yes
```

### Post-Deployment Checklist

- [ ] Set `MONGODB_URI` in Vercel environment variables
- [ ] Verify `https://ramsporttest.vercel.app` loads
- [ ] Login with `test` / `test`
- [ ] Check Data Register renders without errors
- [ ] Check Weibull view renders with material table
- [ ] Run `node scripts/verify-workbench.mjs` against deployed URL

---

*Prepared: 2026-11-17*
