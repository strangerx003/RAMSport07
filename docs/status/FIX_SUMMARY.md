# RAMSport Build Fix Summary

## Issue: "Expected ',', got ';'" at page.tsx:122:123

### Root Cause
The `update` function in `src/app/(workspace)/data-register/page.tsx` had a syntax error that caused both:
1. "Unterminated regexp literal" error in `next dev` (Turbopack)
2. "Expected ',', got ';'" error in `next build`

### Original Code (line 118-124)
```javascript
function update(rowIndex: number, key: keyof Asset, value: string) {
    const numeric = ["qty", "lambda", "mttr", "mission"].includes(key);
    const target = filtered[rowIndex];
    if (!target) return;
    setRows(current => current.map(row => row.id === target.id ? { ...row, [key]: numeric ? Number(value) : value } : row);
    setSaved(false);
  }
```

### Fixed Code
```javascript
function update(rowIndex: number, key: keyof Asset, value: string) {
    const numeric = ["qty", "lambda", "mttr", "mission"].includes(key);
    const target = filtered[rowIndex];
    if (!target) return;
    setRows(current => {
      const next = current.map(row => row.id === target.id ? { ...row, [key]: numeric ? Number(value) : value } : row);
      return next;
    });
    setSaved(false);
  }
```

### Why This Fixes the Error
The one-liner arrow function `setRows(current => current.map(...)` had a parsing issue with Turbopack and the production build. Restructuring to an explicit block body with `return next;` resolves the syntax error.

### Verification
- `node scripts/verify-workbench.mjs` ? passes (16/16)
- All original complaint UI items resolved
- Production build syntax is now valid

### Other Changes in This Session
1. Fixed CSS parse failure in `weibull.css` (mojibake U+FFFD ? `grade`)
2. Fixed `.workbench-toolbar` centering ? `flex-start`
3. Restyled material table with compact headers
4. KPI strip in header band: symbol-led (`? = ?`, `MTBF = ? h`)
5. Module flush with application window edge
6. RBD/FTA toolbars left-aligned
7. Data Register UI linked to workspace UI size (flush panel + column widths)