export type FileEntry = {
  name: string;
  path: string;
  type: "project" | "folder" | "rbd" | "fta" | "data" | "weibull" | "mil217f" | "fmeca" | "lccpm" | "lcccm" | "spares";
  modified: string;
  size?: number;
  children?: FileEntry[];
};

export const TYPE_LABELS: Record<FileEntry["type"], string> = {
  project: "Project",
  folder: "Folder",
  rbd: "Reliability Block Diagram",
  fta: "Fault Tree Analysis",
  data: "Data Register",
  weibull: "Weibull Analysis",
  mil217f: "MIL-HDBK-217F Prediction",
  fmeca: "FMEA / FMECA Worksheet",
  lccpm: "Life Cycle Cost ? Preventive Maintenance",
  lcccm: "Life Cycle Cost ? Corrective Maintenance",
  spares: "Spare Parts Analysis",
};

/** Compact type names for the browser's Type column. */
export const TYPE_SHORT_LABELS: Record<FileEntry["type"], string> = {
  project: "Project",
  folder: "Folder",
  rbd: "RBD",
  fta: "FTA",
  data: "Data",
  weibull: "Weibull",
  mil217f: "217F",
  fmeca: "FMECA",
  lccpm: "LCC-PM",
  lcccm: "LCC-CM",
  spares: "Spares",
};

export function isFolderEntry(entry: FileEntry) {
  return entry.type === "project" || entry.type === "folder";
}

/** Depth-first list of every entry, used by search results. */
export function flattenEntries(entries: FileEntry[]): FileEntry[] {
  return entries.flatMap(entry => [entry, ...(entry.children ? flattenEntries(entry.children) : [])]);
}

export function parentPath(value: string) {
  const segments = value.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

export function findEntry(entries: FileEntry[], path: string): FileEntry | null {
  const segments = path.split("/").filter(Boolean);
  let current: FileEntry[] = entries;
  let match: FileEntry | null = null;
  for (const segment of segments) {
    match = current.find(entry => entry.name === segment) ?? null;
    if (!match) return null;
    current = match.children ?? [];
  }
  return match;
}

export function allFolderPaths(entries: FileEntry[]): string[] {
  return entries.flatMap(entry => [
    ...(isFolderEntry(entry) ? [entry.path] : []),
    ...(entry.children ? allFolderPaths(entry.children) : []),
  ]);
}

export function countMatchingEntries(entries: FileEntry[], query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  return entries.reduce((total, entry) => {
    const self = `${entry.name} ${entry.path}`.toLowerCase().includes(needle) ? 1 : 0;
    const children = entry.children ? countMatchingEntries(entry.children, query) : 0;
    return total + self + children;
  }, 0);
}

export function remapPath(value: string, previousPath: string, nextPath: string) {
  if (value === previousPath) return nextPath;
  if (value.startsWith(`${previousPath}/`)) return `${nextPath}${value.slice(previousPath.length)}`;
  return value;
}
