"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "@/lib/icons";
import { findEntry, isFolderEntry, parentPath, type FileEntry } from "@/components/files/file-types";

export type SaveDialogKind = "rbd" | "fta" | "weibull" | "mil217f" | "fmeca" | "lccpm" | "lcccm" | "spares";

type Props = {
  open: boolean;
  kind: SaveDialogKind;
  /** Folder to start in (the previous location for this module). */
  defaultFolder?: string;
  /** File name suggestion, with or without the extension. */
  defaultName: string;
  /** The diagram instance that is written to the chosen file. */
  data: unknown;
  onClose: () => void;
  onSaved: (path: string) => void;
};

const EXTENSION: Record<SaveDialogKind, string> = { rbd: ".rbd", fta: ".fta", weibull: ".wbl", mil217f: ".217f", fmeca: ".fmeca", lccpm: ".lccpm", lcccm: ".lcccm", spares: ".spares" };
const KIND_LABEL: Record<SaveDialogKind, string> = {
  rbd: "RBD",
  fta: "FTA",
  weibull: "Weibull",
  mil217f: "MIL-217F",
  fmeca: "FMECA",
  lccpm: "LCC-PM",
  lcccm: "LCC-CM",
  spares: "Spares",
};

function withExtension(value: string, kind: SaveDialogKind) {
  const extension = EXTENSION[kind];
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  if (!cleaned) return "";
  if (cleaned.toLowerCase().endsWith(extension)) return cleaned;
  return `${cleaned.replace(/\.(rbd|fta|wbl|217f|fmeca|lccpm|lcccm|spares)$/i, "")}${extension}`;
}

async function readJson<T>(response: Response) {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The file could not be saved.");
  return payload;
}

/**
 * Windows-style "Save as" window: browse the application's project folders,
 * name the file, then write the current diagram instance there. The chosen
 * path is remembered in the browser by /api/save-locations.
 */
export default function SaveDialog({ open, kind, defaultFolder = "", defaultName, data, onClose, onSaved }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [folder, setFolder] = useState("");
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setName(defaultName);
    setNewFolderOpen(false);
    setNewFolderName("");
    void (async () => {
      try {
        const response = await fetch("/api/files", { cache: "no-store" });
        const payload = await readJson<{ entries?: FileEntry[] }>(response);
        if (!active) return;
        const list = Array.isArray(payload.entries) ? payload.entries : [];
        setEntries(list);
        const preferred = defaultFolder ? findEntry(list, defaultFolder) : null;
        setFolder(preferred && isFolderEntry(preferred) ? preferred.path : "");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "The workspace folders could not be read.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, defaultFolder, defaultName]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKeyDown); };
  }, [open, onClose, saving]);

  const current = folder ? findEntry(entries, folder) : null;
  const children = current?.children ?? entries;
  const folders = useMemo(() => children.filter(isFolderEntry).sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base", numeric: true })), [children]);
  const siblingFiles = useMemo(() => children.filter(entry => !isFolderEntry(entry) && entry.type === kind).sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base", numeric: true })), [children, kind]);
  const projects = useMemo(() => entries.filter(entry => entry.type === "project"), [entries]);
  const breadcrumbs = folder.split("/").filter(Boolean);
  const fileName = withExtension(name, kind);
  const targetPath = folder && fileName ? `${folder}/${fileName}` : "";
  const existing = Boolean(targetPath && siblingFiles.some(entry => entry.path === targetPath));

  function chooseFile(entry: FileEntry) {
    setName(entry.name);
    setError("");
  }

  async function reloadEntries(preferredFolder?: string) {
    const response = await fetch("/api/files", { cache: "no-store" });
    const payload = await readJson<{ entries?: FileEntry[] }>(response);
    const list = Array.isArray(payload.entries) ? payload.entries : [];
    setEntries(list);
    if (preferredFolder) setFolder(preferredFolder);
  }

  async function createFolder() {
    if (!folder) { setError("Choose a project folder first."); return; }
    const trimmed = newFolderName.trim();
    if (!trimmed) { setError("Enter a folder name."); return; }
    setCreatingFolder(true);
    setError("");
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-folder", parent: folder, name: trimmed }),
      });
      const payload = await readJson<{ relativePath?: string }>(response);
      if (!payload.relativePath) throw new Error("The folder could not be created.");
      await reloadEntries(payload.relativePath);
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The folder could not be created.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function save() {
    if (!folder) { setError("Choose a project folder before saving."); return; }
    if (!fileName) { setError("Enter a file name."); return; }
    const path = `${folder}/${fileName}`;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, data }),
      });
      await readJson(response);
      await fetch("/api/save-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, path }),
      }).catch(() => undefined);
      onSaved(path);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return <div className="app-dialog-backdrop save-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="app-dialog save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-dialog-title">
      <header>
        <div>
          <span className="app-dialog-kicker">Save {KIND_LABEL[kind]} document</span>
          <h2 id="save-dialog-title">Save current instance</h2>
          <p>Choose one of the application folders, then name the file. Later saves write straight into it.</p>
        </div>
        <button type="button" className="dialog-close" onClick={onClose} disabled={saving} aria-label="Close save dialog">?</button>
      </header>

      <div className="save-dialog-body">
        <aside className="save-dialog-places" aria-label="Workspace folders">
          <strong>Workspace</strong>
          <button type="button" className={!folder ? "active" : ""} onClick={() => setFolder("")}><Icons.grid/><span>All projects</span></button>
          {projects.map(project => <button type="button" key={project.path} className={folder === project.path ? "active" : ""} onClick={() => setFolder(project.path)} title={project.path}><Icons.folder/><span>{project.name}</span></button>)}
          {!loading && !projects.length && <p>No projects yet. Create one in Files first.</p>}
        </aside>

        <div className="save-dialog-main">
          <nav className="save-dialog-path" aria-label="Save location">
            <button type="button" onClick={() => setFolder("")}>RAMSport</button>
            {breadcrumbs.map((segment, index) => {
              const path = breadcrumbs.slice(0, index + 1).join("/");
              return <span key={path}>/ <button type="button" onClick={() => setFolder(path)}>{segment}</button></span>;
            })}
            {folder && <button type="button" className="save-dialog-up" onClick={() => setFolder(parentPath(folder))} title="Go up one folder" aria-label="Go up one folder">?</button>}
          </nav>

          <div className="save-dialog-folderbar">
            <button type="button" className="save-dialog-newfolder-toggle" onClick={() => { setNewFolderOpen(value => !value); setError(""); }} disabled={!folder || creatingFolder} title={folder ? "Create a folder in this location" : "Choose a project folder first"}>
              <Icons.folder/><span>New folder</span>
            </button>
            {newFolderOpen && <form className="save-dialog-newfolder" onSubmit={event => { event.preventDefault(); void createFolder(); }}>
              <input value={newFolderName} onChange={event => { setNewFolderName(event.target.value); setError(""); }} placeholder="Folder name" disabled={creatingFolder} aria-label="New folder name" autoFocus/>
              <button type="submit" disabled={creatingFolder || !newFolderName.trim()}>{creatingFolder ? "Creating?" : "Create"}</button>
              <button type="button" onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }} disabled={creatingFolder}>Cancel</button>
            </form>}
          </div>

          <div className="save-dialog-list" role="listbox" aria-label="Folders">
            {loading ? <p className="save-dialog-note">Reading workspace folders?</p>
              : <>
                {folders.map(entry => <button type="button" role="option" aria-selected={false} className="save-folder" key={entry.path} onDoubleClick={() => setFolder(entry.path)} onClick={() => setFolder(entry.path)}>
                  <Icons.folder/><span><b>{entry.name}</b><small>{entry.children?.length ?? 0} item{(entry.children?.length ?? 0) === 1 ? "" : "s"}</small></span><Icons.chevron/>
                </button>)}
                {siblingFiles.map(entry => <button type="button" key={entry.path} className={`save-folder file ${fileName === entry.name ? "selected" : ""}`} onClick={() => chooseFile(entry)} title={entry.path}>
                  <Icons.save/><span><b>{entry.name}</b><small>Replace this {KIND_LABEL[kind]} file</small></span>
                </button>)}
                {!folders.length && !siblingFiles.length && <p className="save-dialog-note">{folder ? "This folder has no sub-folders or files yet." : "Select a project on the left to save inside it."}</p>}
              </>}
          </div>

          <div className="save-dialog-file">
            <label>File name
              <input ref={nameRef} value={name} onChange={event => { setName(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} placeholder={`Untitled ${KIND_LABEL[kind]}`} disabled={saving}/>
            </label>
            <span className="save-dialog-destination">{targetPath || "Choose a folder above"}</span>
            {existing && <p className="save-dialog-warning">This file already exists and will be replaced.</p>}
            {error && <p className="app-dialog-error" role="alert">{error}</p>}
          </div>
        </div>
      </div>

      <footer className="app-dialog-actions">
        <button type="button" className="app-dialog-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="app-dialog-confirm" onClick={() => void save()} disabled={saving || !folder || !fileName}>{saving ? "Saving?" : "Save"}</button>
      </footer>
    </section>
  </div>;
}
