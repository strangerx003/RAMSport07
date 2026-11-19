"use client";

import * as React from "react";
import { ChevronRight, File, FileChartLine, FileCode, FileJson, FileSpreadsheet, FileText, Folder, FolderOpen, Microchip } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, formatModified } from "@/lib/format";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/document-kinds";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import { isFolderEntry, parentPath, TYPE_SHORT_LABELS, type FileEntry } from "./file-types";

export type BrowserView = "details" | "grid";

type FileBrowserProps = {
  entries: FileEntry[];
  selectedPath: string;
  /** Row whose name is currently being edited inline, like Windows Explorer. */
  editing: { path: string; value: string; selectBase: boolean } | null;
  onSelect: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onCreateFolder: (parent: FileEntry) => void;
  onCreateFile: (parent: FileEntry, kind: DocumentKind) => void;
  onEditingChange: (value: string) => void;
  onEditingCommit: (value: string) => void;
  onEditingCancel: () => void;
  /** Backspace / Alt+ArrowUp move to the containing folder. */
  onNavigateUp?: () => void;
  /** Show the containing folder under the name (search results, recent files). */
  showPath?: boolean;
  /** Details (rows) or large-icon grid, as in Windows Explorer. */
  view?: BrowserView;
};

function entryIcon(entry: FileEntry) {
  if (isFolderEntry(entry)) {
    const FolderGlyph = entry.type === "project" ? Folder : FolderOpen;
    return <FolderGlyph aria-hidden="true"/>;
  }
  if (entry.type === "rbd") return <FileCode aria-hidden="true"/>;
  if (entry.type === "fta") return <FileText aria-hidden="true"/>;
  if (entry.type === "data") return <FileJson aria-hidden="true"/>;
  if (entry.type === "weibull") return <FileChartLine aria-hidden="true"/>;
  if (entry.type === "mil217f") return <Microchip aria-hidden="true"/>;
  if (entry.type === "fmeca") return <FileSpreadsheet aria-hidden="true"/>;
  return <File aria-hidden="true"/>;
}

function detailCell(entry: FileEntry) {
  if (isFolderEntry(entry)) {
    const count = entry.children?.length ?? 0;
    return `${count} item${count === 1 ? "" : "s"}`;
  }
  return formatBytes(entry.size);
}

export default function FileBrowser({
  entries,
  selectedPath,
  editing,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onCreateFolder,
  onCreateFile,
  onEditingChange,
  onEditingCommit,
  onEditingCancel,
  onNavigateUp,
  showPath = false,
  view = "details",
}: FileBrowserProps) {
  const [focusedPath, setFocusedPath] = React.useState(selectedPath || entries[0]?.path || "");
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = React.useRef<string | null>(null);
  const editInputRef = React.useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = React.useRef(false);
  const editingPath = editing?.path ?? "";

  React.useEffect(() => {
    if (selectedPath) setFocusedPath(selectedPath);
  }, [selectedPath]);

  // Keep the roving focus inside the current listing when rows change.
  React.useEffect(() => {
    if (entries.some(entry => entry.path === focusedPath)) return;
    const next = selectedPath && entries.some(entry => entry.path === selectedPath)
      ? selectedPath
      : entries[0]?.path ?? "";
    setFocusedPath(next);
  }, [entries, focusedPath, selectedPath]);

  // Focus the inline name field and preselect the base name (not the extension,
  // as Windows Explorer does) whenever a new row enters rename mode.
  React.useEffect(() => {
    if (!editingPath) return;
    const input = editInputRef.current;
    if (!input) return;
    skipBlurCommitRef.current = false;
    input.focus({ preventScroll: true });
    const dot = input.value.lastIndexOf(".");
    const end = editing?.selectBase && dot > 0 ? dot : input.value.length;
    input.setSelectionRange(0, end);
    // Only re-run when the edited row changes; typing must not reset the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPath]);

  // After inline naming ends the field unmounts and focus falls back to the
  // page. Put it back on the (possibly renamed) row so keyboard use continues.
  const wasEditingRef = React.useRef(false);
  React.useEffect(() => {
    if (editingPath) { wasEditingRef.current = true; return; }
    if (!wasEditingRef.current) return;
    wasEditingRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const target = rowRefs.current.get(selectedPath) ?? rowRefs.current.get(focusedPath);
      if (target && (!document.activeElement || document.activeElement === document.body)) target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingPath, selectedPath, focusedPath]);

  React.useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const button = rowRefs.current.get(target);
    if (!button) return;
    pendingFocusRef.current = null;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  }, [focusedPath, entries]);

  React.useEffect(() => {
    if (!selectedPath) return;
    const frame = window.requestAnimationFrame(() => {
      rowRefs.current.get(selectedPath)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPath, entries.length]);

  function focusRow(path: string) {
    if (focusedPath === path) {
      rowRefs.current.get(path)?.focus({ preventScroll: true });
      return;
    }
    pendingFocusRef.current = path;
    setFocusedPath(path);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, entry: FileEntry) {
    const index = entries.findIndex(item => item.path === entry.path);
    if (index === -1) return;

    if (event.key === "ArrowDown" || (view === "grid" && event.key === "ArrowRight")) {
      event.preventDefault();
      const next = entries[index + 1];
      if (next) focusRow(next.path);
      return;
    }

    if (event.key === "ArrowUp" || (view === "grid" && event.key === "ArrowLeft")) {
      event.preventDefault();
      const previous = entries[index - 1];
      if (previous) focusRow(previous.path);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (entries[0]) focusRow(entries[0].path);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const last = entries.at(-1);
      if (last) focusRow(last.path);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onOpen(entry);
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      onRename(entry);
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      onDelete(entry);
      return;
    }

    if (event.key === "Backspace" || (event.altKey && event.key === "ArrowUp")) {
      if (!onNavigateUp) return;
      event.preventDefault();
      onNavigateUp();
    }
  }

  function renderMenu(entry: FileEntry, folder: boolean) {
    return <ContextMenuContent>
      <ContextMenuLabel>{entry.name}</ContextMenuLabel>
      <ContextMenuSeparator/>
      <ContextMenuItem onSelect={() => onOpen(entry)}>{folder ? "Open folder" : "Open document"}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(entry)}>Rename</ContextMenuItem>
      {folder && <ContextMenuSub>
        <ContextMenuSubTrigger>New</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => onCreateFolder(entry)}>Folder</ContextMenuItem>
          <ContextMenuSeparator/>
          {DOCUMENT_KINDS.map(definition => <ContextMenuItem key={definition.kind} onSelect={() => onCreateFile(entry, definition.kind)}>
            {definition.label}
          </ContextMenuItem>)}
        </ContextMenuSubContent>
      </ContextMenuSub>}
      <ContextMenuSeparator/>
      <ContextMenuItem variant="destructive" onSelect={() => onDelete(entry)}>Delete</ContextMenuItem>
    </ContextMenuContent>;
  }

  function renameInput(entry: FileEntry) {
    return <input
      ref={editInputRef}
      className="fb-rename-input"
      value={editing?.value ?? ""}
      aria-label={`Name for ${entry.name}`}
      spellCheck={false}
      autoComplete="off"
      onChange={event => onEditingChange(event.target.value)}
      onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEditingCommit(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          skipBlurCommitRef.current = true;
          onEditingCancel();
        }
      }}
      onBlur={event => {
        if (skipBlurCommitRef.current) { skipBlurCommitRef.current = false; return; }
        onEditingCommit(event.currentTarget.value);
      }}
    />;
  }

  function row(entry: FileEntry, index: number) {
    const folder = isFolderEntry(entry);

    if (editingPath === entry.path) {
      return <div key={entry.path} className="fb-row fb-row-editing" role="option" aria-selected="true" data-type={entry.type}>
        <span className="fb-cell fb-cell-name">
          <span className={`fb-icon ${entry.type}`}>{entryIcon(entry)}</span>
          {renameInput(entry)}
        </span>
        <span className="fb-cell fb-type"><span className="fb-type-pill">{TYPE_SHORT_LABELS[entry.type]}</span></span>
        <span className="fb-cell fb-modified">{formatModified(entry.modified)}</span>
        <span className="fb-cell fb-size">{detailCell(entry)}</span>
      </div>;
    }

    return <ContextMenu key={entry.path}>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          role="option"
          aria-selected={selectedPath === entry.path}
          className={cn("fb-row", selectedPath === entry.path && "selected")}
          data-type={entry.type}
          title={entry.path}
          onClick={() => {
            onSelect(entry);
            // Folders open on a single click, like a web file browser; files
            // are selected so the preview pane can show their contents.
            if (folder) onOpen(entry);
          }}
          onDoubleClick={event => {
            if (folder) return;
            event.preventDefault();
            onOpen(entry);
          }}
          onContextMenu={() => onSelect(entry)}
          onFocus={() => setFocusedPath(entry.path)}
          onKeyDown={event => handleKeyDown(event, entry)}
          ref={element => {
            if (element) rowRefs.current.set(entry.path, element);
            else rowRefs.current.delete(entry.path);
          }}
          tabIndex={focusedPath === entry.path || (!focusedPath && index === 0) ? 0 : -1}
        >
          <span className="fb-cell fb-cell-name">
            <span className={`fb-icon ${entry.type}`}>{entryIcon(entry)}</span>
            <span className="fb-name-wrap">
              <span className="fb-name">{entry.name}</span>
              {showPath && <small className="fb-path">{parentPath(entry.path) || "Workspace root"}</small>}
            </span>
            {folder && <ChevronRight className="fb-open-hint" aria-hidden="true"/>}
          </span>
          <span className="fb-cell fb-type"><span className="fb-type-pill">{TYPE_SHORT_LABELS[entry.type]}</span></span>
          <span className="fb-cell fb-modified">{formatModified(entry.modified)}</span>
          <span className="fb-cell fb-size">{detailCell(entry)}</span>
        </button>
      </ContextMenuTrigger>
      {renderMenu(entry, folder)}
    </ContextMenu>;
  }

  function card(entry: FileEntry, index: number) {
    const folder = isFolderEntry(entry);

    if (editingPath === entry.path) {
      return <div key={entry.path} className="fb-card fb-card-editing" role="option" aria-selected="true" data-type={entry.type}>
        <span className={`fb-card-icon ${entry.type}`}>{entryIcon(entry)}</span>
        {renameInput(entry)}
        <small className="fb-card-meta">{TYPE_SHORT_LABELS[entry.type]}</small>
      </div>;
    }

    return <ContextMenu key={entry.path}>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          role="option"
          aria-selected={selectedPath === entry.path}
          className={cn("fb-card", selectedPath === entry.path && "selected")}
          data-type={entry.type}
          title={entry.path}
          onClick={() => {
            onSelect(entry);
            if (folder) onOpen(entry);
          }}
          onDoubleClick={event => {
            if (folder) return;
            event.preventDefault();
            onOpen(entry);
          }}
          onContextMenu={() => onSelect(entry)}
          onFocus={() => setFocusedPath(entry.path)}
          onKeyDown={event => handleKeyDown(event, entry)}
          ref={element => {
            if (element) rowRefs.current.set(entry.path, element);
            else rowRefs.current.delete(entry.path);
          }}
          tabIndex={focusedPath === entry.path || (!focusedPath && index === 0) ? 0 : -1}
        >
          <span className={`fb-card-icon ${entry.type}`}>{entryIcon(entry)}</span>
          <span className="fb-card-name">{entry.name}</span>
          <small className="fb-card-meta">{showPath ? parentPath(entry.path) || "Workspace root" : TYPE_SHORT_LABELS[entry.type]}</small>
          {folder && <span className="fb-card-count">{entry.children?.length ?? 0}</span>}
        </button>
      </ContextMenuTrigger>
      {renderMenu(entry, folder)}
    </ContextMenu>;
  }

  if (view === "grid") {
    return <div className="fb-grid" role="listbox" aria-label="Folder contents">
      {entries.map((entry, index) => card(entry, index))}
    </div>;
  }

  return <div className="fb-list" role="listbox" aria-label="Folder contents">
    {entries.map((entry, index) => row(entry, index))}
  </div>;
}
