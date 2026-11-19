import { isAssetList, readAssetsIfPresent, starterAssets, type Asset } from "@/data/workspace";
import { loadDocument } from "@/services/documents/client";

/**
 * Every RAMSport module must originate its component list from the project's
 * Data Register. A module document lives somewhere inside a project folder, so
 * the owning project is the first path segment.
 *
 * Projects are plain folders now, so the register can live wherever the user
 * created it. The resolver is deliberately tolerant:
 *   1. the project file listing, preferring `Project/Data Register/Project.data`;
 *   2. any `*.data` file anywhere under `Project/Data Register/`;
 *   3. any other `*.data` file anywhere under `Project/`;
 *   4. a legacy register saved against this module's own document scope;
 *   5. the built-in starter register as a last resort.
 */
export type ProjectRegister = {
  assets: Asset[];
  /** Human-readable description of where the assets came from. */
  source: string;
  /** Path of the Data Register document, when one was found. */
  registerPath: string | null;
};

type ListedEntry = { name: string; path: string; type: string; children?: ListedEntry[] };

function projectOf(modulePath?: string) {
  return (modulePath ?? "").split("/").filter(Boolean)[0] ?? "";
}

async function readRegisterFile(path: string): Promise<Asset[] | null> {
  const data = await loadDocument(path);
  return isAssetList(data) ? data : null;
}

function isDataEntry(entry: ListedEntry) {
  return entry.type === "data" || entry.name.toLowerCase().endsWith(".data");
}

function findDataFile(entries: ListedEntry[], project: string): string | null {
  const root = entries.find(entry => entry.path === project);
  if (!root) return null;

  const dataFiles: ListedEntry[] = [];
  const visit = (entry: ListedEntry) => {
    if (isDataEntry(entry)) dataFiles.push(entry);
    entry.children?.forEach(visit);
  };
  visit(root);
  if (!dataFiles.length) return null;

  const registerFolder = `${project}/Data Register/`;
  const inRegisterFolder = dataFiles.filter(entry => entry.path.startsWith(registerFolder));
  const pool = inRegisterFolder.length ? inRegisterFolder : dataFiles;
  const canonicalName = `${project}.data`.toLowerCase();
  return (pool.find(entry => entry.name.toLowerCase() === canonicalName) ?? pool[0]).path;
}

async function listRegisterPath(project: string): Promise<string | null> {
  try {
    const response = await fetch("/api/files", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { entries?: ListedEntry[] };
    return Array.isArray(payload.entries) ? findDataFile(payload.entries, project) : null;
  } catch {
    return null;
  }
}

export async function loadProjectRegister(modulePath?: string): Promise<ProjectRegister> {
  const project = projectOf(modulePath);

  if (project) {
    // List the project first: probing a canonical path that does not exist
    // would log a failed request every time a module opens.
    const listed = await listRegisterPath(project);
    if (listed) {
      const assets = await readRegisterFile(listed);
      if (assets) return { assets, source: `${project} ? ${listed.split("/").slice(1).join("/")}`, registerPath: listed };
    }
  }

  const legacy = await readAssetsIfPresent(modulePath);
  if (legacy) return { assets: legacy, source: "Module register snapshot", registerPath: null };

  return { assets: starterAssets, source: "Starter register (no project Data Register found)", registerPath: null };
}
