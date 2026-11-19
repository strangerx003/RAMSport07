/** Delegated document store. File bodies remain with Drive or OneDrive. */
import type { CloudConnection } from "./cloud-auth";

export type CloudFileMap = Record<string, { kind: "dir" | "file"; modified: string; content?: string }>;
type RemoteItem = { id: string; name: string; folder: boolean; modified: string };
const driveFolderMime = "application/vnd.google-apps.folder";

async function request(connection: CloudConnection, url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${connection.accessToken}`, ...(init.headers ?? {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(`Cloud storage request failed (${response.status}). Reconnect your cloud account and try again.`);
  return response;
}
function api(connection: CloudConnection, path: string) { return connection.provider === "google" ? `https://www.googleapis.com/drive/v3/${path}` : `https://graph.microsoft.com/v1.0/me/drive/${path}`; }

async function children(connection: CloudConnection, parentId: string): Promise<RemoteItem[]> {
  if (connection.provider === "google") {
    const query = encodeURIComponent(`'${parentId.replaceAll("'", "\\'")}' in parents and trashed=false`);
    const data = await request(connection, `${api(connection, `files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`)}`).then(response => response.json() as Promise<{ files?: { id: string; name: string; mimeType: string; modifiedTime?: string }[] }>);
    return (data.files ?? []).map(item => ({ id: item.id, name: item.name, folder: item.mimeType === driveFolderMime, modified: item.modifiedTime ?? new Date(0).toISOString() }));
  }
  const data = await request(connection, api(connection, `items/${parentId}/children?$select=id,name,folder,lastModifiedDateTime&$top=999`)).then(response => response.json() as Promise<{ value?: { id: string; name: string; folder?: object; lastModifiedDateTime?: string }[] }>);
  return (data.value ?? []).map(item => ({ id: item.id, name: item.name, folder: Boolean(item.folder), modified: item.lastModifiedDateTime ?? new Date(0).toISOString() }));
}
async function createFolder(connection: CloudConnection, parentId: string, name: string) {
  if (connection.provider === "google") return request(connection, api(connection, "files"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: driveFolderMime, parents: [parentId] }) }).then(response => response.json() as Promise<{ id: string }>).then(item => item.id);
  return request(connection, api(connection, `items/${parentId}/children`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) }).then(response => response.json() as Promise<{ id: string }>).then(item => item.id);
}
async function findPath(connection: CloudConnection, path: string[], createFolders = false) {
  let current = connection.rootId;
  for (const segment of path) {
    let item = (await children(connection, current)).find(candidate => candidate.name === segment);
    if (!item && createFolders) { current = await createFolder(connection, current, segment); continue; }
    if (!item || !item.folder) return null;
    current = item.id;
  }
  return current;
}
async function walk(connection: CloudConnection, parentId: string, prefix: string, output: CloudFileMap): Promise<void> {
  for (const item of await children(connection, parentId)) { const path = prefix ? `${prefix}/${item.name}` : item.name; output[path] = { kind: item.folder ? "dir" : "file", modified: item.modified }; if (item.folder) await walk(connection, item.id, path, output); }
}
export async function listCloudFiles(connection: CloudConnection) { const map: CloudFileMap = {}; await walk(connection, connection.rootId, "", map); return map; }
async function fileItem(connection: CloudConnection, path: string) {
  const parts = path.split("/"); const name = parts.pop(); const parent = await findPath(connection, parts); if (!parent || !name) return null;
  return { parent, item: (await children(connection, parent)).find(candidate => candidate.name === name) ?? null };
}
export async function createCloudFolder(connection: CloudConnection, path: string) { const parts = path.split("/").filter(Boolean); const parentParts = parts.slice(0, -1); const parent = await findPath(connection, parentParts, true); if (!parent) throw new Error("Cloud parent folder is unavailable."); const exists = (await children(connection, parent)).find(item => item.name === parts.at(-1)); if (exists) throw new Error("A cloud item with that name already exists."); return createFolder(connection, parent, parts.at(-1)!); }
export async function readCloudFile(connection: CloudConnection, path: string) { const found = await fileItem(connection, path); if (!found?.item || found.item.folder) throw new Error("That cloud document no longer exists."); const url = connection.provider === "google" ? `${api(connection, `files/${found.item.id}?alt=media`)}` : api(connection, `items/${found.item.id}/content`); const content = await request(connection, url).then(response => response.text()); return { content, modified: found.item.modified }; }
export async function writeCloudFile(connection: CloudConnection, path: string, content: string) {
  const parts = path.split("/").filter(Boolean); const name = parts.pop(); const parent = await findPath(connection, parts, true); if (!parent || !name) throw new Error("Cloud folder is unavailable."); const existing = (await children(connection, parent)).find(item => item.name === name);
  if (connection.provider === "microsoft") { const target = existing ? `items/${existing.id}/content` : `items/${parent}:/${encodeURIComponent(name)}:/content`; await request(connection, api(connection, target), { method: "PUT", headers: { "content-type": "application/json" }, body: content }); return; }
  if (existing) { await request(connection, `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, { method: "PATCH", headers: { "content-type": "application/json" }, body: content }); return; }
  const boundary = `ramsport-${Date.now()}`; const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  await request(connection, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
}
export async function deleteCloudEntry(connection: CloudConnection, path: string) { const found = await fileItem(connection, path); if (!found?.item) throw new Error("That cloud item no longer exists."); const url = connection.provider === "google" ? api(connection, `files/${found.item.id}`) : api(connection, `items/${found.item.id}`); await request(connection, url, { method: "DELETE" }); }
export async function renameCloudEntry(connection: CloudConnection, path: string, name: string) { const found = await fileItem(connection, path); if (!found?.item) throw new Error("That cloud item no longer exists."); const url = connection.provider === "google" ? api(connection, `files/${found.item.id}`) : api(connection, `items/${found.item.id}`); await request(connection, url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); }
