// Regression checks for the server-backed RAMSport build.
//
// The browser owns no data any more: the account session is an HttpOnly cookie
// and every project, document, profile and module scratchpad is stored by the
// server. These checks assert that architecture plus the analysis modules, the
// Data Register bridge and the deployment configuration.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const has = (path) => existsSync(new URL(`../${path}`, import.meta.url));

function sourceFiles(directory) {
  const root = new URL(`../${directory}/`, import.meta.url);
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...sourceFiles(`${directory}/${entry.name}`));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(`${directory}/${entry.name}`);
  }
  return files;
}

const layout = read("src/app/layout.tsx");
const nextConfig = read("next.config.ts");
const packageJson = read("package.json");
const loginScreen = read("src/components/auth/LoginScreen.tsx");
const api = read("src/server/api.ts");
const store = read("src/server/store.ts");
const sessionServer = read("src/server/session.ts");
const usersServer = read("src/server/users.ts");
assert.match(usersServer, /mutateRecord<StoredUser\[\]>/, "User mutations must persist the user directory array");
assert.match(usersServer, /return users;/, "User mutations must return the updated directory to storage");
assert.doesNotMatch(usersServer, /mutateRecord<Outcome>/, "User mutations must not persist an API outcome wrapper");
const cryptoServer = read("src/server/crypto.ts");
const routeHandler = read("src/app/api/[...path]/route.ts");
const adminPage = read("src/app/(workspace)/admin/page.tsx");
const usersClient = read("src/services/auth/users.ts");
const sessionClient = read("src/services/auth/session.ts");
const fileManager = read("src/components/files/FileManager.tsx");
const profilePage = read("src/app/(workspace)/profile/page.tsx");
const appShell = read("src/components/layout/AppShell.tsx");

// --- No browser-side storage ------------------------------------------------

const allSource = sourceFiles("src");
assert.equal(allSource.length > 40, true, "The source scan must cover the whole application");
for (const file of allSource) {
  const text = read(file);
  assert.doesNotMatch(
    text,
    /window\.localStorage|window\.sessionStorage|localStorage\.(get|set|remove)Item|sessionStorage\.(get|set|remove)Item|indexedDB\.open/,
    `${file} must not persist data in browser storage`,
  );
}
assert.equal(has("src/services/local-api"), false, "The browser API shim must be removed");
assert.equal(has("src/components/system/LocalApiProvider.tsx"), false, "The browser API provider must be removed");
assert.doesNotMatch(layout, /LocalApiProvider|localStorage|sessionStorage/, "The root layout must not install browser storage");
assert.match(layout, /cookies\(\)/, "The root layout must read the theme cookie on the server");
assert.match(layout, /ramsport-theme/, "The theme preference must be a first-party cookie");
assert.match(sessionClient, /\/api\/auth\/session/, "The client must ask the server who is signed in");
assert.doesNotMatch(sessionClient, /accountStorageKey|createLegacyAccountId/, "The client session must not use legacy account keys");
assert.match(
  sessionClient,
  /export function primeAccountSession/,
  "Sign-in must be able to replace the memoised session",
);
assert.match(
  loginScreen,
  /primeAccountSession\(\{/,
  "The login screen must prime the session before navigating, or the shell bounces back to /login",
);
assert.doesNotMatch(
  loginScreen,
  /router\.push\(user\.role === "admin"/,
  "Login must replace the history entry so Back does not return to the form",
);

// --- Server persistence -----------------------------------------------------

assert.match(store, /MONGODB_URI/, "The store must use MongoDB when MONGODB_URI is configured");
assert.match(store, /import\("mongodb"\)/, "The MongoDB driver must be loaded lazily on the server");
assert.match(store, /RAMSPORT_DATA_DIR/, "The filesystem fallback must be configurable");
assert.match(store, /export async function mutateRecord/, "Writes must go through optimistic concurrency");
assert.match(store, /version/, "Records must carry a version for optimistic concurrency");
assert.match(store, /rename\(/, "Filesystem writes must be atomic renames");
assert.match(store, /getSessionSecret/, "The session secret must be persisted server-side");
assert.match(nextConfig, /serverExternalPackages:\s*\["mongodb"\]/, "The MongoDB driver must stay out of the bundler");
assert.match(packageJson, /"mongodb":/, "The MongoDB driver must be a dependency");
assert.doesNotMatch(packageJson, /dotnet|backend\/RAMSport\.Api/, "The build must not depend on the retired C# API");
assert.doesNotMatch(nextConfig, /RAMSPORT_API_URL|destination:.*\/api\/:path\*/, "Next.js must not proxy /api/* to a backend");
assert.match(routeHandler, /runtime = "nodejs"/, "API routes must run in the Node.js runtime");
assert.match(routeHandler, /dynamic = "force-dynamic"/, "API responses must never be cached");

// --- Signed session cookie --------------------------------------------------

assert.match(sessionServer, /SESSION_COOKIE = "ramsport_session"/, "The session cookie must keep its name");
assert.match(sessionServer, /createHmac\("sha256"/, "Session tokens must be HMAC-SHA-256 signed");
assert.match(sessionServer, /timingSafeEqual/, "Signatures must be compared in constant time");
assert.match(sessionServer, /SESSION_MAX_AGE_SECONDS = 8 \* 60 \* 60/, "Sessions must expire after eight hours");
assert.match(sessionServer, /HttpOnly/, "The session cookie must be HttpOnly");
assert.match(sessionServer, /SameSite=Lax/, "The session cookie must be SameSite=Lax");
assert.match(sessionServer, /export function isSameOriginRequest/, "State changes must reject cross-site origins");
assert.match(sessionServer, /export async function verifySessionToken/, "Every request must re-verify the token");

// --- Ownership rules --------------------------------------------------------

assert.match(api, /function ownerAccountId\(/, "Account ids must be validated before use in a record key");
assert.match(api, /ACCOUNT_ID_PATTERN/, "Account ids must be pattern-checked");
assert.match(api, /function rowKey\(resource: string, accountId: string\)/, "Every record key must be scoped to an owner");
assert.match(api, /rowKey\("files", accountId\)/, "File rows must be owned by the signed-in account");
assert.match(api, /rowKey\("profile", user\.accountId\)/, "Profile rows must be owned by the signed-in account");
assert.match(api, /workspaceRecordKey\(user\.accountId, key\)/, "Module scratchpads must be owned by the signed-in account");
assert.match(api, /requireUser\(request\)/, "Ownership must come from the session cookie");
assert.doesNotMatch(api, /body\.accountId|payload\?\.accountId/, "Ownership must never be accepted from the request body");
assert.match(api, /requireUser\(request, true\)/, "Administrator endpoints must require the administrator role");
assert.match(api, /Administrator access required\./, "Non-administrators must be rejected by admin endpoints");
assert.match(api, /WORKSPACE_KEY_PATTERN/, "Workspace keys must be validated");
assert.match(api, /isSameOriginRequest\(request\)/, "Mutating API calls must check the request origin");

// --- API contract -----------------------------------------------------------

for (const endpoint of [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/files",
  "/api/files/content",
  "/api/profile",
  "/api/profile/image",
  "/api/save-locations",
  "/api/workspace",
  "/api/admin/users",
  "/api/health",
]) {
  assert.match(api, new RegExp(`"${endpoint.replace(/[/.]/g, "\\$&")}`), `The API must expose ${endpoint}`);
}
assert.match(api, /set-cookie": sessionCookie\(token, request\)/, "Sign-in must set the signed session cookie");
assert.match(api, /set-cookie": clearSessionCookie\(request\)/, "Sign-out must clear the session cookie");
assert.match(api, /storage: process\.env\.MONGODB_URI \? "mongodb" : "filesystem"/, "The health endpoint must report the active store");
assert.match(api, /\.wbl/, "The API must accept Weibull documents");
assert.match(api, /\.217f/, "The API must accept MIL-217F documents");
assert.match(api, /\.fmeca/, "The API must accept FMECA documents");
assert.match(api, /action === "create-document"/, "The API must create typed documents from the file manager");
assert.match(api, /DOCUMENT_TEMPLATES/, "New documents must start from a typed document template");
assert.match(api, /weibull-iec61649-v1/, "New Weibull files must start from the Weibull document shape");
assert.match(api, /mil217f-notice2-v1/, "New prediction files must start from the MIL-217F document shape");
assert.match(api, /mil-std-1629a-v1/, "New FMECA files must start from the FMECA document shape");
assert.match(api, /weibull: "\.wbl"/, "The save-location record must remember the Weibull extension");
assert.match(api, /mil217f: "\.217f"/, "The save-location record must remember the MIL-217F extension");
assert.match(api, /fmeca: "\.fmeca"/, "The save-location record must remember the FMECA extension");
assert.doesNotMatch(api, /for \(const folder of \["RBD"/, "Creating a project must create only the project folder");

// --- Built-in accounts ------------------------------------------------------

assert.match(usersServer, /username: "siva905"/, "The built-in administrator must remain available");
assert.match(usersServer, /username: "test"/, "The test account must remain available");
assert.match(usersServer, /username: "user"/, "The standard user account must exist");
assert.match(usersServer, /HmtnVvMDMZFyTEVeXctOwA4v4Ot\/y4\/38rql0doYUrg=/, "The user account must keep the verified password hash");
assert.match(usersServer, /updateUsers/, "The user directory must be updated atomically");
assert.match(api, /The standard user account cannot be removed/, "Built-in accounts must be protected from deletion");
assert.match(cryptoServer, /310_000/, "Password verification must keep the PBKDF2 iteration count");
assert.match(cryptoServer, /sha256/, "Password verification must keep PBKDF2-SHA-256");
assert.match(usersClient, /isBuiltInAccount/, "The client must know which accounts cannot be removed");

// --- Server-backed UI copy --------------------------------------------------

assert.match(loginScreen, /NEXT_PUBLIC_SHOW_TEST_ACCESS/, "The evaluation hint must be switchable for production");
assert.match(loginScreen, /Test access/, "The sign-in screen must label the evaluation account");
assert.match(loginScreen, /TEST_USERNAME = "test"/, "The evaluation hint must name the test account");
assert.match(loginScreen, /useTestCredentials/, "The evaluation hint must offer one-click credential fill");
assert.doesNotMatch(adminPage, /next\/headers|backendUrl/, "The admin page must be guarded in the browser, not by a server layout");
assert.doesNotMatch(adminPage, /browser workspace|in the browser/, "Admin copy must describe server storage");
assert.match(adminPage, /server workspace/, "Admin copy must describe server storage");
assert.match(fileManager, /Server workspace/, "Storage copy must describe the server workspace");
assert.match(fileManager, /stored on the server/, "Storage copy must describe server storage");
assert.doesNotMatch(fileManager, /in this browser|browser storage|Local workspace|local workspace/, "Storage copy must not mention browser storage");
assert.match(profilePage, /stored on the server/, "Profile copy must describe server storage");
assert.doesNotMatch(profilePage, /stored only in this browser/, "Profile copy must not mention browser storage");

// --- Avatars ----------------------------------------------------------------

const avatarArt = read("src/lib/avatar-art.ts");
const avatarComponent = read("src/components/profile/Avatar.tsx");
const professionalCss = read("src/styles/professional.css");
assert.match(avatarArt, /export function isStockAvatarSrc/, "Only bundled illustrations may be mirrored");
assert.match(avatarComponent, /avatar-mirrored/, "The avatar must apply the mirroring class");
assert.match(professionalCss, /\.avatar-mirrored\{transform:scaleX\(-1\)\}/, "Bundled avatars must be mirrored horizontally");
assert.match(professionalCss, /\.avatar-stock-option img\{[^}]*transform:scaleX\(-1\)/, "Stock-picker thumbnails must be mirrored");

// --- Module engines ---------------------------------------------------------

const weibullEngine = read("src/engine/weibull.ts");
const weibullWorkbench = read("src/components/weibull/WeibullWorkbench.tsx");
const mil217fEngine = read("src/engine/mil217f.ts");
const mil217fWorkbench = read("src/components/mil217f/Mil217fWorkbench.tsx");
const fmecaEngine = read("src/engine/fmeca.ts");
const fmecaWorkbench = read("src/components/fmeca/FmecaWorkbench.tsx");
assert.match(fmecaWorkbench, /warning, index/, "FMECA warnings must use collision-safe list keys");
assert.match(fmecaWorkbench, /fmeca-column-resizer/, "FMECA worksheet columns must remain user-resizable");
assert.match(weibullWorkbench, /weibull-column-resizer/, "Weibull input and material-analysis columns must remain user-resizable");
const fmecaPage = read("src/app/(workspace)/fmeca/page.tsx");
const en50126Engine = read("src/engine/en50126.ts");
const workspaceData = read("src/data/workspace.ts");
const documentContext = read("src/lib/document-context.ts");
const documentKinds = read("src/lib/document-kinds.ts");
const saveDialog = read("src/components/documents/SaveDialog.tsx");
const fileBrowser = read("src/components/files/FileBrowser.tsx");
const designSystemCss = read("src/styles/design-system.css");
const projectRegister = read("src/services/documents/project-register.ts");
const diagramEditor = read("src/components/rbd/DiagramEditor.tsx");
const ftaEditor = read("src/components/fta/FTAEditor.tsx");
assert.match(ftaEditor, /connectTopLevelItems/, "FTA topology errors must offer a guided repair for disconnected roots");
assert.match(ftaEditor, /routeRbdConnection/, "FTA connectors must use obstacle-aware orthogonal routing");
assert.match(ftaEditor, /more than one parent/, "FTA connections must enforce the single-parent tree rule");

assert.match(weibullEngine, /IEC 61649/, "The Weibull engine must implement IEC 61649");
assert.match(weibullEngine, /export function analyzeWeibull/, "The Weibull engine must expose a single analysis entry point");
assert.match(weibullEngine, /export function weibullCdf/, "The Weibull engine must expose the cumulative distribution");
assert.match(weibullEngine, /export function weibullBLife/, "The Weibull engine must expose B-life calculation");
assert.match(weibullWorkbench, /SaveDialog/, "The Weibull workbench must save through the shared document dialog");
assert.match(weibullWorkbench, /analyzeWeibull/, "The Weibull workbench must run the shared engine");
assert.match(weibullWorkbench, /await readWeibull\(\)/, "The Weibull workbench must hydrate from the server");
assert.match(weibullEngine, /evaluateMaterialLife/, "The Weibull engine must evaluate LRU material life");
assert.match(weibullEngine, /WEIBULL_MATERIAL_LIBRARY/, "The Weibull engine must publish the material ?/? library");
assert.match(weibullWorkbench, /weibull-material-table/, "The Weibull workbench must render the LRU expected-life table");
assert.match(weibullWorkbench, /weibull-formula-reference/, "The Weibull workbench must state the key formulas");

assert.match(mil217fEngine, /MIL-HDBK-217F/, "The prediction engine must implement MIL-HDBK-217F");
assert.match(mil217fEngine, /export function analyzeMil217f/, "The prediction engine must expose a single analysis entry point");
assert.match(mil217fEngine, /export function arrheniusPiT/, "The prediction engine must expose the Arrhenius temperature factor");
assert.match(mil217fEngine, /export const MIL217F_MODELS/, "The prediction engine must expose the part model library");
assert.match(mil217fEngine, /parts.?stress/i, "The prediction engine must document the parts-stress method");
assert.match(mil217fWorkbench, /analyzeMil217f/, "The prediction workbench must run the shared engine");
assert.match(mil217fWorkbench, /SaveDialog/, "The prediction workbench must save through the shared document dialog");
assert.match(mil217fWorkbench, /selectedResult\.lambdaB/, "The selected-part card must show the effective base rate (?b/?g)");
assert.match(mil217fWorkbench, /await readMil217f\(\)/, "The prediction workbench must hydrate from the server");

assert.match(fmecaEngine, /MIL-STD-1629A/, "The FMECA engine must implement MIL-STD-1629A");
assert.match(fmecaEngine, /export function analyzeFmeca/, "The FMECA engine must expose a single analysis entry point");
assert.match(fmecaEngine, /Cm = ? ? ? ? ?p ? t/, "The FMECA engine must implement the mode criticality formula");
assert.match(fmecaWorkbench, /analyzeFmeca/, "The FMECA workbench must run the shared engine");
assert.match(fmecaWorkbench, /SaveDialog/, "The FMECA workbench must save through the shared document dialog");
assert.match(fmecaWorkbench, /"fmea"/, "The FMECA workbench must offer the FMEA view");
assert.match(fmecaWorkbench, /"fmeca"/, "The FMECA workbench must offer the FMECA view");
assert.match(fmecaWorkbench, /await readFmeca\(\)/, "The FMECA workbench must hydrate from the server");
assert.match(fmecaWorkbench, /fmeca-matrix/, "The FMECA workbench must show the EN 50126 risk matrix");
assert.match(fmecaPage, /exportColumns/, "The FMECA export must drop Cm/Cr columns in qualitative FMEA mode");

assert.match(workspaceData, /weibull-iec61649-v1/, "Saved Weibull documents must carry a formula version");
assert.match(workspaceData, /mil217f-notice2-v1/, "Saved prediction documents must carry a formula version");
assert.match(workspaceData, /mil-std-1629a-v1/, "Saved FMECA documents must carry a formula version");
assert.match(workspaceData, /\/api\/workspace/, "Module scratchpads must be stored on the server");
assert.match(workspaceData, /export async function saveAssets/, "Register snapshots must be written asynchronously");
assert.match(documentKinds, /extension: "\.wbl"/, "The document router must map .wbl files to the Weibull module");
assert.match(documentKinds, /extension: "\.217f"/, "The document router must map .217f files to the prediction module");
assert.match(documentKinds, /extension: "\.fmeca"/, "The document router must map .fmeca files to the FMECA module");
assert.match(documentContext, /fmeca: "fmeca"/, "The document router must map .fmeca files to the FMECA module");
assert.match(appShell, /href: "\/weibull"/, "The sidebar must link to the Weibull module");
assert.match(appShell, /href: "\/mil-std-217f"/, "The sidebar must link to the prediction module");
assert.match(appShell, /href: "\/fmeca"/, "The sidebar must link to the FMECA module");
assert.match(saveDialog, /weibull: "\.wbl"/, "The save dialog must name Weibull files with .wbl");
assert.match(saveDialog, /mil217f: "\.217f"/, "The save dialog must name prediction files with .217f");
assert.match(saveDialog, /fmeca: "\.fmeca"/, "The save dialog must name FMECA files with .fmeca");
assert.match(saveDialog, /New folder/, "The save dialog must allow creating a folder in place");
assert.equal(has("src/components/files/NewFileDialog.tsx"), false, "File creation must be inline; the modal new-file dialog must be gone");
assert.doesNotMatch(fileManager, /dialog\.prompt\(/, "Creating and renaming must be inline, without prompt dialogs");
assert.match(fileBrowser, /fb-rename-input/, "The browser must render the name as an inline field");
assert.match(fileBrowser, /onEditingCommit/, "Inline naming must commit on Enter or blur");
assert.match(fileBrowser, /onEditingCancel/, "Inline naming must be cancellable with Escape");
assert.match(fileBrowser, /ContextMenuSub/, "The row menu must offer a New submenu");
assert.match(fileBrowser, /if \(folder\) onOpen\(entry\)/, "Clicking a folder must open it");
assert.equal(has("src/components/files/FileTree.tsx"), false, "The expandable tree must be replaced by the folder browser");
assert.match(fileManager, /createProjectInline/, "Projects must be created inline");
assert.match(fileManager, /createFolderInline/, "Folders must be created inline");
assert.match(fileManager, /createDocumentInline/, "Documents must be created inline");
assert.match(fileManager, /create-document/, "New documents must be created through the typed API");
assert.match(fileManager, /This folder is empty/, "An empty folder must show a dedicated empty state");
assert.match(fileManager, /fb-resizer/, "The preview pane must be resizable");
assert.match(fileManager, /previewOpen/, "The preview pane must be hideable");
assert.match(api, /siblingNameTaken/, "Names must be unique per folder, ignoring case");
assert.match(designSystemCss, /\.fb-rename-input/, "Inline naming must be styled");
assert.match(designSystemCss, /\.fb-resizer/, "The preview resize handle must be styled");
assert.match(designSystemCss, /\.fb-preview-hidden/, "The collapsed preview pane must be styled");
assert.match(designSystemCss, /\.login-tester/, "The evaluation hint must be styled");
assert.match(documentKinds, /documentKindForExtension/, "The document catalog must map extensions to workbenches");

// --- Data Register as the single source of components -----------------------

assert.match(projectRegister, /loadProjectRegister/, "Modules must load components through the Data Register bridge");
assert.match(projectRegister, /Data Register/, "The bridge must resolve the project Data Register folder");
assert.match(projectRegister, /readAssetsIfPresent/, "The bridge must fall back to a saved register snapshot");
assert.match(projectRegister, /isDataEntry/, "The register bridge must find any project .data file, not only the seeded path");
assert.match(mil217fWorkbench, /loadProjectRegister/, "The prediction module must originate parts from the Data Register");
assert.match(fmecaWorkbench, /loadProjectRegister/, "The FMECA module must originate items from the Data Register");
assert.match(diagramEditor, /loadProjectRegister/, "The RBD component library must originate from the Data Register");
assert.match(ftaEditor, /loadProjectRegister/, "The FTA component library must originate from the Data Register");

// --- EN 50126 railway risk framework ----------------------------------------

assert.match(en50126Engine, /EN 50126-1:2017 Annex C/, "The risk engine must implement the EN 50126 Annex C matrix");
assert.match(en50126Engine, /export const EN50126_RISK_MATRIX/, "The risk engine must expose the four-tier risk matrix");
assert.match(en50126Engine, /"S1"/, "The risk engine must define severity S1");
assert.match(en50126Engine, /"S5"/, "The risk engine must define severity S5");
assert.match(en50126Engine, /"highly-improbable"/, "The risk engine must define the six frequency classes");
assert.match(fmecaEngine, /EN 50126/, "FMECA risk assessment must use the EN 50126 categories");

// --- Responsive layout and matrix wrapping ----------------------------------

const fmecaCss = read("src/styles/fmeca.css");
const globalsCss = read("src/styles/globals.css");
const matrixRule = fmecaCss.match(/\.fmeca-matrix th,\.fmeca-matrix td\{[^}]*\}/)?.[0] ?? "";
assert.match(matrixRule, /white-space:normal/, "Risk-matrix cells must wrap text");
assert.match(matrixRule, /overflow-wrap:anywhere/, "Long risk-matrix words must break instead of overflowing");
assert.match(matrixRule, /min-height:28px/, "Risk-matrix cells must keep a usable minimum height");
assert.match(globalsCss, /@media\(max-width:760px\)/, "The app must keep a phone layout block");
assert.match(globalsCss, /\.component-library\{display:grid/, "The component library must stay reachable on phones");
assert.match(globalsCss, /\.workbench-toolbar,\s*\.mil217f-toolbar,\s*\.fmeca-toolbar\{[^}]*overflow-x:auto/, "Phone toolbars must scroll instead of clipping actions");

// --- LCC and Spares modules (IEC 60300-3-3 / EN 50126-3) --------------------

const lccEngine = read("src/engine/lcc.ts");
const lccPmWorkbench = read("src/components/lcc/lcc-pm-workbench.tsx");
const lccCmWorkbench = read("src/components/lcc/lcc-cm-workbench.tsx");
const sparesEngine = read("src/engine/spares.ts");
const sparesWorkbench = read("src/components/spares/spares-workbench.tsx");
const lccPmPage = read("src/app/(workspace)/lcc-pm/page.tsx");
const lccCmPage = read("src/app/(workspace)/lcc-cm/page.tsx");
const sparesPage = read("src/app/(workspace)/spare-parts/page.tsx");

assert.match(lccEngine, /IEC 60300-3-3/, "The LCC engine must implement IEC 60300-3-3");
assert.match(lccEngine, /export function analyzeLcc/, "The LCC engine must expose a single analysis entry point");
assert.match(lccEngine, /export const LCC_PERIODS/, "The LCC engine must expose the selectable periods");
assert.match(lccEngine, /export function recurringPresentValue/, "The LCC engine must discount recurring costs");
assert.match(lccEngine, /lcc-pm-iec60300-3-3-v1/, "The LCC-PM document must carry a formula version");
assert.match(lccEngine, /lcc-cm-iec60300-3-3-v1/, "The LCC-CM document must carry a formula version");
assert.match(lccPmWorkbench, /analyzeLcc\(record, "pm"/, "The LCC-PM workbench must run the shared engine in PM mode");
assert.match(lccPmWorkbench, /await readLccPm\(\)/, "The LCC-PM workbench must hydrate from the server");
assert.match(lccPmWorkbench, /loadProjectRegister/, "The LCC-PM module must originate assets from the Data Register");
assert.match(lccPmWorkbench, /kind="lccpm"/, "The LCC-PM workbench must save through the shared document dialog");
assert.match(lccCmWorkbench, /analyzeLcc\(record, "cm"/, "The LCC-CM workbench must run the shared engine in CM mode");
assert.match(lccCmWorkbench, /await readLccCm\(\)/, "The LCC-CM workbench must hydrate from the server");
assert.match(lccCmWorkbench, /loadProjectRegister/, "The LCC-CM module must originate assets from the Data Register");
assert.match(lccCmWorkbench, /kind="lcccm"/, "The LCC-CM workbench must save through the shared document dialog");

assert.match(sparesEngine, /EN 50126-3/, "The spares engine must implement EN 50126-3");
assert.match(sparesEngine, /export function analyzeSpares/, "The spares engine must expose a single analysis entry point");
assert.match(sparesEngine, /export function poissonQuantile/, "The spares engine must size stock from the Poisson quantile");
assert.match(sparesEngine, /spares-en50126-3-v1/, "The spares document must carry a formula version");
assert.match(sparesWorkbench, /analyzeSpares/, "The spares workbench must run the shared engine");
assert.match(sparesWorkbench, /await readSpares\(\)/, "The spares workbench must hydrate from the server");
assert.match(sparesWorkbench, /loadProjectRegister/, "The spares module must originate items from the Data Register");
assert.match(sparesWorkbench, /kind="spares"/, "The spares workbench must save through the shared document dialog");

assert.match(lccPmPage, /useDocumentContext\("lccpm"\)/, "The LCC-PM page must resolve a .lccpm document");
assert.match(lccCmPage, /useDocumentContext\("lcccm"\)/, "The LCC-CM page must resolve a .lcccm document");
assert.match(sparesPage, /useDocumentContext\("spares"\)/, "The spares page must resolve a .spares document");

assert.match(workspaceData, /lcc-pm-iec60300-3-3-v1/, "Saved LCC-PM documents must carry a formula version");
assert.match(workspaceData, /lcc-cm-iec60300-3-3-v1/, "Saved LCC-CM documents must carry a formula version");
assert.match(workspaceData, /spares-en50126-3-v1/, "Saved spares documents must carry a formula version");
assert.match(documentKinds, /extension: "\.lccpm"/, "The document router must map .lccpm files to the LCC-PM module");
assert.match(documentKinds, /extension: "\.lcccm"/, "The document router must map .lcccm files to the LCC-CM module");
assert.match(documentKinds, /extension: "\.spares"/, "The document router must map .spares files to the spares module");
assert.match(documentContext, /lccpm: "lccpm"/, "The document router must map .lccpm files to the LCC-PM module");
assert.match(documentContext, /lcccm: "lcccm"/, "The document router must map .lcccm files to the LCC-CM module");
assert.match(documentContext, /spares: "spares"/, "The document router must map .spares files to the spares module");
assert.match(saveDialog, /lccpm: "\.lccpm"/, "The save dialog must name LCC-PM files with .lccpm");
assert.match(saveDialog, /lcccm: "\.lcccm"/, "The save dialog must name LCC-CM files with .lcccm");
assert.match(saveDialog, /spares: "\.spares"/, "The save dialog must name spares files with .spares");
assert.match(api, /lccpm: "\.lccpm"/, "The save-location record must remember the LCC-PM extension");
assert.match(api, /lcccm: "\.lcccm"/, "The save-location record must remember the LCC-CM extension");
assert.match(api, /spares: "\.spares"/, "The save-location record must remember the spares extension");
assert.match(api, /lcc-pm-iec60300-3-3-v1/, "New LCC-PM files must start from the LCC-PM document shape");
assert.match(api, /lcc-cm-iec60300-3-3-v1/, "New LCC-CM files must start from the LCC-CM document shape");
assert.match(api, /spares-en50126-3-v1/, "New spares files must start from the spares document shape");
assert.match(appShell, /href: "\/lcc-pm"/, "The sidebar must link to the LCC-PM module");
assert.match(appShell, /href: "\/lcc-cm"/, "The sidebar must link to the LCC-CM module");
assert.match(appShell, /href: "\/spare-parts"/, "The sidebar must link to the spares module");

// --- LCC / spares visual system ---------------------------------------------

const lccSparesCss = read("src/styles/lcc-spares.css");
assert.match(
  globalsCss,
  /@import "\.\/lcc-spares\.css";/,
  "The cascade must import the LCC and spares stylesheet",
);
for (const surface of [".lcc-pm-workbench", ".lcc-cm-workbench", ".spares-workbench"]) {
  assert.equal(
    lccSparesCss.includes(surface),
    true,
    `The stylesheet must style ${surface}`,
  );
}
for (const control of [".lcc-pm-button", ".lcc-cm-button", ".spares-button"]) {
  assert.equal(
    lccSparesCss.includes(control),
    true,
    `The stylesheet must style ${control} instead of leaving browser defaults`,
  );
}
assert.match(
  lccSparesCss,
  /html\[data-theme="dark"\]/,
  "The LCC and spares surfaces must provide a dark theme",
);
assert.match(
  lccSparesCss,
  /input:not\(\[type="checkbox"\]\), select, textarea\) \{\s*border-color: #2a3c52;\s*background: #0f1a28;\s*color: #e6eef7;/,
  "Workbench inputs must keep readable foreground colours in dark mode",
);

// --- Module workspace surface ------------------------------------------------

assert.match(
  designSystemCss,
  /\.main-area \{ --module-gutter: 28px; \}/,
  "Module pages must use the app's page gutter so they align with the other pages",
);
assert.match(
  designSystemCss,
  /\)\) > \.page-content \{[^}]*padding: 0 var\(--module-gutter\) 0;/,
  "A module page must sit inside the shared page frame without a bottom gap",
);
assert.match(
  designSystemCss,
  /height: 100dvh/,
  "A module workbench must fill the space below the page header",
);
for (const workbench of [
  ".workbench",
  ".weibull-workbench",
  ".mil217f-workbench",
  ".fmeca-workbench",
  ".lcc-pm-workbench",
  ".lcc-cm-workbench",
  ".spares-workbench",
]) {
  const occurrences = designSystemCss.split(workbench + ",").length - 1
    + designSystemCss.split(workbench + "\n").length - 1;
  assert.equal(
    occurrences > 0,
    true,
    `The workspace surface rules must cover ${workbench}`,
  );
}
assert.match(
  designSystemCss,
  /border: 1px solid var\(--ds-line\);\s*\/\*[\s\S]*?\*\/\s*border-bottom: 0;\s*border-radius: 10px 10px 0 0;/,
  "The module surface must use the app's border and radius and meet the window floor",
);
assert.match(
  designSystemCss,
  /background: var\(--ds-surface\);/,
  "A module surface must use the app's surface colour instead of its own background",
);

// --- Headline results in the header band -------------------------------------

const headerKpis = read("src/components/layout/header-kpis.tsx");
assert.match(appShell, /className="page-kpis" id="page-kpis"/, "The shell must render the slot that hosts module headline results");
assert.match(designSystemCss, /\.page-kpis \{/, "The header KPIs must be positioned inside the page header");
assert.match(designSystemCss, /\.header-kpis \{/, "The headline KPI strip must be styled");
assert.match(headerKpis, /createPortal/, "Module headline results must render into the header band, not the module");
assert.match(headerKpis, /document\.getElementById\("page-kpis"\)/, "The KPI portal must target the shell slot");
assert.match(headerKpis, /symbol: string/, "Each headline figure must be written as a symbol and a value");
assert.match(headerKpis, /className="header-kpi-name"/, "Each headline figure must carry a plain-language name");
assert.equal(/source:|meta=/.test(headerKpis), false, "The KPI strip must not show engine or standard captions");

const workbenchCss = read("src/styles/workbench.css");
assert.equal(workbenchCss.includes(".node-editor"), false, "The diagram modules must not reintroduce a component-edit bar");
for (const [moduleName, source] of [["RBD", diagramEditor], ["FTA", ftaEditor]]) {
  assert.match(source, /<(?:ModuleKpis|section className="engineering-result-strip")/, `${moduleName} must render an engineering result summary`);
  assert.equal(source.includes("diagram-results"), false, `${moduleName} must not reserve a results row inside the module`);
  assert.equal(
    source.includes("result-panel-shell"),
    false,
    `${moduleName} must not put its results in a right-hand pane`,
  );
  assert.equal(source.includes("node-editor"), false, `${moduleName} must not add a component-edit bar to the module`);
}
assert.match(workbenchCss, /\.workbench \.workbench-body\{grid-template-columns:220px minmax\(0,1fr\)\}/, "The diagram canvas must use the full width after the library");

for (const [moduleName, source] of [
  ["LCC-PM", lccPmWorkbench],
  ["LCC-CM", lccCmWorkbench],
  ["spares", sparesWorkbench],
]) {
  assert.match(source, /<ModuleKpis/, `${moduleName} must publish its headline figures through the header slot`);
  assert.equal(source.includes("lcc-kpi-strip"), false, `${moduleName} must not reserve a KPI row inside the module`);
  assert.equal(
    /<div className="(?:lcc-pm|lcc-cm|spares)-result-cards">/.test(source),
    false,
    `${moduleName} must not keep KPI cards inside the results column`,
  );
}

// --- Dense tables, scrollbars and toolbar rows ------------------------------

const mil217fCss = read("src/styles/mil217f.css");

// The input tables keep fixed column widths so inputs stop stretching the table
// past its pane, and they declare a floor: below it the table scrolls instead
// of squeezing the numeric fields to nothing.
assert.match(lccSparesCss, /--wb-table-min: 600px;/, "The LCC input tables must declare a 600 px floor");
assert.match(lccSparesCss, /--wb-table-min: 840px;/, "The spares input table must declare an 840 px floor");
assert.match(lccSparesCss, /table-layout: fixed;/, "Dense input tables must fix their column widths");
assert.match(
  lccSparesCss,
  /min-width: var\(--wb-table-min\);/,
  "Dense input tables must scroll below their floor instead of squeezing their inputs",
);
for (const [moduleName, source] of [
  ["LCC-PM", lccPmWorkbench],
  ["LCC-CM", lccCmWorkbench],
  ["spares", sparesWorkbench],
]) {
  assert.match(source, /<colgroup>/, `The ${moduleName} input table must declare its column widths`);
  assert.equal(
    source.includes("Import Data Register"),
    false,
    `The ${moduleName} toolbar must not repeat the panel-head import action`,
  );
  assert.equal(
    source.split("onClick={importRegister}").length - 1,
    1,
    `The ${moduleName} module must offer exactly one Data Register import`,
  );
}

// A desktop toolbar stays one row: the spacer collapses instead of pushing the
// document actions onto a second row.
assert.match(
  lccSparesCss,
  /flex: 1 1 0;/,
  "The LCC and spares toolbar spacer must collapse instead of wrapping the actions",
);
assert.match(
  lccSparesCss,
  /grid-template-columns: repeat\(auto-fit, minmax\(190px, 1fr\)\);/,
  "Result KPI cards must keep a readable minimum width",
);
assert.match(
  lccSparesCss,
  /overflow: auto;\s*scrollbar-width: thin;/,
  "A result table wider than its column must scroll instead of being clipped",
);
assert.match(lccSparesCss, /max-width: 1400px/, "The twelve-column spares grid must stack before the LCC grids do");
assert.match(lccSparesCss, /max-width: 1240px/, "The LCC grids must stack before the results column collapses");
assert.match(lccSparesCss, /max-height: 300px;/, "A stacked input table must cap its height and scroll");

// The module shell keeps every panel reachable: it scrolls horizontally when
// the window is narrower than the module's working width, and never clips.
assert.match(
  designSystemCss,
  /overflow-x: auto;\s*overflow-y: hidden;/,
  "The module shell must scroll horizontally instead of clipping a panel",
);
assert.match(designSystemCss, /min-width: var\(--wb-min-width, 0px\);/, "Each module must declare its working width");
assert.match(designSystemCss, /--wb-min-width: 940px;/, "The RBD and FTA workbenches must declare their working width");
assert.match(designSystemCss, /--wb-min-width: 880px;/, "The MIL-217F workbench must declare its working width");
assert.match(workbenchCss, /\.workbench-toolbar\{[^}]*overflow-x:auto/, "The RBD and FTA toolbars must scroll on narrow windows");
assert.match(mil217fCss, /\.mil217f-toolbar\{[^}]*overflow-x:auto/, "The MIL-217F toolbar must scroll on narrow windows");

// --- Compliance evidence ----------------------------------------------------

const complianceMatrix = read("compliance/compliance-matrix.md");
assert.match(complianceMatrix, /ISO 55000/, "The compliance matrix must cover ISO 55000");
assert.match(complianceMatrix, /IEC 60300-3-3/, "The compliance matrix must cover IEC 60300-3-3");
assert.match(complianceMatrix, /EN 50126-1/, "The compliance matrix must cover EN 50126-1");
assert.match(complianceMatrix, /EN 50126-3/, "The compliance matrix must cover EN 50126-3");
assert.match(complianceMatrix, /IEC 60812/, "The compliance matrix must cover IEC 60812");
assert.match(complianceMatrix, /IEC 61703/, "The compliance matrix must cover IEC 61703");
assert.match(complianceMatrix, /MIL-STD-1629A/, "The compliance matrix must cover MIL-STD-1629A");
assert.match(complianceMatrix, /MIL-STD-882E/, "The compliance matrix must cover MIL-STD-882E");

// The matrix must cite real symbols and real checks. These guards stop it from
// drifting back to the placeholder names used before the engines were written.
for (const stale of [
  "computeLCC", "computeNPV", "computeEAC", "sensitivityAnalysis", "periodOptions",
  "residualRiskAllowance", "computeAvailability", "computeConsequentialCosts",
  "provisionSpares", "sparesLCC", "obsolescenceWarning",
]) {
  assert.equal(complianceMatrix.includes(stale), false, `The compliance matrix must not cite the non-existent symbol ${stale}`);
}
for (const staleScript of ["file-manager-inline.mjs", "file-manager-mobile.mjs", "login-layout-check.mjs", "api-integration.mjs", "npm run test:workbench"]) {
  assert.equal(complianceMatrix.includes(staleScript), false, `The compliance matrix must not cite the missing check ${staleScript}`);
}
for (const realSymbol of ["analyzeLcc", "analyzeSpares", "formatCriticality", "EN50126_RISK_MATRIX", "poissonQuantile"]) {
  assert.equal(complianceMatrix.includes(realSymbol), true, `The compliance matrix must cite the real symbol ${realSymbol}`);
}
assert.match(complianceMatrix, /node scripts\/verify-workbench\.mjs/, "The matrix must cite the regression suite that exists");
assert.match(complianceMatrix, /next build/, "The matrix must cite the production build as evidence");

// --- Deployment headers -----------------------------------------------------

assert.match(nextConfig, /Content-Security-Policy/, "The deployment must send a Content-Security-Policy header");
assert.match(nextConfig, /X-Frame-Options/, "The deployment must send an X-Frame-Options header");
assert.match(nextConfig, /Strict-Transport-Security/, "The deployment must send HSTS");

console.log("Server-backed workbench regression checks passed.");
