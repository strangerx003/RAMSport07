"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { File, FileChartLine, FileCode, FileJson, FileSpreadsheet, FileText, Folder, FolderOpen, LayoutGrid, List, Microchip, PanelRight, PanelRightClose } from "lucide-react";
import { Icons } from "@/lib/icons";
import { documentHref } from "@/lib/document-context";
import { formatBytes, formatModified } from "@/lib/format";
import { isDiagramState, isFmecaDocument, isMil217fDocument, isWeibullDocument } from "@/data/workspace";
import type { FmecaDocument, Mil217fDocument } from "@/data/workspace";
import { DOCUMENT_KINDS, documentKindDef, type DocumentKind } from "@/lib/document-kinds";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useAppDialog } from "@/components/ui/app-dialog";
import FileBrowser, { type BrowserView } from "./FileBrowser";
import DiagramPreview from "./DiagramPreview";
import { findEntry, flattenEntries, isFolderEntry, parentPath, remapPath, TYPE_LABELS, type FileEntry } from "./file-types";

type StorageStats = { projects: number; files: number; bytes: number };
type FilesPayload = { entries: FileEntry[]; recent: FileEntry[]; stats: StorageStats };
type MutationResult = { ok?: boolean; relativePath?: string; error?: string };
type SortMode = "name" | "modified" | "type";
type Place = "browse" | "recent";
type FilePreviewState = { path: string; loading: boolean; data: unknown; size: number | null; error: string };
type EditingState = { path: string; originalName: string; value: string; selectBase: boolean };
type HistoryState = { stack: string[]; index: number };

const EMPTY_STATS: StorageStats = { projects: 0, files: 0, bytes: 0 };

/** Preview pane sizing, matching a Windows Explorer-style reading pane. */
const PREVIEW_MIN = 260;
const PREVIEW_MAX = 560;
const PREVIEW_DEFAULT = 340;

function sortEntries(entries: FileEntry[], sort: SortMode) {
  return [...entries].sort((first, second) => {
    const firstFolder = isFolderEntry(first);
    const secondFolder = isFolderEntry(second);
    if (firstFolder !== secondFolder) return firstFolder ? -1 : 1;
    if (sort === "modified") return second.modified.localeCompare(first.modified);
    if (sort === "type") return (first.type + first.name).localeCompare(second.type + second.name, undefined, { sensitivity: "base" });
    return first.name.localeCompare(second.name, undefined, { sensitivity: "base", numeric: true });
  });
}

function totalBytes(entries: FileEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.size ?? 0) + (entry.children ? totalBytes(entry.children) : 0), 0);
}

async function readPayload<T>(response: Response) {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The server workspace could not be updated.");
  return data;
}

function entryIcon(type: FileEntry["type"]) {
  if (type === "rbd") return <FileCode aria-hidden="true"/>;
  if (type === "fta") return <FileText aria-hidden="true"/>;
  if (type === "data") return <FileJson aria-hidden="true"/>;
  if (type === "weibull") return <FileChartLine aria-hidden="true"/>;
  if (type === "mil217f") return <Microchip aria-hidden="true"/>;
  if (type === "fmeca") return <FileSpreadsheet aria-hidden="true"/>;
  if (type === "lccpm" || type === "lcccm") return <FileChartLine aria-hidden="true"/>;
  if (type === "spares") return <FileSpreadsheet aria-hidden="true"/>;
  if (type === "project" || type === "folder") return <Folder aria-hidden="true"/>;
  return <File aria-hidden="true"/>;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "?";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} items` : "?";
  return String(value).slice(0, 48);
}

function previewTable(rows: unknown[]) {
  const objects = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  const keys = Object.keys(objects[0] ?? {}).slice(0, 4);
  if (!keys.length) return <p className="file-preview-note">This file has no readable records.</p>;
  const shown = objects.slice(0, 5);
  const hidden = objects.length - shown.length;
  return (
    <div className="file-preview-table-wrap">
      <table className="file-preview-table">
        <thead><tr>{keys.map(key => <th key={key} scope="col">{key}</th>)}</tr></thead>
        <tbody>{shown.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{keys.map(key => <td key={key}>{formatCell(row[key])}</td>)}</tr>)}</tbody>
      </table>
      {hidden > 0 && <p className="file-preview-note">+ {hidden} more record{hidden === 1 ? "" : "s"} ? open the file to see everything.</p>}
    </div>
  );
}

function weibullPreview(points: { time: number; quantity: number; suspended: boolean }[]) {
  if (!points.length) return <p className="file-preview-note">No life data recorded yet. Open the file to add failure and suspension times.</p>;
  const shown = points.slice(0, 5);
  const hidden = points.length - shown.length;
  return (
    <div className="file-preview-table-wrap">
      <table className="file-preview-table">
        <thead><tr><th scope="col">Time</th><th scope="col">Qty</th><th scope="col">Status</th></tr></thead>
        <tbody>{shown.map((point, index) => (
          <tr key={`wbl-${index}`}>
            <td>{formatCell(point.time)}</td>
            <td>{formatCell(point.quantity)}</td>
            <td>{point.suspended ? "Suspended" : "Failure"}</td>
          </tr>
        ))}</tbody>
      </table>
      {hidden > 0 && <p className="file-preview-note">+ {hidden} more record{hidden === 1 ? "" : "s"} ? open the file to see everything.</p>}
    </div>
  );
}

function mil217fPreview(document: Mil217fDocument) {
  const parts = document.parts;
  if (!parts.length) return <p className="file-preview-note">No parts recorded yet. Open the file to import the Data Register or add parts.</p>;
  const shown = parts.slice(0, 6);
  const hidden = parts.length - shown.length;
  return (
    <div className="file-preview-table-wrap">
      <table className="file-preview-table">
        <thead><tr><th scope="col">Ref</th><th scope="col">Model</th><th scope="col">Qty</th></tr></thead>
        <tbody>{shown.map((part, index) => (
          <tr key={`217f-${index}`}>
            <td>{formatCell(part.reference)}</td>
            <td>{formatCell(part.modelId)}</td>
            <td>{formatCell(part.quantity)}</td>
          </tr>
        ))}</tbody>
      </table>
      {hidden > 0 && <p className="file-preview-note">+ {hidden} more part{hidden === 1 ? "" : "s"} ? open the file to see everything.</p>}
    </div>
  );
}

function fmecaPreview(document: FmecaDocument) {
  const items = document.items;
  if (!items.length) return <p className="file-preview-note">No items recorded yet. Open the file to import the Data Register or add items.</p>;
  const shown = items.slice(0, 6);
  const hidden = items.length - shown.length;
  return (
    <div className="file-preview-table-wrap">
      <table className="file-preview-table">
        <thead><tr><th scope="col">Reference</th><th scope="col">Item</th><th scope="col">Modes</th></tr></thead>
        <tbody>{shown.map((item, index) => (
          <tr key={`fmeca-${index}`}>
            <td>{formatCell(item.reference)}</td>
            <td>{formatCell(item.item)}</td>
            <td>{formatCell(item.modes.length)}</td>
          </tr>
        ))}</tbody>
      </table>
      {hidden > 0 && <p className="file-preview-note">+ {hidden} more item{hidden === 1 ? "" : "s"} ? open the file to see everything.</p>}
    </div>
  );
}

function truncateJson(value: string, max = 1600) {
  return value.length > max ? `${value.slice(0, max)}\n?` : value;
}

export default function FileManager() {
  const router = useRouter();
  const dialog = useAppDialog();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [recent, setRecent] = useState<FileEntry[]>([]);
  const [stats, setStats] = useState<StorageStats>(EMPTY_STATS);
  const [history, setHistory] = useState<HistoryState>({ stack: [""], index: 0 });
  const [place, setPlace] = useState<Place>("browse");
  const [sort, setSort] = useState<SortMode>("name");
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreviewState>({ path: "", loading: false, data: null, size: null, error: "" });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [view, setView] = useState<BrowserView>("details");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(340);
  const [resizing, setResizing] = useState(false);
  const editingRef = useRef<EditingState | null>(null);
  const commitLock = useRef(false);
  const folderParamApplied = useRef(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const shortcutRef = useRef<{ createFolder: () => void }>({ createFolder: () => {} });

  const currentFolder = history.stack[history.index] ?? "";

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const resetView = useCallback(() => {
    setPlace("browse");
    setQuery("");
    setSelectedPath("");
    setEditing(null);
  }, []);

  /** Open a folder, keeping an Explorer-like back/forward history. */
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    setHistory(previous => {
      if (previous.stack[previous.index] === path) return previous;
      if (options?.replace) {
        const stack = [...previous.stack];
        stack[previous.index] = path;
        return { stack, index: previous.index };
      }
      const stack = [...previous.stack.slice(0, previous.index + 1), path];
      return { stack, index: stack.length - 1 };
    });
    resetView();
  }, [resetView]);

  const goBack = useCallback(() => {
    setHistory(previous => previous.index > 0 ? { ...previous, index: previous.index - 1 } : previous);
    resetView();
  }, [resetView]);

  const goForward = useCallback(() => {
    setHistory(previous => previous.index < previous.stack.length - 1 ? { ...previous, index: previous.index + 1 } : previous);
    resetView();
  }, [resetView]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/files", { cache: "no-store", signal });
      const data = await readPayload<Partial<FilesPayload>>(response);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setRecent(Array.isArray(data.recent) ? data.recent : []);
      setStats(data.stats ?? EMPTY_STATS);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "The server workspace could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Explorer-style shortcuts: F5 refreshes, Alt+P toggles the preview pane and
  // Ctrl+Shift+N creates a folder in the open folder.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "F5") {
        event.preventDefault();
        void load();
        return;
      }
      if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPreviewOpen(previous => !previous);
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        shortcutRef.current.createFolder();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [load]);

  // Deep link: /files?folder=Project/Sub opens that folder once the tree loads.
  useEffect(() => {
    if (loading || folderParamApplied.current) return;
    folderParamApplied.current = true;
    const folder = new URLSearchParams(window.location.search).get("folder");
    if (!folder) return;
    const path = folder.split("/").filter(Boolean).join("/");
    if (path && findEntry(entries, path)) navigate(path, { replace: true });
  }, [entries, loading, navigate]);

  // The open folder can disappear after a delete or rename; fall back to root.
  useEffect(() => {
    if (loading || !currentFolder) return;
    if (!findEntry(entries, currentFolder)) navigate("", { replace: true });
  }, [currentFolder, entries, loading, navigate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const searchTerm = query.trim();
  const searching = Boolean(searchTerm);
  const projects = useMemo(() => entries.filter(entry => entry.type === "project"), [entries]);
  const currentEntry = useMemo(() => currentFolder ? findEntry(entries, currentFolder) : null, [currentFolder, entries]);
  const children = useMemo(() => currentEntry ? currentEntry.children ?? [] : entries, [currentEntry, entries]);
  const sortedChildren = useMemo(() => sortEntries(children, sort), [children, sort]);
  const sortedRecent = useMemo(() => sortEntries(recent, sort), [recent, sort]);
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const needle = searchTerm.toLowerCase();
    return sortEntries(
      flattenEntries(entries).filter(entry => `${entry.name} ${entry.path}`.toLowerCase().includes(needle)),
      sort,
    );
  }, [entries, searching, searchTerm, sort]);
  const displayEntries = searching ? searchResults : place === "recent" ? sortedRecent : sortedChildren;
  const showPath = searching || place === "recent";
  const selectedEntry = useMemo(() => selectedPath ? findEntry(entries, selectedPath) : null, [entries, selectedPath]);
  const selectedFilePath = selectedEntry && !isFolderEntry(selectedEntry) ? selectedEntry.path : "";
  const breadcrumb = currentFolder.split("/").filter(Boolean);
  const folderCount = children.filter(isFolderEntry).length;
  const fileCount = children.length - folderCount;
  const canGoBack = history.index > 0;
  const canGoForward = history.index < history.stack.length - 1;

  useEffect(() => {
    if (!selectedFilePath) return;
    const controller = new AbortController();
    let active = true;
    setFilePreview({ path: selectedFilePath, loading: true, data: null, size: null, error: "" });
    void (async () => {
      try {
        const response = await fetch(`/api/files/content?path=${encodeURIComponent(selectedFilePath)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: unknown; size?: number; error?: string };
        if (!response.ok) throw new Error(payload.error || "This file could not be previewed.");
        if (active) setFilePreview({ path: selectedFilePath, loading: false, data: payload.data ?? null, size: typeof payload.size === "number" ? payload.size : null, error: "" });
      } catch (reason) {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setFilePreview({ path: selectedFilePath, loading: false, data: null, size: null, error: reason instanceof Error ? reason.message : "This file could not be previewed." });
        }
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [selectedFilePath, entries]);

  async function mutate(request: () => Promise<Response>, message: string) {
    setBusy(true);
    setError("");
    try {
      const result = await readPayload<MutationResult>(await request());
      setNotice(message);
      await load();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The server workspace could not be updated.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function siblingsOf(parent: string): FileEntry[] {
    if (!parent) return entries;
    return findEntry(entries, parent)?.children ?? [];
  }

  function uniqueName(parent: string, base: string, extension = "") {
    const taken = new Set(siblingsOf(parent).map(entry => entry.name.toLocaleLowerCase()));
    let candidate = `${base}${extension}`;
    for (let index = 2; taken.has(candidate.toLocaleLowerCase()); index += 1) {
      candidate = `${base} (${index})${extension}`;
    }
    return candidate;
  }

  function beginEditing(path: string, originalName: string, selectBase: boolean) {
    const next: EditingState = { path, originalName, value: originalName, selectBase };
    editingRef.current = next;
    setEditing(next);
  }

  function updateEditingValue(value: string) {
    setEditing(previous => {
      if (!previous) return previous;
      const next = { ...previous, value };
      editingRef.current = next;
      return next;
    });
  }

  function cancelEditing() {
    setEditing(null);
  }

  /**
   * Explorer-style creation: the entry is created with a unique default name
   * ("New folder", "New RBD (2)", ?) and its name becomes an inline text field
   * in the browser. No modal is shown.
   */
  async function createProjectInline() {
    const name = uniqueName("", "New project");
    const result = await mutate(
      () => fetch("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-project", name }) }),
      `${name} created.`,
    );
    if (!result?.relativePath) return;
    navigate("");
    setSelectedPath(result.relativePath);
    beginEditing(result.relativePath, name, false);
  }

  async function createFolderInline(parent = currentFolder) {
    if (!parent) {
      setError("Open a project or folder first, then create a folder inside it.");
      return;
    }
    const name = uniqueName(parent, "New folder");
    const result = await mutate(
      () => fetch("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-folder", parent, name }) }),
      `${name} created.`,
    );
    if (!result?.relativePath) return;
    if (parent !== currentFolder) navigate(parent);
    setSelectedPath(result.relativePath);
    beginEditing(result.relativePath, name, false);
  }

  async function createDocumentInline(kind: DocumentKind, parent = currentFolder) {
    if (!parent) {
      setError("Open a project or folder first, then create a document inside it.");
      return;
    }
    const definition = documentKindDef(kind);
    const base = `New ${definition.shortLabel}`;
    const fileName = uniqueName(parent, base, definition.extension);
    const result = await mutate(
      () => fetch("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-document", parent, name: fileName, kind }) }),
      `${fileName} created.`,
    );
    if (!result?.relativePath) return;
    if (parent !== currentFolder) navigate(parent);
    setSelectedPath(result.relativePath);
    beginEditing(result.relativePath, fileName, true);
  }

  function beginRename(entry: FileEntry) {
    const parent = parentPath(entry.path);
    if (searching || place !== "browse" || parent !== currentFolder) navigate(parent);
    setSelectedPath(entry.path);
    beginEditing(entry.path, entry.name, !isFolderEntry(entry));
  }

  function beginRenameCurrentFolder() {
    if (!currentEntry) return;
    const target = currentEntry;
    navigate(parentPath(target.path));
    setSelectedPath(target.path);
    beginEditing(target.path, target.name, false);
  }

  async function commitEditing(rawValue: string) {
    const current = editingRef.current;
    if (!current || commitLock.current) return;
    const name = rawValue.trim();
    if (!name || name === current.originalName) {
      setEditing(null);
      return;
    }
    commitLock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/files", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: current.path, name }),
      });
      const result = await readPayload<MutationResult>(response);
      const nextPath = result.relativePath || current.path;
      setEditing(null);
      setNotice(`${current.originalName} renamed to ${name}.`);
      await load();
      setHistory(previous => ({
        ...previous,
        stack: previous.stack.map(value => remapPath(value, current.path, nextPath)),
      }));
      setSelectedPath(value => remapPath(value, current.path, nextPath));
    } catch (reason) {
      // Keep the field open so a duplicate or invalid name can be corrected.
      setError(reason instanceof Error ? reason.message : "That name could not be saved.");
    } finally {
      commitLock.current = false;
      setBusy(false);
    }
  }

  async function removeEntry(entry: FileEntry) {
    const message = isFolderEntry(entry)
      ? `${entry.name} and everything inside it will be removed from the workspace. This cannot be undone.`
      : `${entry.name} will be removed from the server workspace. This cannot be undone.`;
    const confirmed = await dialog.confirm({
      title: `Delete ${entry.name}?`,
      message,
      confirmLabel: isFolderEntry(entry) ? "Delete folder" : "Delete file",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await mutate(
      () => fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" }),
      `${entry.name} deleted.`,
    );
    if (!result) return;
    const insideDeleted = currentFolder === entry.path || currentFolder.startsWith(`${entry.path}/`);
    const nextFolder = parentPath(entry.path);
    setHistory(previous => ({
      ...previous,
      stack: previous.stack.map(value => (value === entry.path || value.startsWith(`${entry.path}/`)) ? nextFolder : value),
    }));
    if (insideDeleted) navigate(nextFolder, { replace: true });
    setSelectedPath(value => (value === entry.path || value.startsWith(`${entry.path}/`)) ? "" : value);
  }

  function activateEntry(entry: FileEntry) {
    if (isFolderEntry(entry)) {
      navigate(entry.path);
      return;
    }
    const href = documentHref(entry.path);
    if (!href) {
      setError("This file type cannot be opened in a RAMS workbench.");
      return;
    }
    router.push(href);
  }

  function selectEntry(entry: FileEntry) {
    setSelectedPath(entry.path);
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    window.requestAnimationFrame(() => {
      document.querySelector(".file-preview")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function goUp() {
    if (!currentFolder) return;
    navigate(parentPath(currentFolder));
  }

  function jumpTo(path: string) {
    navigate(path);
  }

  // Keep the Ctrl+Shift+N shortcut bound to the folder that is open now.
  shortcutRef.current.createFolder = () => void createFolderInline();

  /** Drag the divider to resize the preview pane, as in Windows Explorer. */
  function startPreviewResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    const right = shell.getBoundingClientRect().right;
    setResizing(true);
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (moveEvent: PointerEvent) => {
      const next = right - moveEvent.clientX;
      setPreviewWidth(Math.round(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, next))));
    };
    const stop = () => {
      setResizing(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizePreviewByKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPreviewWidth(width => Math.min(PREVIEW_MAX, width + 24));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPreviewWidth(width => Math.max(PREVIEW_MIN, width - 24));
    } else if (event.key === "Home") {
      event.preventDefault();
      setPreviewWidth(PREVIEW_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      setPreviewWidth(PREVIEW_MAX);
    }
  }

  const title = searching ? "Search results" : place === "recent" ? "Recent files" : currentEntry?.name ?? "All files";
  const subtitle = searching
    ? `${displayEntries.length} item${displayEntries.length === 1 ? "" : "s"} matching ?${searchTerm}?`
    : place === "recent"
      ? `${displayEntries.length} recently opened document${displayEntries.length === 1 ? "" : "s"}`
      : currentEntry
        ? `${folderCount} folder${folderCount === 1 ? "" : "s"} ? ${fileCount} file${fileCount === 1 ? "" : "s"} in this folder`
        : `${projects.length} project${projects.length === 1 ? "" : "s"} ? ${stats.files} file${stats.files === 1 ? "" : "s"} in the workspace`;

  // --- Right-hand preview pane ------------------------------------------------
  const previewEntry = selectedEntry;
  const overviewEntry = previewEntry && isFolderEntry(previewEntry) ? previewEntry : !previewEntry ? currentEntry : null;
  const overviewChildren = overviewEntry ? overviewEntry.children ?? [] : entries;
  const previewChildren = overviewChildren;
  const previewSize = previewEntry && filePreview.path === previewEntry.path && filePreview.size !== null ? filePreview.size : previewEntry?.size ?? 0;
  const diagram = previewEntry && (previewEntry.type === "rbd" || previewEntry.type === "fta")
    && filePreview.path === previewEntry.path && isDiagramState(filePreview.data)
    ? { kind: previewEntry.type, state: filePreview.data }
    : null;

  const previewContent = !previewEntry || isFolderEntry(previewEntry) ? null
    : filePreview.path !== previewEntry.path || filePreview.loading
      ? <p className="file-preview-note">Loading preview?</p>
      : filePreview.error
        ? <p className="file-preview-note file-preview-warning">{filePreview.error}</p>
        : diagram
          ? <>
              {diagram.state.nodes.length > 0 && <p className="file-preview-note">Read-only preview ? {diagram.state.nodes.length} block{diagram.state.nodes.length === 1 ? "" : "s"} ? {diagram.state.edges.length} connection{diagram.state.edges.length === 1 ? "" : "s"}</p>}
              <DiagramPreview kind={diagram.kind} state={diagram.state}/>
            </>
          : previewEntry.type === "weibull" && filePreview.path === previewEntry.path && isWeibullDocument(filePreview.data)
            ? <>
                <p className="file-preview-note">
                  Weibull life-data document ? {filePreview.data.points.length} record{filePreview.data.points.length === 1 ? "" : "s"} ? {filePreview.data.options.method.toUpperCase()} ? {filePreview.data.options.regression === "y-on-x" ? "Y on X" : "X on Y"}{filePreview.data.options.threeParameter ? " ? 3-parameter" : ""}
                </p>
                {weibullPreview(filePreview.data.points)}
              </>
          : previewEntry.type === "mil217f" && filePreview.path === previewEntry.path && isMil217fDocument(filePreview.data)
            ? <>
                <p className="file-preview-note">
                  MIL-HDBK-217F prediction ? {filePreview.data.parts.length} part{filePreview.data.parts.length === 1 ? "" : "s"} ? {filePreview.data.options.method === "count" ? "Parts count" : "Parts stress"} ? {filePreview.data.options.environment}
                </p>
                {mil217fPreview(filePreview.data)}
              </>
          : previewEntry.type === "fmeca" && filePreview.path === previewEntry.path && isFmecaDocument(filePreview.data)
            ? <>
                <p className="file-preview-note">
                  MIL-STD-1629A {filePreview.data.mode === "fmeca" ? "FMECA" : "FMEA"} worksheet ? {filePreview.data.items.length} item{filePreview.data.items.length === 1 ? "" : "s"}
                </p>
                {fmecaPreview(filePreview.data)}
              </>
          : Array.isArray(filePreview.data)
            ? <>
                <p className="file-preview-note">{filePreview.data.length} record{filePreview.data.length === 1 ? "" : "s"} in this file.</p>
                {previewTable(filePreview.data)}
              </>
            : filePreview.data !== null && typeof filePreview.data === "object"
              ? <pre className="file-preview-pre">{truncateJson(JSON.stringify(filePreview.data, null, 2))}</pre>
              : <p className="file-preview-note">No preview is available for this file.</p>;

  const overviewNode = <>
    <header className="file-preview-head">
      <span className={`file-preview-icon ${overviewEntry?.type ?? "project"}`}>{overviewEntry ? entryIcon(overviewEntry.type) : <Icons.grid aria-hidden="true"/>}</span>
      <div className="file-preview-title">
        <h3>{overviewEntry?.name ?? "All files"}</h3>
        <p>{overviewEntry ? `${TYPE_LABELS[overviewEntry.type]} ? ${overviewEntry.path}` : "Workspace root"}</p>
      </div>
    </header>
    <div className="file-preview-body">
      <div className="file-preview-meta">
        <span>Location <b>{overviewEntry ? parentPath(overviewEntry.path) || "Workspace root" : "Workspace root"}</b></span>
        <span>Contains <b>{previewChildren.length} item{previewChildren.length === 1 ? "" : "s"}</b></span>
        {overviewEntry && <span>Modified <b>{formatModified(overviewEntry.modified)}</b></span>}
        <span>Size <b>{formatBytes(totalBytes(previewChildren))}</b></span>
      </div>
      {previewChildren.length ? <>
        <p className="file-preview-note">{overviewEntry ? "Folder contents" : "Projects in this workspace"}</p>
        <div className="file-preview-list">
          {previewChildren.slice(0, 14).map(child => <button key={child.path} type="button" onClick={() => isFolderEntry(child) ? jumpTo(child.path) : selectEntry(child)} title={child.path}>
            <span className={`file-preview-icon ${child.type}`}>{entryIcon(child.type)}</span>
            <span className="file-preview-name">{child.name}</span>
            <small>{isFolderEntry(child) ? `${child.children?.length ?? 0} item${(child.children?.length ?? 0) === 1 ? "" : "s"}` : formatBytes(child.size)}</small>
          </button>)}
        </div>
        {previewChildren.length > 14 && <p className="file-preview-note">+ {previewChildren.length - 14} more item{previewChildren.length - 14 === 1 ? "" : "s"} in the browser.</p>}
      </> : <p className="file-preview-note">{overviewEntry ? "This folder is empty. Use New folder or New document to add something." : "No projects yet. Create your first project to start building a RAMS workspace."}</p>}
    </div>
  </>;

  const previewNode = previewEntry && !isFolderEntry(previewEntry) ? <>
    <header className="file-preview-head">
      <span className={`file-preview-icon ${previewEntry.type}`}>{entryIcon(previewEntry.type)}</span>
      <div className="file-preview-title">
        <h3>{previewEntry.name}</h3>
        <p>{TYPE_LABELS[previewEntry.type]} ? {previewEntry.path}</p>
      </div>
    </header>
    <div className="file-preview-body">
      <div className="file-preview-meta">
        <span>Type <b>{TYPE_LABELS[previewEntry.type]}</b></span>
        <span>Size <b>{formatBytes(previewSize)}</b></span>
        <span>Modified <b>{formatModified(previewEntry.modified)}</b></span>
      </div>
      {previewContent}
    </div>
  </> : overviewNode;

  function emptyState() {
    if (loading) {
      return <div className="fb-loading" aria-label="Opening server workspace">
        {Array.from({ length: 6 }, (_, index) => <span key={index} className="fb-skeleton"/>)}
      </div>;
    }
    if (searching) {
      return <div className="fb-empty">
        <span className="fb-empty-icon"><Icons.search aria-hidden="true"/></span>
        <h3>No matches for ?{searchTerm}?</h3>
        <p>Search covers every project, folder and document name in the workspace.</p>
        <div className="fb-empty-actions"><Button variant="outline" onClick={() => setQuery("")}>Clear search</Button></div>
      </div>;
    }
    if (place === "recent") {
      return <div className="fb-empty">
        <span className="fb-empty-icon"><Icons.clock aria-hidden="true"/></span>
        <h3>No recent files</h3>
        <p>Documents you open from the workbenches appear here.</p>
        <div className="fb-empty-actions"><Button variant="outline" onClick={() => navigate("")}>Browse all files</Button></div>
      </div>;
    }
    if (!currentFolder) {
      return <div className="fb-empty fb-empty-welcome">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Icons.folder aria-hidden="true"/></EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create a project to hold your Data Register, diagrams, analyses and worksheets.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void createProjectInline()}>Create project</Button>
          </EmptyContent>
        </Empty>
      </div>;
    }
    return <div className="fb-empty">
      <span className="fb-empty-icon"><FolderOpen aria-hidden="true"/></span>
      <h3>This folder is empty</h3>
      <p>There is nothing inside ?{currentEntry?.name ?? "this folder"}? yet. Add a subfolder or create a document here.</p>
      <div className="fb-empty-actions">
        <Button onClick={() => void createFolderInline()}><Icons.plus/><span>New folder</span></Button>
        <Button variant="outline" onClick={() => void createDocumentInline("data")}><Icons.file/><span>New document</span></Button>
      </div>
    </div>;
  }

  return <main
    ref={shellRef}
    className={`file-manager fb-shell${previewOpen ? "" : " fb-preview-hidden"}${resizing ? " fb-resizing" : ""}`}
    style={{ "--fb-preview-width": `${previewWidth}px` } as CSSProperties}
    aria-label="RAMSport file manager"
  >
    <header className="file-manager-toolbar fb-toolbar">
      <div className="fb-navigation-row">
        <div className="file-nav fb-nav">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back" title="Back" disabled={!canGoBack || busy}>?</Button>
          <Button variant="ghost" size="icon" onClick={goForward} aria-label="Forward" title="Forward" disabled={!canGoForward || busy}>?</Button>
          <Button variant="ghost" size="icon" onClick={goUp} aria-label="Up one level" title="Up one level" disabled={!currentFolder || busy}>?</Button>
          <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh workspace" title="Refresh workspace" disabled={busy || loading}>?</Button>
        </div>
        <nav className="file-breadcrumb fb-address" aria-label="Folder path">
          <button type="button" className="fb-crumb" onClick={() => navigate("")} title="Home"><Icons.grid aria-hidden="true"/><span>Home</span></button>
          {breadcrumb.map((segment, index) => {
            const path = breadcrumb.slice(0, index + 1).join("/");
            const last = index === breadcrumb.length - 1;
            return <span className="fb-crumb-wrap" key={path}>
              <Icons.chevron className="fb-crumb-sep" aria-hidden="true"/>
              {last
                ? <b className="fb-crumb-current" title={path}>{segment}</b>
                : <button type="button" className="fb-crumb" onClick={() => navigate(path)} title={path}>{segment}</button>}
            </span>;
          })}
          {searching && <span className="fb-crumb-wrap"><Icons.chevron className="fb-crumb-sep" aria-hidden="true"/><b className="fb-crumb-current">Search results</b></span>}
          {place === "recent" && !searching && <span className="fb-crumb-wrap"><Icons.chevron className="fb-crumb-sep" aria-hidden="true"/><b className="fb-crumb-current">Recent</b></span>}
        </nav>
        <label className="file-manager-search"><Icons.search aria-hidden="true"/><input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape") setQuery(""); }}
          placeholder={`Search ${currentEntry?.name ?? "Home"}`}
          aria-label="Search files"
        /></label>
      </div>
      <div className="file-manager-actions fb-actions fb-commandbar">
        <Button variant="outline" onClick={() => void createProjectInline()} disabled={busy} aria-label="New project" title="Create a project"><Icons.plus/><span>New project</span></Button>
        <Button variant="outline" onClick={() => void createFolderInline()} disabled={busy || !currentFolder} aria-label="New folder" title={currentFolder ? `Create a folder inside ${currentEntry?.name ?? currentFolder}` : "Open a project or folder first"}><Icons.folder/><span>New folder</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={busy || !currentFolder} aria-label="New document" title={currentFolder ? `Create a document inside ${currentEntry?.name ?? currentFolder}` : "Open a project or folder first"}><Icons.file/><span>New document</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="file-new-menu">
            <DropdownMenuLabel>New document</DropdownMenuLabel>
            <DropdownMenuSeparator/>
            {DOCUMENT_KINDS.map(definition => <DropdownMenuItem key={definition.kind} onSelect={() => void createDocumentInline(definition.kind)}>
              <span className={`file-new-menu-icon ${definition.kind}`}>{entryIcon(definition.kind)}</span>
              <span className="file-new-menu-text"><b>{definition.label}</b><small>{definition.description}</small></span>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <select className="file-sort" value={sort} onChange={event => setSort(event.target.value as SortMode)} aria-label="Sort files">
          <option value="name">Name</option>
          <option value="modified">Modified</option>
          <option value="type">Type</option>
        </select>
        <Button
          className="fb-view-toggle"
          variant="outline"
          size="icon"
          onClick={() => setView(previous => previous === "details" ? "grid" : "details")}
          aria-label={view === "details" ? "Switch to grid view" : "Switch to details view"}
          aria-pressed={view === "grid"}
          title={view === "details" ? "Grid view" : "Details view"}
        >{view === "details" ? <LayoutGrid/> : <List/>}</Button>
        <Button
          className="fb-preview-toggle"
          variant={previewOpen ? "secondary" : "outline"}
          size="icon"
          onClick={() => setPreviewOpen(previous => !previous)}
          aria-label={previewOpen ? "Hide preview pane" : "Show preview pane"}
          aria-pressed={previewOpen}
          title={previewOpen ? "Hide preview pane (Alt+P)" : "Show preview pane (Alt+P)"}
        >{previewOpen ? <PanelRightClose/> : <PanelRight/>}</Button>
        <span className="fb-command-status"><Icons.shield aria-hidden="true"/> Server workspace</span>
      </div>
    </header>

    <section className="file-manager-body fb-body">
      <aside className="fb-sidebar">
        <div className="fb-side-block">
          <p className="fb-side-title">Places</p>
          <button type="button" className={!searching && place === "browse" && !currentFolder ? "fb-side-link active" : "fb-side-link"} onClick={() => navigate("")}><Icons.grid aria-hidden="true"/><span>Home</span><em>{entries.length}</em></button>
          <button type="button" className={!searching && place === "recent" ? "fb-side-link active" : "fb-side-link"} onClick={() => { setPlace("recent"); setQuery(""); setSelectedPath(""); setEditing(null); }}><Icons.clock aria-hidden="true"/><span>Recent</span><em>{recent.length}</em></button>
        </div>
        <div className="fb-side-block fb-side-projects">
          <p className="fb-side-title">Projects</p>
          {projects.map(project => <button
            type="button"
            key={project.path}
            className={currentFolder === project.path || currentFolder.startsWith(`${project.path}/`) ? "fb-side-link active" : "fb-side-link"}
            onClick={() => jumpTo(project.path)}
            title={project.path}
          ><Icons.folder aria-hidden="true"/><span>{project.name}</span><em>{project.children?.length ?? 0}</em></button>)}
          {!projects.length && !loading && <button type="button" className="fb-side-link fb-side-create" onClick={() => void createProjectInline()}><Icons.plus aria-hidden="true"/><span>New project</span></button>}
        </div>
        <div className="fb-storage">
          <span className="fb-storage-icon"><Icons.shield aria-hidden="true"/></span>
          <div>
            <strong>Server workspace</strong>
            <small>{stats.projects} project{stats.projects === 1 ? "" : "s"} ? {stats.files} file{stats.files === 1 ? "" : "s"}</small>
            <small>{formatBytes(stats.bytes)} stored on the server</small>
          </div>
        </div>
      </aside>

      <div className="fb-main">
        <header className="fb-folder-band">
          <span className={`fb-band-icon ${searching ? "search" : place === "recent" ? "recent" : currentEntry?.type ?? "project"}`}>
            {searching ? <Icons.search aria-hidden="true"/> : place === "recent" ? <Icons.clock aria-hidden="true"/> : currentEntry ? entryIcon(currentEntry.type) : <Icons.grid aria-hidden="true"/>}
          </span>
          <div className="fb-band-text">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="fb-band-chips">
            {!searching && place === "browse" && <>
              <span className="fb-chip"><b>{folderCount}</b> folder{folderCount === 1 ? "" : "s"}</span>
              <span className="fb-chip"><b>{fileCount}</b> file{fileCount === 1 ? "" : "s"}</span>
              <span className="fb-chip"><b>{formatBytes(totalBytes(children))}</b> total</span>
            </>}
            {searching && <span className="fb-chip"><b>{displayEntries.length}</b> match{displayEntries.length === 1 ? "" : "es"}</span>}
            {place === "recent" && !searching && <span className="fb-chip"><b>{displayEntries.length}</b> recent</span>}
          </div>
          {currentEntry && place === "browse" && !searching && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Folder actions" title="Folder actions" disabled={busy}><Icons.more/></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{currentEntry.name}</DropdownMenuLabel>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={beginRenameCurrentFolder}>Rename folder</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void createFolderInline(currentEntry.path)}>New folder</DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={() => void removeEntry(currentEntry)}>Delete folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </header>

        {error && <div className="file-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">?</button></div>}

        {!loading && displayEntries.length > 0 && view === "details" && <div className="fb-columns" aria-hidden="true">
          <span>Name</span>
          <span className="fb-col-type">Type</span>
          <span className="fb-col-modified">Modified</span>
          <span className="fb-col-size">Size</span>
        </div>}

        <div className="fb-scroll">
          {displayEntries.length
            ? <FileBrowser
                entries={displayEntries}
                selectedPath={selectedPath}
                editing={editing}
                onSelect={selectEntry}
                onOpen={activateEntry}
                onRename={beginRename}
                onDelete={entry => void removeEntry(entry)}
                onCreateFolder={entry => void createFolderInline(entry.path)}
                onCreateFile={(entry, kind) => void createDocumentInline(kind, entry.path)}
                onEditingChange={updateEditingValue}
                onEditingCommit={value => void commitEditing(value)}
                onEditingCancel={cancelEditing}
                onNavigateUp={goUp}
                showPath={showPath}
                view={view}
              />
            : emptyState()}
        </div>

        <footer className="fb-status">
          <span>{stats.projects} project{stats.projects === 1 ? "" : "s"} ? {stats.files} file{stats.files === 1 ? "" : "s"} ? {formatBytes(stats.bytes)}</span>
          <span>{busy ? "Saving?" : notice || (searching ? "Searching every project in the workspace" : "Click a folder to open it ? Enter opens ? Right-click for actions")}</span>
        </footer>
      </div>

      {previewOpen && <section className="file-preview fb-preview" aria-label="Selected file preview">
        <div
          className="fb-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview pane"
          aria-valuemin={PREVIEW_MIN}
          aria-valuemax={PREVIEW_MAX}
          aria-valuenow={previewWidth}
          tabIndex={0}
          onPointerDown={startPreviewResize}
          onKeyDown={resizePreviewByKeyboard}
          onDoubleClick={() => setPreviewWidth(PREVIEW_DEFAULT)}
          title="Drag to resize ? double-click to reset"
        />
        <button type="button" className="fb-preview-close" onClick={() => setPreviewOpen(false)} aria-label="Hide preview pane" title="Hide preview pane (Alt+P)">?</button>
        {previewNode}
      </section>}
    </section>
  </main>;
}
