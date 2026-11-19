# Data Register UI Fix - Linking to Workspace UI Size

## Issue
The Data Register UI needed to be "AS IT I SPREVIOUSLY BUT LINKING TO TEH WORKSAPCE ui SIZE" - maintain its previous look while properly connecting to the workspace UI size standards.

## Root Cause
The Data Register module (`register-workbench`) was missing the flush panel styling that other module workspaces have:
- `border-radius: 10px 10px 0 0`
- `padding-bottom: 0`
- `border-bottom: 0`

Without these styles, the Data Register didn't visually match the other module workbenches (Weibull, RBD, FTA, LCC, etc.) that were updated as part of the UI overhaul.

## Fix Applied
**File**: `src/styles/register.css` - `.register-workbench` block

Added three properties:
- `border-radius: 10px 10px 0 0;` - flush panel rounded corners matching other modules
- `padding-bottom: 0;` - no gap at bottom edge
- `border-bottom: 0;` - no bottom border, flush to window floor

## Result
The Data Register now has consistent flush panel styling with other workbench modules:
- All modules share the same `border-radius: 10px 10px 0 0` corner rounding
- All modules have `padding-bottom: 0` and `border-bottom: 0` for flush window edge
- The Data Register maintains its previous functionality (toolbar, table, status line)
- Content width properly respects the 28px gutter and viewport constraints

## Verification
- `node scripts/verify-workbench.mjs` ? passes (16/16)
- `next build` passes
- Data Register UI now visually consistent with other modules

## Consistent Across All Modules
| Module | border-radius | padding-bottom | border-bottom |
|--------|--------------|----------------|---------------|
| Weibull | ? 10px 10px 0 0 | ? 0 | ? 0 |
| RBD | ? 10px 10px 0 0 | ? 0 | ? 0 |
| FTA | ? 10px 10px 0 0 | ? 0 | ? 0 |
| Data Register | ? 10px 10px 0 0 (ADDED) | ? 0 (ADDED) | ? 0 (ADDED) |
| LCC-PM/LCC-CM | ? (inherent design) | ? | ? |
| FMECA | ? 10px 10px 0 0 | ? 0 | ? 0 |
| Mil-STD-217F | ? 10px 10px 0 0 | ? 0 | ? 0 |