/**
 * RAMSport server API.
 *
 * This module fulfils the same `/api/*` contract the application was written
 * against, but the implementation and the data now live on the server. Every
 * endpoint except sign-in requires a signed session cookie, and the account id
 * always comes from that cookie — never from the request body — so one account
 * cannot read or change another account's rows.
 */

import { stockAvatarPath } from "@/lib/avatar-art";
import { DOCUMENT_KINDS, withDocumentExtension, type DocumentKind } from "@/lib/document-kinds";
import { DEFAULT_LCC_INPUTS } from "@/engine/lcc";
import { DEFAULT_SPARES_INPUTS } from "@/engine/spares";
import { createPassword, newAccountId, verifyHash } from "./crypto";
import { createHash, randomBytes } from "node:crypto";
import {
  clearSessionCookie,
  createSessionToken,
  isSameOriginRequest,
  readCookie,
  readSessionFromRequest,
  sessionCookie,
  transientCookie,
} from "./session";
import { authoriseUrl, cloudIdentity, exchangeCode } from "./cloud-provider";
import { acceptInvitation, cloudStatus, createInvitation, oauthConfigured, saveCloudConnection, validateInvitation, type CloudProvider } from "./cloud-auth";
import { createCloudFolder, deleteCloudEntry, listCloudFiles, readCloudFile, renameCloudEntry, writeCloudFile } from "./cloud-files";
import { loadCloudConnection } from "./cloud-auth";
import { mutateRecord, readRecord, removeRecord, StorageWriteError, writeRecord } from "./store";
import {
  findUserByAccountId,
  findUserByUsername,
  loadUsers,
  upsertCloudUser,
  updateUsers,
  type StoredUser,
} from "./users";

/* -------------------------------------------------------------------------- */
/* Errors and HTTP helpers                                                     */
/* -------------------------------------------------------------------------- */

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function json(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      ...headers,
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof StorageWriteError) return json({ error: error.message }, 507);
  console.error("[RAMSport] Unhandled API error", error);
  return json({ error: "The server could not complete the request." }, 500);
}

function badRequest(message: string): never {
  throw new ApiError(400, message);
}

/* -------------------------------------------------------------------------- */
/* Session and row-level ownership                                             */
/* -------------------------------------------------------------------------- */

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** The only account id a request may act on is the one bound to the session. */
function ownerAccountId(accountId: string): string {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new ApiError(403, "The requested workspace is not available to this account.");
  }
  return accountId;
}

function rowKey(resource: string, accountId: string): string {
  return `${resource}:${ownerAccountId(accountId)}`;
}

async function requireUser(request: Request, administrator = false): Promise<StoredUser> {
  const session = await readSessionFromRequest(request);
  if (!session) throw new ApiError(401, "Authentication required.");

  const user = await findUserByAccountId(session.accountId);
  if (!user) throw new ApiError(401, "Authentication required.");
  if (administrator && user.role !== "admin") throw new ApiError(403, "Administrator access required.");
  return user;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const LOGIN_TRACKED_LIMIT = 5_000;

function pruneLoginAttempts() {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
  // A flood of distinct usernames must not grow this map without bound. When
  // still full after pruning, drop the oldest half; throttling is best-effort
  // and the per-account rows are rebuilt on the next failure.
  if (loginAttempts.size <= LOGIN_TRACKED_LIMIT) return;
  let toDrop = Math.ceil(loginAttempts.size / 2);
  for (const key of loginAttempts.keys()) {
    loginAttempts.delete(key);
    if (--toDrop <= 0) break;
  }
}

function enforceLoginLimit(key: string) {
  const entry = loginAttempts.get(key);
  if (!entry) return;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(key);
    return;
  }
  if (entry.count >= LOGIN_LIMIT) {
    throw new ApiError(429, "Too many sign-in attempts. Try again later.");
  }
}

function recordLoginFailure(key: string) {
  if (loginAttempts.size >= LOGIN_TRACKED_LIMIT) pruneLoginAttempts();
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/* -------------------------------------------------------------------------- */
/* Audit trail (bounded, server-side)                                          */
/* -------------------------------------------------------------------------- */

type AuditRecord = { at: string; actorId: string; action: string; resource: string; outcome: string };

async function appendAudit(user: StoredUser, action: string, resource: string, outcome = "success") {
  await mutateRecord<AuditRecord[]>(rowKey("audit", user.accountId), current => {
    const records = Array.isArray(current) ? (current as AuditRecord[]) : [];
    return [...records, { at: new Date().toISOString(), actorId: user.accountId, action, resource, outcome }].slice(-200);
  });
}

/* -------------------------------------------------------------------------- */
/* File tree                                                                   */
/* -------------------------------------------------------------------------- */

type StoredFile = { kind: "dir" | "file"; modified: string; content?: string };
type FileMap = Record<string, StoredFile>;
type FileNode = {
  name: string;
  path: string;
  type: "project" | "folder" | "rbd" | "fta" | "data" | "weibull" | "mil217f" | "fmeca" | "lccpm" | "lcccm" | "spares";
  modified: string;
  size?: number;
  children?: FileNode[];
};

// Windows-safe name characters. Path separators and the reserved characters
// (\ / : * ? " < > |) stay banned so a name can never escape its folder.
const NAME_PATTERN = /^[\p{L}\p{N} _.,'&()+!#@$%=;\[\]{}~-]{1,80}$/u;
// Windows device names cannot be used as file names; the filesystem fallback
// must refuse them so a name that works in MongoDB also works locally.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function validName(name: string) {
  return NAME_PATTERN.test(name)
    && name !== "."
    && name !== ".."
    && !/[. ]$/.test(name)
    && !WINDOWS_RESERVED.test(name);
}
const SAFE_EXTENSIONS = new Set(DOCUMENT_KINDS.map(entry => entry.extension));
const MAX_DOCUMENT_BYTES = 2_000_000;
const MAX_DEPTH = 8;
const encoder = new TextEncoder();

/**
 * Empty document written when a file is created from the file manager. Each
 * shape matches the validator in `src/data/workspace.ts`, so a brand-new file
 * opens in its workbench without any repair step.
 */
const DOCUMENT_TEMPLATES: Record<DocumentKind, unknown> = {
  rbd: { nodes: [], edges: [] },
  fta: { nodes: [], edges: [] },
  data: [],
  weibull: {
    formulaVersion: "weibull-iec61649-v1",
    points: [],
    options: { method: "mrr", regression: "x-on-y", threeParameter: false, assumedBeta: 2, confidence: 0.9 },
    missionTimes: [],
  },
  mil217f: {
    formulaVersion: "mil217f-notice2-v1",
    parts: [],
    options: { method: "stress", environment: "GB", ambient: 40, temperatureRise: 0, missionTime: 8760 },
  },
  fmeca: {
    formulaVersion: "mil-std-1629a-v1",
    mode: "fmea",
    items: [],
    options: { missionTime: 1 },
  },
  lccpm: {
    formulaVersion: "lcc-pm-iec60300-3-3-v1",
    inputs: { currency: "EUR", discountRate: 4, escalationRate: 2, operatingHoursPerYear: 8760, horizonYears: 20, customHorizonYears: 10, includeAcquisition: true, includeDisposal: true, overheadRate: 12, residualRiskPerYear: 0, defaultDowntimeCostPerHour: 500 },
    assets: [],
  },
  lcccm: {
    formulaVersion: "lcc-cm-iec60300-3-3-v1",
    inputs: { currency: "EUR", discountRate: 4, escalationRate: 2, operatingHoursPerYear: 8760, horizonYears: 20, customHorizonYears: 10, includeAcquisition: true, includeDisposal: true, overheadRate: 12, residualRiskPerYear: 0, defaultDowntimeCostPerHour: 500 },
    assets: [],
  },
  spares: {
    formulaVersion: "spares-en50126-3-v1",
    inputs: { currency: "EUR", discountRate: 4, escalationRate: 2, horizonYears: 20, operatingHoursPerYear: 8760, defaultServiceLevel: 0.95, defaultProtectionPeriodDays: 365, downtimeCostPerHour: 500 },
    items: [],
  },
};

function nowIso() {
  return new Date().toISOString();
}

function byteLength(value: string) {
  return encoder.encode(value).length;
}

function safeName(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  if (!validName(name)) {
    throw badRequest("Use a valid name (letters, numbers, spaces and common punctuation; no \\ / : * ? \" < > |).");
  }
  return name;
}

function normalisePath(value: string | null | undefined): { path: string; segments: string[] } {
  const cleaned = (value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = cleaned.split("/");
  if (!cleaned || segments.length > MAX_DEPTH) throw badRequest("Invalid file path.");
  for (const segment of segments) {
    if (!validName(segment)) throw badRequest("Invalid file path.");
  }
  return { path: segments.join("/"), segments };
}

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index) : "";
}

function fileType(name: string): FileNode["type"] {
  const extension = extensionOf(name).toLocaleLowerCase();
  if (extension === ".rbd") return "rbd";
  if (extension === ".fta") return "fta";
  if (extension === ".wbl") return "weibull";
  if (extension === ".217f") return "mil217f";
  if (extension === ".fmeca") return "fmeca";
  if (extension === ".lccpm") return "lccpm";
  if (extension === ".lcccm") return "lcccm";
  if (extension === ".spares") return "spares";
  return "data";
}

function parentOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/**
 * Windows-style name check: two entries in the same folder may not differ only
 * by letter case. `ignore` lets a rename keep (or re-case) its own row.
 */
function siblingNameTaken(map: FileMap, parent: string, name: string, ignore?: string) {
  const prefix = parent ? `${parent}/` : "";
  const wanted = name.toLocaleLowerCase();
  for (const key of Object.keys(map)) {
    if (ignore && key === ignore) continue;
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    if (rest.toLocaleLowerCase() === wanted) return true;
  }
  return false;
}

function isStoredFile(value: unknown): value is StoredFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredFile>;
  return (candidate.kind === "dir" || candidate.kind === "file")
    && typeof candidate.modified === "string"
    && (candidate.kind === "dir" || typeof candidate.content === "string");
}

function sanitiseFileMap(value: unknown): FileMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: FileMap = {};
  for (const [path, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isStoredFile(entry)) result[path] = entry;
  }
  return result;
}

async function loadFiles(accountId: string): Promise<FileMap> {
  return sanitiseFileMap(await readRecord<unknown>(rowKey("files", accountId)));
}

/** Atomic read-modify-write of one account's file map. */
async function updateFiles<T>(accountId: string, mutate: (map: FileMap) => T | Promise<T>): Promise<T> {
  let result!: T;
  await mutateRecord<FileMap>(rowKey("files", accountId), async current => {
    const map = sanitiseFileMap(current);
    result = await mutate(map);
    // Persist the file map itself; the caller's return value is not storage.
    return map;
  });
  return result;
}

function touchParents(map: FileMap, path: string, modified: string) {
  let parent = parentOf(path);
  while (parent) {
    const entry = map[parent];
    if (entry?.kind === "dir") map[parent] = { ...entry, modified };
    parent = parentOf(parent);
  }
}

function buildTree(map: FileMap): FileNode[] {
  const nodes = new Map<string, FileNode>();
  const roots: FileNode[] = [];
  for (const path of Object.keys(map).sort()) {
    const entry = map[path];
    if (!entry) continue;
    const segments = path.split("/");
    const name = segments[segments.length - 1];
    const node: FileNode = {
      name,
      path,
      type: entry.kind === "dir" ? (segments.length === 1 ? "project" : "folder") : fileType(name),
      modified: entry.modified,
    };
    if (entry.kind === "file") node.size = byteLength(entry.content ?? "");
    else node.children = [];

    nodes.set(path, node);
    const parent = parentOf(path);
    const parentNode = parent ? nodes.get(parent) : null;
    if (parentNode?.children) parentNode.children.push(node);
    else roots.push(node);
  }
  sortNodes(roots);
  return roots;
}

function sortNodes(nodes: FileNode[]) {
  nodes.sort((first, second) => {
    const firstFolder = first.type === "project" || first.type === "folder";
    const secondFolder = second.type === "project" || second.type === "folder";
    if (firstFolder !== secondFolder) return firstFolder ? -1 : 1;
    return first.name.localeCompare(second.name, undefined, { sensitivity: "base", numeric: true });
  });
  for (const node of nodes) if (node.children) sortNodes(node.children);
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = [];
  const visit = (items: FileNode[]) => {
    for (const item of items) {
      if (item.children) visit(item.children);
      else files.push(item);
    }
  };
  visit(nodes);
  return files.sort((first, second) => second.modified.localeCompare(first.modified));
}

function storageStats(map: FileMap) {
  let projects = 0;
  let files = 0;
  let bytes = 0;
  for (const [path, entry] of Object.entries(map)) {
    if (entry.kind === "dir" && !path.includes("/")) projects += 1;
    if (entry.kind === "file") {
      files += 1;
      bytes += byteLength(entry.content ?? "");
    }
  }
  return { projects, files, bytes };
}

/* -------------------------------------------------------------------------- */
/* Profile and save locations                                                  */
/* -------------------------------------------------------------------------- */

type ProfileRecord = {
  displayName: string;
  avatarPreset: string | null;
  avatarDataUrl: string | null;
  updatedAt: string;
};

const MAX_PHOTO_BYTES = 5_000_000;
const PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function loadProfile(accountId: string, username: string): Promise<ProfileRecord> {
  const stored = await readRecord<Partial<ProfileRecord>>(rowKey("profile", accountId));
  return {
    displayName: typeof stored?.displayName === "string" && stored.displayName.trim() ? stored.displayName : username,
    avatarPreset: typeof stored?.avatarPreset === "string" && stockAvatarPath(stored.avatarPreset) ? stored.avatarPreset : null,
    avatarDataUrl: typeof stored?.avatarDataUrl === "string" ? stored.avatarDataUrl : null,
    updatedAt: typeof stored?.updatedAt === "string" ? stored.updatedAt : new Date(0).toISOString(),
  };
}

function profileDto(user: StoredUser, profile: ProfileRecord) {
  const preset = profile.avatarPreset ? stockAvatarPath(profile.avatarPreset) : null;
  return {
    accountId: user.accountId,
    username: user.username,
    displayName: profile.displayName,
    ...(user.role === "admin" ? { role: "admin" as const } : {}),
    avatarUrl: preset ?? profile.avatarDataUrl,
    avatarPreset: profile.avatarPreset,
    hasPhoto: Boolean(preset || profile.avatarDataUrl),
    updatedAt: profile.updatedAt,
  };
}

type SaveLocations = { rbd: string | null; fta: string | null; weibull: string | null; mil217f: string | null; fmeca: string | null; lccpm: string | null; lcccm: string | null; spares: string | null };

function sanitiseSaveLocations(value: unknown): SaveLocations {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<SaveLocations>;
  return {
    rbd: typeof stored.rbd === "string" ? stored.rbd : null,
    fta: typeof stored.fta === "string" ? stored.fta : null,
    weibull: typeof stored.weibull === "string" ? stored.weibull : null,
    mil217f: typeof stored.mil217f === "string" ? stored.mil217f : null,
    fmeca: typeof stored.fmeca === "string" ? stored.fmeca : null,
    lccpm: typeof stored.lccpm === "string" ? stored.lccpm : null,
    lcccm: typeof stored.lcccm === "string" ? stored.lcccm : null,
    spares: typeof stored.spares === "string" ? stored.spares : null,
  };
}

async function loadSaveLocations(accountId: string): Promise<SaveLocations> {
  return sanitiseSaveLocations(await readRecord<unknown>(rowKey("save-locations", accountId)));
}

/**
 * Keeps remembered save locations consistent when a document or folder is
 * renamed or removed. Without this a module would try to resume a file that no
 * longer exists and log a failed request on every open.
 */
async function rewriteSaveLocations(accountId: string, source: string, target: string | null) {
  const key = rowKey("save-locations", accountId);
  const current = await readRecord<unknown>(key);
  if (!current) return;
  const locations = sanitiseSaveLocations(current);
  let changed = false;
  for (const kind of Object.keys(locations) as (keyof SaveLocations)[]) {
    const value = locations[kind];
    if (!value || (value !== source && !value.startsWith(`${source}/`))) continue;
    changed = true;
    if (target) locations[kind] = `${target}${value.slice(source.length)}`;
    else delete locations[kind];
  }
  if (changed) await writeRecord(key, locations);
}

/* -------------------------------------------------------------------------- */
/* Endpoint implementations                                                    */
/* -------------------------------------------------------------------------- */

async function login(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = (payload?.username ?? "").slice(0, 64);
  const password = (payload?.password ?? "").slice(0, 256);
  const key = username.trim().toLocaleLowerCase();

  enforceLoginLimit(key);
  const user = await findUserByUsername(username);
  const valid = user?.passwordSalt && user.passwordHash ? await verifyHash(password, user.passwordSalt, user.passwordHash) : false;
  if (!user || !valid) {
    recordLoginFailure(key);
    // A rejected attempt has no owner to write an audit row for, so it is not
    // attributed to any account. The attempt counter above still throttles
    // repeated guesses.
    throw new ApiError(401, "Incorrect username or password.");
  }

  loginAttempts.delete(key);
  await appendAudit(user, "auth.login", "session");
  const token = await createSessionToken({
    accountId: user.accountId,
    username: user.username,
    role: user.role,
    signedInAt: nowIso(),
  });
  return json({
    user: user.role === "admin"
      ? { username: user.username, accountId: user.accountId, role: user.role }
      : { username: user.username, accountId: user.accountId },
  }, 200, { "set-cookie": sessionCookie(token, request) });
}

type OAuthPending = { state: string; verifier: string; invitation: string; provider: CloudProvider };
const OAUTH_COOKIE = "ramsport_oauth";

function redirect(path: string, request: Request, cookie?: string) {
  return new Response(null, { status: 302, headers: { location: new URL(path, request.url).toString(), ...(cookie ? { "set-cookie": cookie } : {}) } });
}

async function startCloudLogin(request: Request, provider: CloudProvider): Promise<Response> {
  if (!oauthConfigured(provider)) throw new ApiError(503, `${provider === "google" ? "Google" : "Microsoft"} sign-in has not been configured yet.`);
  const invitationToken = new URL(request.url).searchParams.get("invite");
  if (!await validateInvitation(invitationToken)) throw new ApiError(403, "Use a valid invitation link to sign in.");
  const state = randomBytes(24).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const pending: OAuthPending = { state, verifier, invitation: invitationToken!, provider };
  return new Response(null, { status: 302, headers: { location: authoriseUrl(request, provider, state, challenge), "set-cookie": transientCookie(OAUTH_COOKIE, Buffer.from(JSON.stringify(pending)).toString("base64url"), request) } });
}

async function finishCloudLogin(request: Request, provider: CloudProvider): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const failure = query.get("error"); if (failure) return redirect(`/login?error=${encodeURIComponent("Cloud sign-in was cancelled.")}`, request);
  const raw = readCookie(request, OAUTH_COOKIE); let pending: OAuthPending | null = null;
  try { pending = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthPending : null; } catch { pending = null; }
  if (!pending || pending.provider !== provider || pending.state !== query.get("state") || !query.get("code")) throw new ApiError(403, "The sign-in request has expired. Please start again from your invitation.");
  const tokens = await exchangeCode(request, provider, query.get("code")!, pending.verifier);
  const connection = await cloudIdentity(provider, tokens);
  if (!await validateInvitation(pending.invitation, connection.email)) throw new ApiError(403, "This invitation does not match the cloud account.");
  const user = await upsertCloudUser(connection.email, provider); await saveCloudConnection(user.accountId, connection);
  for (const folder of ["Projects", "Autosave"]) { try { await createCloudFolder(connection, folder); } catch { /* Existing folders are expected on reconnect. */ } }
  await acceptInvitation(pending.invitation); await appendAudit(user, "auth.cloud-login", provider);
  const token = await createSessionToken({ accountId: user.accountId, username: user.username, role: user.role, signedInAt: nowIso() });
  return new Response(null, { status: 302, headers: { location: new URL("/dashboard", request.url).toString(), "set-cookie": sessionCookie(token, request) } });
}

async function sendInvitation(request: Request, user: StoredUser): Promise<Response> {
  const payload = await request.json().catch(() => null) as { email?: string } | null;
  const email = String(payload?.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Enter a valid subscriber email address.");
  const { invitation, token } = await createInvitation(email, user.username);
  const inviteUrl = new URL(`/login?invite=${encodeURIComponent(token)}`, request.url).toString();
  const resendKey = process.env.RESEND_API_KEY?.trim(), sender = process.env.RESEND_FROM?.trim();
  if (resendKey && sender) await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: sender, to: [email], subject: "Your RAMSport invitation", html: `<p>You have been invited to RAMSport.</p><p><a href="${inviteUrl}">Open your secure sign-in link</a></p><p>This link expires in seven days.</p>` }) });
  await appendAudit(user, "subscriber.invite", email);
  return json({ ok: true, email: invitation.email, expiresAt: invitation.expiresAt, inviteUrl: resendKey && sender ? undefined : inviteUrl });
}

function logout(request: Request): Response {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(request) });
}

async function listFiles(user: StoredUser): Promise<Response> {
  const connection = await loadCloudConnection(user.accountId);
  const map = connection ? await listCloudFiles(connection) : await loadFiles(user.accountId);
  const entries = buildTree(map);
  const recent = flattenFiles(entries).slice(0, 12);
  return json({ storage: connection ? connection.provider : "server", root: "project", entries, recent, stats: storageStats(map) });
}

async function createEntry(request: Request, user: StoredUser): Promise<Response> {
  const accountId = user.accountId;
  const payload = await request.json().catch(() => null) as { action?: string; name?: string; parent?: string; kind?: string } | null;
  const action = payload?.action ?? "";
  const now = nowIso();
  const cloud = await loadCloudConnection(accountId);
  if (cloud) {
    let relativePath = "";
    if (action === "create-project") { relativePath = `Projects/${safeName(payload?.name)}`; await createCloudFolder(cloud, relativePath); }
    else if (action === "create-folder") { relativePath = `${normalisePath(payload?.parent).path}/${safeName(payload?.name)}`; await createCloudFolder(cloud, relativePath); }
    else if (action === "create-document") {
      const kind = DOCUMENT_KINDS.find(item => item.kind === payload?.kind); if (!kind) throw badRequest("Choose a RAMSport document type.");
      relativePath = `${normalisePath(payload?.parent).path}/${withDocumentExtension(payload?.name ?? "", kind.kind)}`;
      await writeCloudFile(cloud, relativePath, `${JSON.stringify(DOCUMENT_TEMPLATES[kind.kind])}\n`);
    } else throw badRequest("Unsupported storage action.");
    await appendAudit(user, action, relativePath); return json({ ok: true, relativePath }, 201);
  }

  const created = await updateFiles<{ relativePath: string; audit: string }>(accountId, map => {
    if (action === "create-project") {
      const name = safeName(payload?.name);
      if (siblingNameTaken(map, "", name)) throw new ApiError(409, "A project with that name already exists.");
      // A project is just a folder. The user creates the documents and
      // sub-folders they need from the file manager, like in Explorer.
      map[name] = { kind: "dir", modified: now };
      return { relativePath: name, audit: "project.create" };
    }

    if (action === "create-document") {
      const parent = normalisePath(payload?.parent).path;
      if (map[parent]?.kind !== "dir") throw badRequest("Choose an existing folder for the new file.");
      const requestedKind = DOCUMENT_KINDS.find(entry => entry.kind === payload?.kind);
      if (!requestedKind) throw badRequest("Choose a RAMSport document type.");
      const fileName = withDocumentExtension(payload?.name ?? "", requestedKind.kind);
      if (!fileName) throw badRequest("Enter a file name.");
      const target = normalisePath(`${parent}/${fileName}`).path;
      if (siblingNameTaken(map, parent, fileName)) throw new ApiError(409, "A file or folder with that name already exists.");
      map[target] = {
        kind: "file",
        modified: now,
        content: `${JSON.stringify(DOCUMENT_TEMPLATES[requestedKind.kind])}\n`,
      };
      touchParents(map, target, now);
      return { relativePath: target, audit: "project.document.create" };
    }

    if (action === "create-folder") {
      const parent = normalisePath(payload?.parent).path;
      if (map[parent]?.kind !== "dir") throw badRequest("The parent folder no longer exists.");
      const name = safeName(payload?.name);
      const target = `${parent}/${name}`;
      if (siblingNameTaken(map, parent, name)) throw new ApiError(409, "A file or folder with that name already exists.");
      map[target] = { kind: "dir", modified: now };
      touchParents(map, target, now);
      return { relativePath: target, audit: "project.folder.create" };
    }

    throw badRequest("Unsupported storage action.");
  });

  await appendAudit(user, created.audit, created.relativePath);
  return json({ ok: true, relativePath: created.relativePath }, 201);
}

async function renameEntry(request: Request, user: StoredUser): Promise<Response> {
  const accountId = user.accountId;
  const payload = await request.json().catch(() => null) as { path?: string; name?: string } | null;
  const now = nowIso();
  const source = normalisePath(payload?.path).path;
  const cloud = await loadCloudConnection(accountId);
  if (cloud) {
    let name = safeName(payload?.name); if (extensionOf(source) && !extensionOf(name)) name += extensionOf(source);
    await renameCloudEntry(cloud, source, name); const target = `${parentOf(source) ? `${parentOf(source)}/` : ""}${name}`;
    await appendAudit(user, "project.rename", target); await rewriteSaveLocations(accountId, source, target); return json({ ok: true, relativePath: target });
  }

  const target = await updateFiles<string>(accountId, map => {
    const entry = map[source];
    if (!entry) throw new ApiError(404, "That file or folder no longer exists.");

    let name = safeName(payload?.name);
    if (entry.kind === "file") {
      const originalExtension = extensionOf(source);
      const requestedExtension = extensionOf(name);
      if (!requestedExtension) name += originalExtension;
      else if (requestedExtension.toLocaleLowerCase() !== originalExtension.toLocaleLowerCase()) {
        throw badRequest(`Keep the ${originalExtension} file extension when renaming this document.`);
      }
    }

    const parent = parentOf(source);
    const renamed = parent ? `${parent}/${name}` : name;
    if (renamed === source) return source;
    if (siblingNameTaken(map, parent, name, source)) throw new ApiError(409, "A file or folder with that name already exists.");

    for (const key of Object.keys(map)) {
      if (key !== source && !key.startsWith(`${source}/`)) continue;
      map[`${renamed}${key.slice(source.length)}`] = map[key];
      delete map[key];
    }
    touchParents(map, renamed, now);
    return renamed;
  });

  await appendAudit(user, "project.rename", target);
  if (target !== source) await rewriteSaveLocations(accountId, source, target);
  return json({ ok: true, relativePath: target });
}

async function deleteEntry(request: Request, user: StoredUser): Promise<Response> {
  const accountId = user.accountId;
  const source = normalisePath(new URL(request.url).searchParams.get("path")).path;
  const cloud = await loadCloudConnection(accountId);
  if (cloud) { await deleteCloudEntry(cloud, source); await appendAudit(user, "project.delete", source); await rewriteSaveLocations(accountId, source, null); return json({ ok: true, relativePath: source }); }

  await updateFiles(accountId, map => {
    if (!map[source]) throw new ApiError(404, "That file or folder no longer exists.");
    for (const key of Object.keys(map)) {
      if (key === source || key.startsWith(`${source}/`)) delete map[key];
    }
    touchParents(map, source, nowIso());
  });

  await appendAudit(user, "project.delete", source);
  await rewriteSaveLocations(accountId, source, null);
  return json({ ok: true, relativePath: source });
}

async function readDocument(request: Request, user: StoredUser): Promise<Response> {
  const accountId = user.accountId;
  const path = normalisePath(new URL(request.url).searchParams.get("path")).path;
  const cloud = await loadCloudConnection(accountId);
  if (cloud) {
    const file = await readCloudFile(cloud, path); if (byteLength(file.content) > MAX_DOCUMENT_BYTES) throw badRequest("This cloud document is too large to open.");
    let data: unknown = null; try { data = file.content.trim() ? JSON.parse(file.content) : null; } catch { data = null; }
    return json({ path, data, modified: file.modified, size: byteLength(file.content), storage: cloud.provider });
  }
  const map = await loadFiles(accountId);
  const entry = map[path];
  if (!entry || entry.kind !== "file") throw new ApiError(404, "That document no longer exists.");

  const content = entry.content ?? "";
  if (byteLength(content) > MAX_DOCUMENT_BYTES) throw badRequest("This document is too large to open.");
  let data: unknown = null;
  if (content.trim()) {
    try {
      data = JSON.parse(content);
    } catch {
      data = null;
    }
  }
  return json({ path, data, modified: entry.modified, size: byteLength(content) });
}

async function writeDocument(request: Request, user: StoredUser): Promise<Response> {
  const accountId = user.accountId;
  const payload = await request.json().catch(() => null) as { path?: string; data?: unknown } | null;
  const path = normalisePath(payload?.path).path;
  const extension = extensionOf(path).toLocaleLowerCase();
  if (!SAFE_EXTENSIONS.has(extension)) throw badRequest("Only RAMSport document files can be saved here.");

  const value = payload?.data;
  const text = `${JSON.stringify(value === undefined || value === null ? {} : value)}\n`;
  if (byteLength(text) > MAX_DOCUMENT_BYTES) throw badRequest("This document is too large to save.");

  const now = nowIso();
  const cloud = await loadCloudConnection(accountId);
  if (cloud) { await writeCloudFile(cloud, path, text); await appendAudit(user, "project.save", path); return json({ ok: true, path, modified: now, size: byteLength(text), storage: cloud.provider }); }
  await updateFiles(accountId, map => {
    const parent = parentOf(path);
    if (!parent || map[parent]?.kind !== "dir") throw badRequest("The folder no longer exists.");
    map[path] = { kind: "file", modified: now, content: text };
    touchParents(map, path, now);
  });

  return json({ ok: true, path, modified: now, size: byteLength(text) });
}

async function getProfile(user: StoredUser): Promise<Response> {
  return json(profileDto(user, await loadProfile(user.accountId, user.username)));
}

async function saveProfile(request: Request, user: StoredUser): Promise<Response> {
  const form = await request.formData();
  const current = await loadProfile(user.accountId, user.username);

  const requestedName = String(form.get("displayName") ?? "").trim();
  const displayName = (requestedName || user.username).slice(0, 80);
  if (!displayName) throw badRequest("Enter a display name.");

  const removePhoto = String(form.get("removePhoto") ?? "") === "true";
  const requestedPreset = String(form.get("avatarPreset") ?? "").trim();
  const preset = stockAvatarPath(requestedPreset) ? requestedPreset : null;
  const image = form.get("image");

  let avatarPreset = removePhoto ? null : current.avatarPreset;
  let avatarDataUrl = removePhoto ? null : current.avatarDataUrl;

  if (preset) {
    avatarPreset = preset;
    avatarDataUrl = null;
  } else if (image && typeof image === "object" && "arrayBuffer" in image && "size" in image) {
    const file = image as File;
    if (file.size > 0) {
      if (file.size > MAX_PHOTO_BYTES) throw badRequest("Choose an image smaller than 5 MB.");
      if (!PHOTO_TYPES.has(file.type)) throw badRequest("Choose a PNG, JPEG or WebP image.");
      const bytes = Buffer.from(await file.arrayBuffer());
      avatarDataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
      avatarPreset = null;
    }
  }

  const profile: ProfileRecord = { displayName, avatarPreset, avatarDataUrl, updatedAt: nowIso() };
  await writeRecord(rowKey("profile", user.accountId), profile);
  await appendAudit(user, "profile.update", "profile");
  return json({ ok: true, profile: profileDto(user, profile) });
}

async function removePhoto(user: StoredUser): Promise<Response> {
  const current = await loadProfile(user.accountId, user.username);
  await writeRecord(rowKey("profile", user.accountId), {
    displayName: current.displayName,
    avatarPreset: null,
    avatarDataUrl: null,
    updatedAt: nowIso(),
  } satisfies ProfileRecord);
  await appendAudit(user, "profile.photo.remove", "profile");
  return json({ ok: true });
}

async function profileImage(user: StoredUser): Promise<Response> {
  const profile = await loadProfile(user.accountId, user.username);
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(profile.avatarDataUrl ?? "");
  // Only the media types accepted on upload may ever be served back.
  if (!match || !PHOTO_TYPES.has(match[1])) throw new ApiError(404, "No profile image.");
  return new Response(Buffer.from(match[2], "base64"), {
    status: 200,
    headers: {
      "content-type": match[1],
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}

async function getSaveLocations(user: StoredUser): Promise<Response> {
  return json({ locations: await loadSaveLocations(user.accountId) });
}

async function setSaveLocation(request: Request, user: StoredUser): Promise<Response> {
  const payload = await request.json().catch(() => null) as { kind?: string; path?: string } | null;
  const kind = payload?.kind === "rbd" || payload?.kind === "fta" || payload?.kind === "weibull" || payload?.kind === "mil217f" || payload?.kind === "fmeca" || payload?.kind === "lccpm" || payload?.kind === "lcccm" || payload?.kind === "spares" ? payload.kind : null;
  if (!kind) throw badRequest("Choose a supported document type.");
  const extension = ({ rbd: ".rbd", fta: ".fta", weibull: ".wbl", mil217f: ".217f", fmeca: ".fmeca", lccpm: ".lccpm", lcccm: ".lcccm", spares: ".spares" } as const)[kind];
  const path = normalisePath(payload?.path).path;
  if (extensionOf(path).toLocaleLowerCase() !== extension) {
    throw badRequest(`Only ${extension} documents can be remembered for this module.`);
  }

  await mutateRecord<SaveLocations>(rowKey("save-locations", user.accountId), current => ({
    ...sanitiseSaveLocations(current),
    [kind]: path,
  }));
  return json({ ok: true, kind, path });
}

async function recordAudit(request: Request, user: StoredUser): Promise<Response> {
  const allowed = new Set(["module.open", "admin.user.create", "admin.user.delete", "document.rename"]);
  const payload = await request.json().catch(() => null) as { action?: string; resource?: string } | null;
  const action = payload?.action ?? "";
  if (!action || !allowed.has(action)) throw badRequest("Unsupported audit action.");
  if (action.startsWith("admin.") && user.role !== "admin") throw new ApiError(403, "Administrator access required.");
  const resource = (payload?.resource ?? "application").slice(0, 160);
  await appendAudit(user, action, resource);
  return json({ ok: true }, 201);
}

/* -------------------------------------------------------------------------- */
/* Module scratchpads                                                          */
/* -------------------------------------------------------------------------- */

const WORKSPACE_KEY_PATTERN = /^[\p{L}\p{N} _.:@/-]{1,200}$/u;
const MAX_WORKSPACE_BYTES = 5_000_000;

function normaliseWorkspaceKey(value: string | null | undefined) {
  const key = (value ?? "").trim();
  if (!WORKSPACE_KEY_PATTERN.test(key) || key.includes("..")) throw badRequest("Invalid workspace key.");
  return key;
}

function workspaceRecordKey(accountId: string, key: string) {
  return `workspace:${ownerAccountId(accountId)}:${key}`;
}

async function readWorkspace(request: Request, user: StoredUser): Promise<Response> {
  const key = normaliseWorkspaceKey(new URL(request.url).searchParams.get("key"));
  const value = await readRecord<unknown>(workspaceRecordKey(user.accountId, key));
  return json({ key, value: value ?? null });
}

async function writeWorkspace(request: Request, user: StoredUser): Promise<Response> {
  const payload = await request.json().catch(() => null) as { key?: string; value?: unknown } | null;
  const key = normaliseWorkspaceKey(payload?.key);
  const text = JSON.stringify(payload?.value ?? null);
  if (byteLength(text) > MAX_WORKSPACE_BYTES) throw badRequest("This workspace snapshot is too large to save.");
  await writeRecord(workspaceRecordKey(user.accountId, key), payload?.value ?? null);
  return json({ ok: true, key });
}

/* -------------------------------------------------------------------------- */
/* Administrator directory                                                     */
/* -------------------------------------------------------------------------- */

async function listUsers(): Promise<Response> {
  const users = await loadUsers();
  return json({
    users: users.map(candidate => ({
      id: candidate.accountId,
      username: candidate.username,
      usernameKey: candidate.usernameKey,
      role: candidate.role,
      createdAt: candidate.createdAt,
      createdBy: candidate.createdBy,
    })),
  });
}

async function createUser(request: Request, actor: StoredUser): Promise<Response> {
  const payload = await request.json().catch(() => null) as { username?: string; password?: string; role?: string } | null;
  const username = (payload?.username ?? "").trim();
  if (username.length < 3 || username.length > 32) throw badRequest("Username must be between 3 and 32 characters.");
  if (!/^[A-Za-z0-9._-]+$/.test(username)) throw badRequest("Username can use letters, numbers, dot, dash and underscore only.");

  const password = payload?.password ?? "";
  if (password.length < 12) throw badRequest("Password must be at least 12 characters.");
  if (password.length > 128) throw badRequest("Password must be 128 characters or fewer.");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest("Password must contain at least one uppercase letter, one lowercase letter, and one number.");
  }

  const role = payload?.role === "admin" ? "admin" : "user";
  const usernameKey = username.toLocaleLowerCase();
  const credentials = await createPassword(password);

  const created = await updateUsers(users => {
    if (users.some(candidate => candidate.usernameKey === usernameKey)) {
      throw new ApiError(409, "That username is already in use.");
    }
    const user: StoredUser = {
      accountId: newAccountId(),
      username,
      usernameKey,
      role,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      active: true,
      createdAt: nowIso(),
      createdBy: actor.username,
    };
    users.push(user);
    return user;
  });

  await appendAudit(actor, "admin.user.create", created.username);
  return json({
    user: {
      id: created.accountId,
      username: created.username,
      usernameKey: created.usernameKey,
      role: created.role,
      createdAt: created.createdAt,
      createdBy: created.createdBy,
    },
  }, 201);
}

async function deleteUser(accountId: string, actor: StoredUser): Promise<Response> {
  const removed = await updateUsers(users => {
    const index = users.findIndex(candidate => candidate.accountId === accountId);
    if (index < 0) throw badRequest("That user no longer exists.");
    const user = users[index];
    if (user.accountId === actor.accountId) throw badRequest("You cannot remove the account you are signed in with.");
    if (user.usernameKey === "siva905") throw badRequest("The built-in administrator cannot be removed.");
    if (user.usernameKey === "test") throw badRequest("The test account cannot be removed.");
    if (user.usernameKey === "user") throw badRequest("The standard user account cannot be removed.");
    users.splice(index, 1);
    return user;
  });

  // Keep the account's files so a recreated user is not silently destructive,
  // but drop its remembered locations and audit rows.
  await removeRecord(rowKey("save-locations", removed.accountId)).catch(() => undefined);
  await removeRecord(rowKey("audit", removed.accountId)).catch(() => undefined);
  await appendAudit(actor, "admin.user.delete", removed.username);
  return json({ ok: true });
}

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export async function handleApi(request: Request, segments: string[]): Promise<Response> {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError(403, "Cross-site requests are not allowed.");
    }

    const path = `/api/${segments.join("/")}`;
    const method = request.method.toUpperCase();

    // Sign-in is the only public API operation. Every other request resolves
    // the signed cookie once here, then uses this server-owned identity for
    // resource ownership and role checks below.
    if (path === "/api/auth/login" && method === "POST") return await login(request);
    if (path === "/api/auth/google" && method === "GET") return await startCloudLogin(request, "google");
    if (path === "/api/auth/microsoft" && method === "GET") return await startCloudLogin(request, "microsoft");
    if (path === "/api/auth/google/callback" && method === "GET") return await finishCloudLogin(request, "google");
    if (path === "/api/auth/microsoft/callback" && method === "GET") return await finishCloudLogin(request, "microsoft");
    const administratorPath = path === "/api/admin/users" || path.startsWith("/api/admin/users/");
    const user = administratorPath ? await requireUser(request, true) : await requireUser(request);

    if (path === "/api/auth/logout" && method === "POST") return logout(request);
    if (path === "/api/auth/session" && method === "GET") {
      return json({ user: { accountId: user.accountId, username: user.username, role: user.role } });
    }

    if (path === "/api/files" && method === "GET") return await listFiles(user);
    if (path === "/api/files" && method === "POST") return await createEntry(request, user);
    if (path === "/api/files" && method === "PATCH") return await renameEntry(request, user);
    if (path === "/api/files" && method === "DELETE") return await deleteEntry(request, user);

    if (path === "/api/files/content" && method === "GET") return await readDocument(request, user);
    if (path === "/api/files/content" && method === "PUT") return await writeDocument(request, user);

    if (path === "/api/profile" && method === "GET") return await getProfile(user);
    if (path === "/api/profile" && method === "POST") return await saveProfile(request, user);
    if (path === "/api/profile" && method === "DELETE") return await removePhoto(user);
    if (path === "/api/profile/image" && method === "GET") return await profileImage(user);
    if (path === "/api/cloud/status" && method === "GET") return json({ connection: await cloudStatus(user.accountId) });

    if (path === "/api/save-locations" && method === "GET") return await getSaveLocations(user);
    if (path === "/api/save-locations" && method === "POST") return await setSaveLocation(request, user);

    if (path === "/api/workspace" && method === "GET") return await readWorkspace(request, user);
    if (path === "/api/workspace" && method === "PUT") return await writeWorkspace(request, user);

    if (path === "/api/audit" && method === "POST") return await recordAudit(request, user);

    if (path === "/api/admin/users" && method === "GET") {
      return await listUsers();
    }
    if (path === "/api/admin/users" && method === "POST") {
      return await createUser(request, user);
    }
    if (path === "/api/admin/invitations" && method === "POST") {
      if (user.role !== "admin") throw new ApiError(403, "Administrator access required.");
      return await sendInvitation(request, user);
    }
    if (path.startsWith("/api/admin/users/") && method === "DELETE") {
      let accountId: string;
      try {
        accountId = decodeURIComponent(path.slice("/api/admin/users/".length));
      } catch {
        throw badRequest("That account id is not valid.");
      }
      return await deleteUser(accountId, user);
    }

    if (path === "/api/health" && method === "GET") {
      return json({ ok: true, storage: process.env.MONGODB_URI ? "mongodb" : "filesystem", time: nowIso() });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
