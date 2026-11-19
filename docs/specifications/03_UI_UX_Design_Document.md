# UI/UX Design Document - RAMSport

**Version:** 1.0  
**Date:** 2026-10-29  
**Project:** RAMSport  
**Path:** `C:\Users\SIVA SAI\Desktop\RAMSPort\RAMSport02`

## 1. Design Principles

- **Clarity first**: Engineering data should be scannable and unambiguous
- **Method-focused**: Tool provides methodology support, not certification claims
- **Local-first**: No cloud UI chrome, just the workbench
- **Responsive**: Works across desktop, tablet, mobile
- **Accessible**: Semantic HTML, ARIA where needed

## 2. Color Palette

Based on CSS files (`globals.css`, `landing.css`, `professional.css`, `workbench.css`):

| Token | Purpose | Approximate Value |
|---|---|---|
| Primary Background | App background | `#f7fbfd` / `#ffffff` |
| Panel Background | Cards/panels | `#ffffff` |
| Border | Dividers/borders | `#d8e6ee` / `#e6edf2` |
| Text Primary | Headings/body | `#1f3f4f` / `#102a36` |
| Text Secondary | Muted text | `#3f5a6b` / `#5f7c8a` |
| Accent/Brand | Brand mark, CTAs | `#0f7b9b` / `#1f7a8c` |
| Success/Info | Pills/badges | Various blues/teals |
| Error | Form errors | Red tones |

## 3. Typography

- **System font stack** (inferred from CSS) - clean sans-serif for technical UI
- **Headings**: Bold, tight tracking
- **Body**: 14-16px base
- **Code/mono**: For values (lambda, MTBF) - monospaced

## 4. Layout Structure

### 4.1 Landing Page (`/`)
Components: `components/marketing/LandingPage.tsx`

Sections (as implemented):
1. **Hero** - Title, tagline, CTAs (Sign in)
2. **Why** - Value proposition
3. **What** - Features overview
4. **Advantages** - Benefits
5. **Workflow** - Steps
6. **Quote** - Testimonial/statement
7. **Standards** - EN 50126, IEC 61078, IEC 61025, MIL-STD-882E
8. **Data** - Data register emphasis
9. **CTA** - Call to action
10. **Footer**

Responsive with mobile breakpoints.

### 4.2 Login Page (`/login`)
Components: `components/auth/LoginScreen.tsx`

**Layout:** Split screen
- Left: Visual panel with brand, tagline, standards, network diagram art
- Right: Login form panel

**Form elements:**
- Brand link back to home
- Eyebrow "SECURE ACCESS"
- Heading "Welcome back"
- Testing hint box (test/pass-test) - added as requested
- Username input
- Password input with show/hide toggle
- Error message area
- Submit button "Sign in" with arrow

### 4.3 Workspace Layout
Routes under `(workspace)/` share layout with:
- Sidebar navigation (fixed 236 px above 760 px viewport)
- User info/session
- Route content area
- Responsive behavior

**Nav items:** Dashboard, Data Register, RBD, FTA, Weibull, MIL-STD-217F, FMECA, LCC-PM, LCC-CM, Spare Parts, Admin (conditional)

### 4.4 Module Workspace Surface
Every analysis module (RBD, FTA, Weibull, MIL-217F, FMECA, LCC-PM, LCC-CM, Spare Parts) is a
full-bleed workspace, not a card floating inside the page:

- The workbench sits inside the application frame with the same 28 px gutter as
  Dashboard and Files, and uses the app's own surface, border and radius tokens.
  This keeps it aligned with the header and sidebar instead of reading as a
  full-bleed layer on top of the shell.
- On desktop (?761 px) the module surface meets the bottom edge of the window: the
  page content has no bottom gutter and the panel keeps only its top corners
  rounded, so the last row (status bar, table footer, zoom controls) is flush with
  the application frame. No empty band or stray scrollbar sits under a module.
- The workbench is `grid-template-rows: toolbar minmax(0, 1fr)`, so the toolbar
  is always the first row of the module and never moves when results appear.
- On phones (?760 px) the shell releases the fixed height (`height: auto`) and the
  module scrolls with the page.
- The workbench never shrinks below its working width (`--wb-min-width`, one value
  per module family). Below it the shell shows a horizontal scrollbar instead of
  clipping the right-hand panel; above it the workspace fills the window.

Dense data-entry tables (LCC-PM, LCC-CM, Spare Parts) use `<colgroup>` +
`table-layout: fixed` + `width: 100%` so the table fills its pane without
stretching any column, and a per-module floor (`--wb-table-min`: 600 px for the
nine-column LCC grids, 840 px for the twelve-column spares grid) so the numeric
inputs keep their width and the table scrolls horizontally only below that floor.
Result KPI cards use `repeat(auto-fit, minmax(190px, 1fr))`; result sections use
`overflow: auto` so a wide period table scrolls instead of losing its last column.

**Results placement.** Headline figures are published into the application header
band, between the module title and the page actions, through `ModuleKpis`
(`components/layout/header-kpis.tsx`), which portals into the `#page-kpis` slot
rendered by `AppShell`. Each figure is written as symbol, equals sign, value and
unit ? `? = 6.0000e-6 1/h`, `MTBF = 166,667 h`, `A = 99.999124%` ? with a short
plain-language name above it. No engine, method or standard caption is shown in
the strip; that information stays in the module's method note. The strip is one
52 px row with an optional *Explanation* control at its right; nothing is
reserved above the module toolbar.

- RBD shows ?, MTBF, MTTR and A.
- FTA shows Q(t), ?, MTBF, A and the minimal cut-set count.
- Weibull's material view shows LRU count, ?FPMH, shortest MTBF and mean R(t).
- LCC-PM, LCC-CM and Spare Parts show NPV, ?C, EAC and unit rate (SL and Nf for
  spares).
- Data Register shows N, S, ?? and A.

When the window narrows the strip keeps the title and actions on the same row:
below 1400 px padding tightens, below 1500 px the fifth figure is dropped, below
1180 px only the three headline figures and units remain, and below 980 px one
figure remains. The module panel always opens with its toolbar as the first row,
so the controls never move down.

The former right-hand result pane is gone, so the diagram canvas uses the full
width after the component library. Component properties are no longer edited in
a bar under the diagram either: the Data Register is the single place where ?,
MTTR and descriptions are maintained.

**Data Register.** The register is a module workspace, not a spreadsheet: a
toolbar (add, delete, search, match count), a grid with a sticky header, inline
editing, derived availability marked with ?, and a status line (components,
systems, total ?, save state). It uses `<colgroup>` + `table-layout: fixed` with a
980 px floor: at 1440 px it fits the panel with no horizontal scrollbar, and it
scrolls only when the window is narrower. There are no column letters, no formula
bar and no sheet stretched below its last row.

**Weibull material life.** The Weibull module opens on a *Material life* view that
reproduces the railway LRU workbook: one row per LRU with material type, ?, ?,
FPMH, R(t)% and MTBF at a configurable horizon (10 years by default), plus a
planned *Replace at* age. Material, ? and ? are editable; picking a material
loads its published ?/? pair. Below the table the key formulas are stated in full
(?(t) = (?/?)(t/?)^(??1), R(t) = e^?((t/?)^?), FPMH = ?/8760 ? 10?,
MTBF = 1/? years) with the ? and ? interpretation, followed by the ?-values
library (polycarbonate 3/16.5, aluminium 2/22.5, stainless steel 2.5/22.5,
galvanized spring steel 2.5/20, polyamide PA66 2.8/12.5, FR4 2.2/13.5). The
IEC 61649 failure-time analysis remains available from the *Failure data* view
of the same toolbar.

## 5. Component Library

### Core Components
| Component | Location | Purpose |
|---|---|---|
| `LandingPage` | `components/marketing/` | Marketing page |
| `LoginScreen` | `components/auth/` | Auth UI |
| `DiagramEditor` | `components/rbd/` | RBD canvas editor |
| `FTAEditor` | `components/fta/` | FTA canvas editor |
| `DataRegister` | (in workspace) | Asset table CRUD |
| `WorkspaceShell` / Layout | `app/(workspace)/` | App shell |

### UI Primitives
Radix UI components available. Custom components follow existing patterns.

### Icons
Custom icon set in `lib/icons.tsx`.

## 6. Interaction Patterns

- **Forms**: Controlled inputs, validation on submit
- **Tables**: Sortable/filterable where applicable, inline edit
- **Canvas**: Drag nodes, click to connect, context menus
- **Modals/Dialogs**: For confirmations (delete user, etc.)
- **Toasts/Alerts**: Error messages inline
- **Loading states**: Buttons show "Signing in..." etc.

## 7. Responsive Design

Breakpoints (as implemented in `design-system.css` and `lcc-spares.css`):

| Width | Behaviour |
|---|---|
| ?760 px | Phone layout: sidebar collapses, module workbench releases its fixed height and scrolls with the page, toolbars scroll horizontally |
| 761 px+ | Desktop shell: 236 px sidebar, module workbench aligned inside the 28 px page gutter, page-level horizontal scrollbar appears only when the window is narrower than the module's `--wb-min-width` |
| ?1240 px | LCC-PM / LCC-CM stack input above results (the results column would drop below 420 px) |
| ?1400 px | Spare Parts stacks earlier than LCC because its grid has twelve columns |

Scrollbar policy: a scrollbar is added only where content genuinely exceeds its
container ? the module shell when the window is narrower than the module's
working width, a dense table below its `--wb-table-min` floor, a result section
whose period table is wider than its column, and a stacked input panel capped at
300 px. No panel clips its content silently.

Login page switches to mobile layout with stacked panels.

## 8. States & Feedback

| State | Treatment |
|---|---|
| Loading | Button disabled with text change |
| Error | `.form-error` with role="alert" |
| Success | Implicit via navigation |
| Empty | Starter data shown or empty states |
| Hover/Focus | Standard browser + custom styles |

## 9. Accessibility Notes

- Semantic HTML (`main`, `section`, `form`, `nav`)
- Labels associated with inputs
- ARIA roles where needed (`role="alert"`)
- Keyboard navigable
- Focus states present

## 10. Design Assets

- Brand mark: "R" in styled div
- Network diagram SVG in login visual
- Custom icons throughout
- No external image dependencies