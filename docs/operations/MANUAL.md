# RAMSport user manual

Step-by-step guide to running RAMSport and using every module. Follow the sections in
order the first time; after that, jump to the section you need.

---

## 1. Start the application

Install Node.js 20 or newer, then run:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000/>. For a production build, use `npm run build` followed by
`npm run start`.

What happens:

1. npm installs the pinned dependencies.
2. Next.js builds the interface and serves it on port 3000, including the `/api/*` handler.
3. The server stores workspace data in MongoDB when `MONGODB_URI` is set, or in
   `.ramsport-data/` otherwise. The browser only holds a signed session cookie.

Workspace files, accounts and profile settings live on the server, so they follow you to
another browser or device that signs in with the same account.

---

## 2. Sign in

1. The landing page opens at `/`. Click **Sign in** (or go to <http://localhost:3000/login>).
2. Enter your username and password, then submit.
3. On an evaluation build, the **Test access** card under the form shows the shared
   `test` / `test` account and a **Use test credentials** button that fills the form.

Accounts:

| Account | How to get it |
|---|---|
| `siva905` | Built-in administrator. Opens the **Admin** tab directly. |
| `test` | Built-in evaluation account (password `test`). |
| `user` | Built-in standard account for shared workstations (password `user`). |
| Any other user | Created for you by an administrator (see section 10). |

Built-in accounts are seeded on first use. An account created by an administrator is stored
in the server directory, so it can sign in from any browser or device.

A failed login shows an error on the form and is rate-limited; wait a moment and try again.
Set `NEXT_PUBLIC_SHOW_TEST_ACCESS=off` before a public production build to hide the test hint.

**Log out** any time from the account menu in the top-right corner ? **Log out**. This clears
the session cookie and returns you to the login page.

---

## 3. Tour of the interface

```
????????????????????????????????????????????????????????????
? Brand    ? Topbar: breadcrumb ? global search ? account  ?
? Search   ?????????????????????????????????????????????????
?          ?                                               ?
? Files    ?  Page content (file tree, workbenches, ?)     ?
? Data Reg ?                                               ?
? RBD      ?                                               ?
? FTA      ?                                               ?
? ?        ?                                               ?
?          ?                                               ?
? Admin    ?                                               ?
????????????????????????????????????????????????????????????
```

- **Sidebar** ? navigation. Active module is highlighted. Modules marked **Soon** are
  planned and not clickable yet.
- **Sidebar search box** ? quick filter over the navigation items.
- **Topbar** ? shows where you are: the current folder/document path on the left, and on
  the right the global search plus your account button (avatar).
- **Ctrl + K** (?K on macOS) ? opens/closes the global search overlay from anywhere.
- **Account button** (top-right, your avatar) ? opens the account menu with **Profile**
  and **Log out**.

---

## 4. Files (dashboard) ? the file manager

The dashboard is a real tree explorer over your account's `project/` folder on the server.
Everything you see is read from the server, and every change you make is written back to it.

### 4.1 Understand the layout

- **Toolbar** (top) ? refresh button, breadcrumb path, **Search files** box,
  **New project**, **New folder**, **New document** (dropdown with the six document types)
  and a sort selector (Name / Modified / Type).
- **Tree panel** (left) ? heading **Project files** with project/file/size totals in the
  footer, and the expandable tree itself.
- The tree has three root entries: your **projects**, a **Recent files** view, and
  whatever folders/documents live inside the selected project.

### 4.2 Create a project

1. Click **New project** (toolbar or tree empty state).
2. The project is created immediately as **New project** and its row becomes a text field.
3. Type the name and press **Enter** (or click elsewhere). Press **Escape** to keep the
   default name.

RAMSport creates the project folder on the server. Projects are plain folders: create the
documents and sub-folders you need with **New folder** and **New document**. The tree
refreshes automatically.

### 4.3 Create folders and documents

1. Select the project or folder that should contain the new entry.
2. Click **New folder**, or open **New document** and choose a document type.
3. The entry is created with a unique default name (**New folder**, **New RBD (2)**, ?) and
   its row becomes a text field.
4. Type the name and press **Enter**. **Escape** keeps the default name.

For documents, only the base name is selected, so the extension (`.rbd`, `.fta`, `.data`,
`.wbl`, `.217f`, `.fmeca`) is preserved. Names must be unique inside a folder, ignoring
letter case; a duplicate is reported under the tree and the field stays open so you can
correct it.

### 4.4 Navigate

- Click a **project** to expand it; click a **folder** to expand and browse inside it.
- Click a **document** (`.rbd`, `.fta`, `.data`, `.wbl`, `.217f`, `.fmeca`) to open it in
  its workbench ? the address bar gains `?project=?&file=?`.
- Use the **breadcrumb** at the top to jump back to any ancestor folder.
- **Recent files** shows the documents you touched most recently.

### 4.5 Search

1. Type in the **Search files** box.
2. The tree switches to search results with a **match count**; folders are matched by
   name and documents by name or path.
3. Press **Enter** or click a result to open it; double-click also opens folders.
4. Clear the box (or click **Files** in the breadcrumb) to return to browsing.

### 4.6 Rename and delete

- **Rename** ? right-click the row and choose **Rename**, or press **F2**. The name becomes
  an editable field in place; press **Enter** or click elsewhere to save, **Escape** to
  cancel. For documents only the base name is selected, so the extension is kept. A name
  that already exists in the folder (ignoring case) is refused and the field stays open.
- **Delete** ? right-click and choose **Delete**, or press **Delete**. A confirmation
  dialog appears before the file or folder is removed.

Right-click any row for the full context menu:

| Action | What it does |
|---|---|
| **Open folder / Open document** | Navigates into a folder or opens a document. |
| **Rename** | Turns the row into an inline name field. |
| **New** | Submenu: **Folder** or any of the six document types (folders only). |
| **Delete** | Removes the file or the whole folder ? asks for confirmation first. |

The **New folder** and **New document** toolbar buttons create the entry inside the
currently selected folder; if no folder is selected they are disabled until you select one.

### 4.7 Keyboard shortcuts (file tree)

| Key | Action |
|---|---|
| **? / ?** | Move between rows |
| **?** | Expand a folder (or step into the first child) |
| **?** | Collapse a folder (or move to the parent) |
| **Home / End** | First / last row |
| **Enter** | Open the selected row |
| **\*** | Expand every sibling of the current row |
| **F2** | Rename the selected item |
| **Delete** | Delete the selected item |

### 4.8 Details

- The dashboard reads from the server every time it loads, so a refresh (the **?**
  button or the browser refresh) always shows the current files.
- Renaming or deleting here changes what a document's URL resolves to ? open documents
  by their current path afterwards.
- The footer shows totals: number of projects, number of files, and total size.

---

## 5. Data Register

The Data Register is your asset reliability database ? one row per component with
reliability and maintainability fields. Every analysis module reads from it.

1. Open **Data Register** from the sidebar (or open a `.data` document from Files).
2. **Import CSV** ? upload a CSV; its header row maps to the register columns.
3. **Add row** / **Delete row** ? manage entries from the ribbon.
4. Edit cells directly in the grid; calculated fields (marked **?**) update automatically.
5. Use the **Find component** box to filter rows.
6. **Export** (see section 8) produces PDF, XLSX, PPTX or DOCX of the register.

Changes autosave to the document on the server.

---

## 6. RBD and FTA workbenches

Both workbenches share the same toolbar and flow; RBD follows **IEC 61078**, FTA follows
**IEC 61025**.

### 6.1 Toolbar

| Control | Action |
|---|---|
| **Pan** | Toggle pan mode for dragging the canvas. |
| **Undo / Redo** | `Ctrl+Z` / `Ctrl+Y` (also `?` on macOS). |
| **Calculate** | Runs the analysis and replaces the right pane with results. |
| **Clear** | Empties the canvas (asks for confirmation). |

### 6.2 Build a diagram

1. The left **library** lists components from your Data Register ? drag one onto the
   canvas or click it to add it. Use the library's refresh (?) to pull in new register
   rows.
2. RBD additionally offers **Reusable groups**: select two or more blocks, group them,
   and re-use the group anywhere.
3. Drag blocks to arrange them; select a block to inspect and edit its data (reliability,
   failure rate, etc.) before calculating. Multi-select with `Ctrl`/`?` + click.
4. Right-click a block for block-specific actions (e.g. gate choices in FTA).

### 6.3 Analyse

1. Click **Calculate**.
2. The right pane shows the result values (probability, unavailability, criticality?).
3. Click **Explanation** for the step-by-step derivation, block by block.

### 6.4 Save

Edits autosave: after a short pause of typing/dragging, and when you close or navigate
away from the page. The document path in the address bar is the file being written.

---

## 7. Weibull, MIL-217F and FMEA/FMECA workbenches

All three use the same workbench shell: a toolbar, a component/part list from the project
Data Register, and a results panel. Save through the shared **Save** dialog to create a
`.wbl`, `.217f` or `.fmeca` document inside the project.

### 7.1 Weibull analysis (IEC 61649)

1. Open **Weibull** from the sidebar or a `.wbl` document.
2. Enter failure times and quantities, or mark a point as suspended. Use **Annex B**,
   **Annex E** or **Weibayes** to load a worked example.
3. Choose the estimation method, regression direction, confidence level and whether to fit a
   third parameter.
4. Read ?, ?, B-lives, the probability plot and the mission-time reliability. Add mission
   times to see reliability and unreliability at specific hours.

### 7.2 RAM prediction (MIL-HDBK-217F Notice 2)

1. Open **RAM Prediction** or a `.217f` document.
2. Add parts from the Data Register or manually. Each part uses a MIL-HDBK-217F model
   (resistor, capacitor, IC, relay, connector, and so on) with its own stress inputs.
3. Set the environment, ambient temperature, temperature rise and mission time.
4. The parts-stress method computes ?b, the ? factors, ?p and the contribution per part,
   plus the total failure rate and MTBF. The selected-part card shows the effective base rate.

### 7.3 FMEA / FMECA (EN 50126-1 ? MIL-STD-1629A)

1. Open **FMEA / FMECA** or a `.fmeca` document.
2. Add items from the Data Register or manually; each item can have several failure modes.
3. Record the cause, mission phase, local/next/end effect, detection and compensating
   provisions.
4. Choose the EN 50126 severity (S1?S5) and frequency class. The risk matrix colours each
   cell and the module derives the risk level.
5. Switch between **FMEA** and **FMECA** in the toolbar. FMECA adds the MIL-STD-1629A
   criticality columns (Cm/Cr); FMEA exports omit them.

---

## 8. Opening documents directly

Every document has a stable URL, for example:

```
http://localhost:3000/rbd?project=Line%201&file=Line%201/RBD/Line%201.rbd
http://localhost:3000/fta?project=Line%201&file=Line%201/FTA/Line%201.fta
http://localhost:3000/data-register?project=Line%201&file=Line%201/Data%20Register/Line%201.data
http://localhost:3000/weibull?project=Line%201&file=Line%201/Weibull/Life.wbl
http://localhost:3000/mil-std-217f?project=Line%201&file=Line%201/Prediction/Board.217f
http://localhost:3000/fmeca?project=Line%201&file=Line%201/FMECA/Modes.fmeca
```

Bookmarks and links like these open the document straight into its workbench (you must
be signed in first).

---

## 9. Exports

Every workbench and the Data Register have an **Export** button in the page header that
opens the export dialog with four formats:

| Format | Contents |
|---|---|
| **PDF** | Report with the scaled diagram image, calculation table, and explanation. |
| **XLSX** | Spreadsheet with the data table (Excel). |
| **PPTX** | Slides with the diagram as editable PowerPoint objects plus the table. |
| **DOCX** | Word report with the diagram, table, and written explanation. |

Pick a format and confirm; the file downloads through your browser.

---

## 10. Profile and profile photo

1. Click your **avatar** in the top-right corner ? **Profile** (or visit
   <http://localhost:3000/profile>).
2. **Account details** card (left):
   - Shows your display name, username, and role.
   - **Edit the photo directly on the image**: click the **camera/edit badge** on the
     bottom-right of the avatar to pick a PNG, JPEG or WebP file (up to 5 MB).
   - A yellow **?New photo ? save to apply?** badge appears while a new photo is staged;
     use **Cancel new photo** to discard it, or **Remove photo** to drop the current one
     (it reverts to the generated default once you save).
3. **Account form** (right): change your **Display name**, then click **Save changes**.
   Photo and name changes apply together on save.

**Default photos:** until you upload one, every account gets a bundled line-art avatar
chosen deterministically from your name ? the same person always gets the same picture. It
is shown on the profile page and in the top-right account button, and is replaced
automatically as soon as you save a real photo. You can also choose one of the stock
avatars directly on the profile page.

---

## 11. Administration (administrators only)

Signed in as an administrator, an **Admin** item appears in the sidebar:

1. Open **Admin** ? **User Management**.
2. Create a user: enter a **username** and a **password** (at least 12 characters, with an
   uppercase letter, a lowercase letter and a number) and confirm. Share the credentials
   with that person ? they sign in with them (section 2).
3. Existing users are listed with their role; administrators can remove accounts from
   the same page. Built-in accounts and your own account cannot be removed.

Administrators open `/admin` directly after signing in. Every account action is recorded
in the audit log.

---

## 12. Where your data lives

| Data | Location |
|---|---|
| Projects, documents, photos | The server: MongoDB (`MONGODB_URI`) or `.ramsport-data/` in development. |
| Accounts, profile metadata, save locations, audit events | The same server store. |
| Session | Signed `ramsport_session` HttpOnly cookie in your browser. |

Each account has its own isolated records; the server derives ownership from the session and
ignores any ownership values sent by the page. Back up the MongoDB database or the data
directory, and export important documents to your normal engineering document system as an
additional copy.

---

## 13. Troubleshooting

| Symptom | What to do |
|---|---|
| ?Node.js was not found? | Install the current Node.js LTS release and re-run `npm run dev`. |
| Port 3000 used by another program | Stop that program, or run `npm run start -- --port 3001` and use that port. |
| Changes look stale | Press **?** in the file toolbar or refresh the browser; the tree re-reads the server. |
| Login fails repeatedly | Wait a few seconds (login is rate-limited), then retry; administrators can reset access by re-creating the user. |
| Photo will not upload | Must be PNG, JPEG or WebP and ? 5 MB. |
| ?This workspace snapshot is too large? | Reduce the document or module data; scratchpads are capped at 5 MB. |
| Data disappears after redeploy | Set `MONGODB_URI`; the filesystem fallback is ephemeral on serverless hosts. |
| Build errors after editing code | Run `npx tsc --noEmit`, fix errors, then run `npm run build`. |
| Want a clean rebuild | Stop the server, delete `.next`, then run `npm run build` again. |

---

## 14. Quick reference

| Task | Path |
|---|---|
| Landing page | `/` |
| Sign in | `/login` |
| Files (file manager) | `/dashboard` |
| Data Register | `/data-register` |
| RBD workbench | `/rbd?project=?&file=?` |
| FTA workbench | `/fta?project=?&file=?` |
| Weibull analysis | `/weibull?project=?&file=?` |
| MIL-HDBK-217F prediction | `/mil-std-217f?project=?&file=?` |
| FMEA / FMECA | `/fmeca?project=?&file=?` |
| Profile & photo | `/profile` |
| Admin (administrators) | `/admin` |
| Global search | `Ctrl+K` |
| Tree shortcuts | `????`, `Home`, `End`, `Enter`, `*`, `F2`, `Delete` |
| Undo / redo in workbenches | `Ctrl+Z` / `Ctrl+Y` |

For design and engineering context see [APP_FLOW.md](APP_FLOW.md),
[STRUCTURE.md](STRUCTURE.md), and the rest of the [index](INDEX.md).
