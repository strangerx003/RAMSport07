export { loadProjectRegister } from "@/services/documents/project-register";

export type Asset = {
  id: string;
  tag: string;
  description: string;
  system: string;
  qty: number;
  lambda: number;
  mttr: number;
  mission: number;
  criticality: string;
  status: string;
};

export type DiagramNode = {
  id: number;
  x: number;
  y: number;
  type: string;
  title: string;
  subtitle: string;
  assetId?: string;
  groupId?: string;
  failureRate?: number;
  mttr?: number;
  mission?: number;
  r?: number;
  n?: number;
};

export type RbdGroup = {
  id: string;
  tag: string;
  name: string;
  failureRate: number;
  mtbf: number;
  mttr: number;
  availability: number;
  configuration: string;
  paths: number;
  memberCount: number;
  createdAt: string;
  formulaVersion: "rbd-sheet-v1";
  members?: DiagramNode[];
  internalEdges?: DiagramEdge[];
};

export type DiagramEdge = {
  from: number;
  to: number;
  style: "straight" | "elbow";
  waypoint?: { x: number; y: number };
  fromSide?: "left" | "right" | "top" | "bottom";
  toSide?: "left" | "right" | "top" | "bottom";
};
export type DiagramState = { nodes: DiagramNode[]; edges: DiagramEdge[] };
export type DiagramReportRow = {
  reference: string; component: string; type: string; failureRate: string; mtbf: string; mttr: string; availability: string;
  description?: string; quantity?: string | number; n?: string | number; r?: string | number;
  componentMtbf?: string; componentFailureRate?: string; componentMttr?: string; componentAvailability?: string;
  systemMtbf?: string; systemFailureRate?: string; systemMttr?: string; systemAvailability?: string; lambdaMttr?: string;
};

import type { WeibullDataPoint, WeibullLru, WeibullOptions } from "@/engine/weibull";
import type { Mil217fOptions, Mil217fPart } from "@/engine/mil217f";
import type { FmecaItemRecord, FmecaMode } from "@/engine/fmeca";
import type { LccCmAsset, LccCmDocument, LccInputs, LccPmAsset, LccPmDocument } from "@/engine/lcc";
import type { SpareItem, SparesDocument, SparesInputs } from "@/engine/spares";

export const REGISTER_KEY = "register";
export const REGISTER_UPDATED_EVENT = "ramsport-register-updated";
export const RBD_GROUPS_KEY = "rbd-groups";
export const RBD_GROUPS_UPDATED_EVENT = "ramsport-rbd-groups-updated";

/**
 * Documents are scoped by their project-relative path so two projects (or an
 * unsaved module scratchpad) never share the same record.
 *
 * The snapshot is persisted by the server under the signed-in account; the
 * browser never stores it.
 */
function workspaceKey(resource: string, scope?: string) {
  return scope ? `${resource}@${scope}` : resource;
}

async function readWorkspace<T>(
  resource: string,
  scope: string | undefined,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const key = workspaceKey(resource, scope);
    const response = await fetch(`/api/workspace?${new URLSearchParams({ key }).toString()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { value?: unknown };
    return isValid(payload.value) ? payload.value : null;
  } catch {
    return null;
  }
}

async function writeWorkspace(resource: string, scope: string | undefined, value: unknown): Promise<void> {
  try {
    await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: workspaceKey(resource, scope), value }),
    });
  } catch {
    // The authoritative document is written through /api/files/content; a
    // failed scratchpad write must never block editing.
  }
}

function notify(name: string, detail: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function isDiagramState(value: unknown): value is DiagramState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DiagramState>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

export function isAssetList(value: unknown): value is Asset[] {
  return Array.isArray(value) && value.every(item => item && typeof item === "object" && "tag" in item && "lambda" in item);
}

/**
 * Saved Weibull life-data document. The version tag lets future revisions of
 * the IEC 61649 engine reject incompatible records instead of silently
 * reinterpreting them.
 */
export type WeibullDocument = {
  formulaVersion: "weibull-iec61649-v1";
  points: WeibullDataPoint[];
  options: WeibullOptions;
  missionTimes: number[];
  /** LRU material-life table. Optional so older saved files stay valid. */
  material?: WeibullMaterialDocument;
};

export type WeibullMaterialDocument = {
  lrus: WeibullLru[];
  /** Age at which FPMH, R(t) and MTBF are quoted, in years. */
  horizonYears: number;
};

export const WEIBULL_KEY = "weibull-document";
export const WEIBULL_UPDATED_EVENT = "ramsport-weibull-updated";

export function isWeibullDocument(value: unknown): value is WeibullDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeibullDocument>;
  if (candidate.formulaVersion !== "weibull-iec61649-v1") return false;
  if (!Array.isArray(candidate.points)) return false;
  if (!candidate.options || typeof candidate.options !== "object") return false;
  return candidate.points.every(point => Boolean(point) && typeof point === "object" && "time" in point);
}

export function readWeibull(scope?: string): Promise<WeibullDocument | null> {
  return readWorkspace(WEIBULL_KEY, scope, isWeibullDocument);
}

export async function saveWeibull(record: WeibullDocument, scope?: string): Promise<void> {
  await writeWorkspace(WEIBULL_KEY, scope, record);
  notify(WEIBULL_UPDATED_EVENT, record);
}

/**
 * Saved MIL-HDBK-217F prediction. Parts link back to Data Register assets by
 * `assetId`; the 217F-specific model inputs stay in this document so the shared
 * register remains the single component baseline.
 */
export type Mil217fDocument = {
  formulaVersion: "mil217f-notice2-v1";
  parts: Mil217fPart[];
  options: Mil217fOptions;
};

export const MIL217F_KEY = "mil217f-document";
export const MIL217F_UPDATED_EVENT = "ramsport-mil217f-updated";

export function isMil217fDocument(value: unknown): value is Mil217fDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Mil217fDocument>;
  if (candidate.formulaVersion !== "mil217f-notice2-v1") return false;
  if (!Array.isArray(candidate.parts)) return false;
  if (!candidate.options || typeof candidate.options !== "object") return false;
  return candidate.parts.every(part => Boolean(part) && typeof part === "object" && "modelId" in part);
}

export function readMil217f(scope?: string): Promise<Mil217fDocument | null> {
  return readWorkspace(MIL217F_KEY, scope, isMil217fDocument);
}

export async function saveMil217f(record: Mil217fDocument, scope?: string): Promise<void> {
  await writeWorkspace(MIL217F_KEY, scope, record);
  notify(MIL217F_UPDATED_EVENT, record);
}

/** Saved MIL-STD-1629A FMEA/FMECA worksheet. */
export type FmecaDocument = {
  formulaVersion: "mil-std-1629a-v1";
  mode: FmecaMode;
  items: FmecaItemRecord[];
  options: { missionTime: number };
};

export const FMECA_KEY = "fmeca-document";
export const FMECA_UPDATED_EVENT = "ramsport-fmeca-updated";

export function isFmecaDocument(value: unknown): value is FmecaDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FmecaDocument>;
  if (candidate.formulaVersion !== "mil-std-1629a-v1") return false;
  if (candidate.mode !== "fmea" && candidate.mode !== "fmeca") return false;
  if (!Array.isArray(candidate.items)) return false;
  return candidate.items.every(item => Boolean(item) && typeof item === "object" && "reference" in item);
}

export function readFmeca(scope?: string): Promise<FmecaDocument | null> {
  return readWorkspace(FMECA_KEY, scope, isFmecaDocument);
}

export async function saveFmeca(record: FmecaDocument, scope?: string): Promise<void> {
  await writeWorkspace(FMECA_KEY, scope, record);
  notify(FMECA_UPDATED_EVENT, record);
}

/* -------------------------------------------------------------------------- */
/* Life Cycle Costing ? IEC 60300-3-3                                          */
/* -------------------------------------------------------------------------- */

export type { LccCmDocument, LccPmDocument } from "@/engine/lcc";
export type { SparesDocument } from "@/engine/spares";

export type { LccCmAsset, LccInputs, LccPmAsset, SpareItem, SparesInputs };

export const LCC_PM_KEY = "lcc-pm-document";
export const LCC_PM_UPDATED_EVENT = "ramsport-lcc-pm-updated";
export const LCC_CM_KEY = "lcc-cm-document";
export const LCC_CM_UPDATED_EVENT = "ramsport-lcc-cm-updated";

export function isLccPmDocument(value: unknown): value is LccPmDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LccPmDocument>;
  if (candidate.formulaVersion !== "lcc-pm-iec60300-3-3-v1") return false;
  if (!candidate.inputs || typeof candidate.inputs !== "object") return false;
  if (!Array.isArray(candidate.assets)) return false;
  return candidate.assets.every(asset => Boolean(asset) && typeof asset === "object" && "tag" in asset && Array.isArray((asset as LccPmAsset).pmTasks));
}

export function isLccCmDocument(value: unknown): value is LccCmDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LccCmDocument>;
  if (candidate.formulaVersion !== "lcc-cm-iec60300-3-3-v1") return false;
  if (!candidate.inputs || typeof candidate.inputs !== "object") return false;
  if (!Array.isArray(candidate.assets)) return false;
  return candidate.assets.every(asset => Boolean(asset) && typeof asset === "object" && "tag" in asset && Boolean((asset as LccCmAsset).cm));
}

export function readLccPm(scope?: string): Promise<LccPmDocument | null> {
  return readWorkspace(LCC_PM_KEY, scope, isLccPmDocument);
}

export async function saveLccPm(record: LccPmDocument, scope?: string): Promise<void> {
  await writeWorkspace(LCC_PM_KEY, scope, record);
  notify(LCC_PM_UPDATED_EVENT, record);
}

export function readLccCm(scope?: string): Promise<LccCmDocument | null> {
  return readWorkspace(LCC_CM_KEY, scope, isLccCmDocument);
}

export async function saveLccCm(record: LccCmDocument, scope?: string): Promise<void> {
  await writeWorkspace(LCC_CM_KEY, scope, record);
  notify(LCC_CM_UPDATED_EVENT, record);
}

/* -------------------------------------------------------------------------- */
/* Spare Parts Analysis ? EN 50126-3 / IEC 60300-3-3                           */
/* -------------------------------------------------------------------------- */

export const SPARES_KEY = "spares-document";
export const SPARES_UPDATED_EVENT = "ramsport-spares-updated";

export function isSparesDocument(value: unknown): value is SparesDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SparesDocument>;
  if (candidate.formulaVersion !== "spares-en50126-3-v1") return false;
  if (!candidate.inputs || typeof candidate.inputs !== "object") return false;
  if (!Array.isArray(candidate.items)) return false;
  return candidate.items.every(item => Boolean(item) && typeof item === "object" && "tag" in item);
}

export function readSpares(scope?: string): Promise<SparesDocument | null> {
  return readWorkspace(SPARES_KEY, scope, isSparesDocument);
}

export async function saveSpares(record: SparesDocument, scope?: string): Promise<void> {
  await writeWorkspace(SPARES_KEY, scope, record);
  notify(SPARES_UPDATED_EVENT, record);
}

export const starterAssets: Asset[] = [
  { id: "1", tag: "SIG-CBI-001", description: "Computer Based Interlocking", system: "Signalling", qty: 2, lambda: 0.0000012, mttr: 2.5, mission: 8760, criticality: "Safety critical", status: "Validated" },
  { id: "2", tag: "COM-RAD-014", description: "Trackside Radio Unit", system: "Communications", qty: 18, lambda: 0.0000048, mttr: 1.2, mission: 8760, criticality: "Mission critical", status: "In review" },
  { id: "3", tag: "PWR-UPS-004", description: "Uninterruptible Power Supply", system: "Power", qty: 4, lambda: 0.0000031, mttr: 3.5, mission: 8760, criticality: "Mission critical", status: "Draft" },
  { id: "4", tag: "PSD-CTL-022", description: "Platform Screen Door Controller", system: "Stations", qty: 24, lambda: 0.0000065, mttr: 0.8, mission: 5840, criticality: "Operational", status: "Validated" },
  { id: "5", tag: "TRK-AXC-031", description: "Axle Counter Evaluator", system: "Signalling", qty: 12, lambda: 0.0000021, mttr: 1.8, mission: 8760, criticality: "Safety critical", status: "In review" },
];

export async function readAssets(scope?: string): Promise<Asset[]> {
  return (await readWorkspace(REGISTER_KEY, scope, isAssetList)) ?? starterAssets;
}

/**
 * Like `readAssets` but returns `null` when this scope has no saved register,
 * so a module can fall back to the project's own Data Register file before
 * finally using the starter baseline.
 */
export function readAssetsIfPresent(scope?: string): Promise<Asset[] | null> {
  return readWorkspace(REGISTER_KEY, scope, isAssetList);
}

export async function saveAssets(assets: Asset[], scope?: string): Promise<void> {
  await writeWorkspace(REGISTER_KEY, scope, assets);
  notify(REGISTER_UPDATED_EVENT, assets);
}

export function isRbdGroupList(value: unknown): value is RbdGroup[] {
  return Array.isArray(value) && value.every(group => Boolean(group) && typeof group === "object" && (group as Partial<RbdGroup>).formulaVersion === "rbd-sheet-v1");
}

export async function readRbdGroups(scope?: string): Promise<RbdGroup[]> {
  return (await readWorkspace(RBD_GROUPS_KEY, scope, isRbdGroupList)) ?? [];
}

export async function saveRbdGroups(groups: RbdGroup[], scope?: string): Promise<void> {
  await writeWorkspace(RBD_GROUPS_KEY, scope, groups);
  notify(RBD_GROUPS_UPDATED_EVENT, groups);
}

export function readDiagram(mode: "rbd" | "fta", fallback: DiagramState, scope?: string): Promise<DiagramState> {
  return readWorkspace(`${mode}-diagram`, scope, isDiagramState).then(saved => saved ?? fallback);
}

export async function saveDiagram(mode: "rbd" | "fta", diagram: DiagramState, scope?: string): Promise<void> {
  await writeWorkspace(`${mode}-diagram`, scope, diagram);
}
