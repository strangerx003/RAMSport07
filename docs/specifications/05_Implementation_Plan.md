# Implementation Plan - RAMSport

**Version:** 1.0  
**Date:** 2026-10-29  
**Project:** RAMSport  
**Path:** `C:\Users\SIVA SAI\Desktop\RAMSPort\RAMSport02`

## 1. Overview

This plan reflects the current implemented state of RAMSport. It's a local-first Next.js app with RBD/FTA capabilities, auth, and exports.

## 2. Implementation Status

### Phase 0: Setup & Foundation ???
- [x] Next.js 16.4.2 with App Router
- [x] TypeScript configuration
- [x] Static export configuration (`output: 'export'`)
- [x] Path aliases (`@/*`)
- [x] Basic styling setup
- [x] Package dependencies installed

### Phase 1: Authentication & User Management ???
- [x] ASP.NET Core 8 minimal API in `backend/RAMSport.Api`.
- [x] MongoDB collections, indexes, TTL sessions and built-in account seeding.
- [x] Next.js `/api/*` proxy that preserves the existing browser contract and same-origin cookie.
- [x] Local filesystem project/profile storage owned by the API.
- [x] Opaque HTTP-only sessions backed by MongoDB and server-side endpoint authorization.
- [x] IDOR-resistant ownership, validated filesystem paths, rate limiting, and action audit logs.
- [x] Server-side administrator endpoint and page protection.
- [x] Administrator user creation/removal moved from browser localStorage to authenticated admin
      APIs backed by MongoDB; accounts now live in MongoDB and work across browsers.
- [x] Backend README.md created with building and running instructions.
- [x] docker-compose.yml added for optional local MongoDB container.
- [x] Launchers (win.bat, run.sh) start both API and Next.js with health checks.
- [x] Removed `src/app/api`, `src/server`, and `pg` dependencies.
- [x] Updated regression checks to target the C# backend and proxy architecture.
- [x] Rotated/deactivated default bootstrap credentials for shared installations.
- [x] Guards (cannot remove self/built-in accounts)
- [x] Testing hint added to login

### Phase 2: Marketing & Landing Page ???
- [x] Landing page with all sections
- [x] Hero, Why, What, Advantages, Workflow
- [x] Quote, Standards, Data, CTA sections
- [x] Responsive design
- [x] Navigation to login

### Phase 3: Data Register ???
- [x] Asset data model
- [x] CRUD operations
- [x] Starter data
- [x] Account-isolated storage
- [x] localStorage persistence with events

### Phase 4: RBD Engine & Editor ???
- [x] RBD calculation engine
- [x] Extracted to modular files (`rbd-core.ts`, `rbd-formulas.ts`, `rbd-workspace.ts`)
- [x] Re-exported from `engine/rbd.ts`
- [x] Diagram editor with canvas
- [x] Node/edge management
- [x] Routing logic
- [x] Groups functionality
- [x] Series/K-out-of-N calculations

### Phase 5: FTA Engine & Editor ???
- [x] FTA calculation engine
- [x] FTA editor component
- [x] Gate logic (AND/OR/XOR/NOT)
- [x] Event handling

### Phase 6: Exports ???
- [x] PDF export (jsPDF + autotable)
- [x] Excel export (ExcelJS)
- [x] PowerPoint export (pptxgenjs)
- [x] Word export (docx)
- [x] HTML to image (html-to-image)

### Phase 7: Polish & Deployment Prep ???
- [x] Static export working
- [x] `win.bat` and `run.sh` for easy startup
- [x] Vercel config
- [x] Build passes
- [x] Responsive design

## 3. File Structure (Key Files)

```
RAMSport02/
????????? src/
???   ????????? app/                    # Next.js App Router
???   ???   ????????? page.tsx            # Landing
???   ???   ????????? login/              # Login
???   ???   ????????? (workspace)/        # Protected routes
???   ???       ????????? admin/
???   ???       ????????? dashboard/
???   ???       ????????? data-register/
???   ???       ????????? fta/
???   ???       ????????? rbd/
???   ????????? components/             # React components
???   ???   ????????? auth/
???   ???   ????????? marketing/
???   ???   ????????? rbd/
???   ???   ????????? fta/
???   ????????? engine/                 # Calculation logic
???   ???   ????????? rbd.ts
???   ???   ????????? fta.ts
???   ???   ????????? reliability.ts
???   ????????? lib/                    # Utilities
???   ???   ????????? rbd-core.ts
???   ???   ????????? rbd-formulas.ts
???   ???   ????????? rbd-workspace.ts
???   ???   ????????? icons.tsx
???   ????????? services/               # Services
???   ???   ????????? auth/
???   ???       ????????? users.ts
???   ???       ????????? session.ts
???   ????????? data/                   # Data layer
???       ????????? workspace.ts
????????? docs/specifications/                  # Product and architecture specifications
????????? public/                     # Static assets
????????? win.bat                     # Windows launcher
????????? run.sh                      # macOS/Linux launcher
????????? package.json
```

## 4. Development Workflow

### Local Development
```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Build static export to out/
```

### Or use win.bat (Windows)
Double-click `win.bat` - installs dependencies if needed, starts the server, and opens the browser.

## 5. Testing Checklist

- [x] Landing page loads and all sections render
- [x] Login with test/pass-test works
- [x] Login with admin credentials works
- [x] Route guards redirect unauthenticated users
- [x] Data Register CRUD works
- [x] RBD canvas loads and calculations work
- [x] FTA canvas loads and calculations work
- [x] Exports generate files
- [x] Admin can create/remove users
- [x] Admin cannot remove self/built-in accounts
- [x] Build completes successfully
- [x] Responsive on different screen sizes

## 6. Known Limitations

- localStorage only - no cloud sync
- Static export - no API routes
- Client-side auth only (not secure for production multi-user)
- Data lost if localStorage cleared
- No undo/redo in some editors (check implementation)
- Browser compatibility depends on Web Crypto API

## 7. Deployment Options

### Vercel (Static)
- Already configured
- `next.config.ts` has `output: 'export'`
- Builds to static files

### GitHub Pages
- Use `npm run build:pages`
- Deploy `out/` directory

### Local Hosting
- Use `win.bat`, `run.sh`, or `npm.cmd run dev` on PowerShell
- Or serve `out/` with any static server

## 8. Future Enhancements (Out of Scope)

- Backend API with proper auth
- Database persistence
- Multi-user collaboration
- Undo/redo functionality
- More diagram export options
- Template library
- Import/export project files
- User preferences
- Dark mode

## 9. Maintenance Notes

- Update dependencies carefully (Next.js 16, React 19)
- Test build after changes
- Keep auth logic secure
- localStorage schema changes need migration logic
- Export libraries may need updates for compatibility

