"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import AppShell from "@/components/layout/AppShell";
import ExportDialog from "@/components/reporting/ExportDialog";
import { componentAvailabilityPercent, failuresInTime, meanTimeBetweenFailures } from "@/engine/reliability";
import { Icons } from "@/lib/icons";
import { useDocumentContext } from "@/lib/document-context";
import { loadDocument, queueDocumentSave } from "@/services/documents/client";
import { Asset, isAssetList, readAssets, saveAssets, starterAssets } from "@/data/workspace";

type ColumnKey = keyof Asset | "mtbf" | "availability" | "fit" | "filler";

/** Columns of the register grid. `width` is the default; every column can be
  *  resized by dragging the header edge (Excel-style) and double-clicking the
  *  edge restores the default. A trailing filler column absorbs surplus width,
  *  so the grid still spans the module and only scrolls when the user widens
  *  columns past the module width. */
const tableColumns: { key: ColumnKey; label: string; width?: number; computed?: boolean }[] = [
  { key: "tag", label: "Component ID", width: 126 },
  { key: "description", label: "Description", width: 220 },
  { key: "system", label: "System", width: 116 },
  { key: "qty", label: "Qty", width: 58 },
  { key: "lambda", label: "Failure rate ? (1/h)", width: 114 },
  { key: "mttr", label: "MTTR (h)", width: 84 },
  { key: "mission", label: "Mission (h)", width: 92 },
  { key: "availability", label: "Availability", width: 100, computed: true },
  { key: "status", label: "Status", width: 98 },
  { key: "filler", label: "" },
];

/** Every register field is exported, including the derived reliability figures. */
const exportColumns: { key: ColumnKey; label: string; width: number }[] = [
  { key: "tag", label: "Component ID", width: 150 },
  { key: "description", label: "Description", width: 250 },
  { key: "system", label: "System", width: 150 },
  { key: "qty", label: "Quantity", width: 90 },
  { key: "lambda", label: "Failure rate ? (/h)", width: 155 },
  { key: "mtbf", label: "MTBF (h)", width: 135 },
  { key: "mttr", label: "MTTR (h)", width: 110 },
  { key: "availability", label: "Availability", width: 135 },
  { key: "fit", label: "FIT", width: 110 },
  { key: "mission", label: "Operating time (h)", width: 145 },
  { key: "status", label: "Status", width: 125 },
];

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

const aliases: Record<string, keyof Asset> = {
  id: "id", componentid: "tag", assetid: "tag", lruid: "tag", tag: "tag",
  description: "description", component: "description", name: "description",
  system: "system", subsystem: "system", quantity: "qty", qty: "qty",
  lambda: "lambda", failurerate: "lambda", failurerateh: "lambda",
  mttr: "mttr", mission: "mission", missiontime: "mission", operatingtime: "mission",
  criticality: "criticality", status: "status",
};

export default function DataRegister() {
  const document = useDocumentContext("data");
  const [rows, setRows] = useState<Asset[]>(starterAssets);
  const [selectedRow, setSelectedRow] = useState(0);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(true);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const fileInput = useRef<HTMLInputElement>(null);

  /** Live column widths, seeded from the defaults in `tableColumns`. Resizing
    *  is a session UI preference; the register data itself stays server-side. */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(tableColumns.filter(column => column.width).map(column => [column.key as string, column.width as number])));
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);

  const MIN_COLUMN_WIDTH = 44;
  const MAX_COLUMN_WIDTH = 480;

  function beginColumnResize(key: ColumnKey, event: ReactMouseEvent<HTMLSpanElement>) {
    if (key === "filler") return;
    event.preventDefault();
    event.stopPropagation();
    resizeDrag.current = { key, startX: event.clientX, startWidth: columnWidths[key] ?? 0 };
    setResizing(true);
    const onMove = (move: MouseEvent) => {
      const drag = resizeDrag.current;
      if (!drag) return;
      const next = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (move.clientX - drag.startX)));
      setColumnWidths(current => (current[drag.key as string] === next ? current : { ...current, [drag.key as string]: next }));
    };
    const onUp = () => {
      resizeDrag.current = null;
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function resetColumnWidth(key: ColumnKey) {
    const column = tableColumns.find(entry => entry.key === key);
    if (!column?.width) return;
    setColumnWidths(current => ({ ...current, [key as string]: column.width as number }));
  }

  useEffect(() => {
    let active = true;
    setLoadedPath(null);
    void (async () => {
      const snapshot = await readAssets(document?.path);
      if (!active) return;
      setRows(snapshot);
      if (!document?.path) { setLoadedPath(""); return; }
      const remote = await loadDocument(document.path);
      if (!active) return;
      if (isAssetList(remote)) setRows(remote);
      setLoadedPath(document.path);
    })();
    return () => { active = false; };
  }, [document?.path]);

  useEffect(() => {
    if (loadedPath !== (document?.path ?? "")) return;
    void saveAssets(rows, document?.path);
    if (document?.path) queueDocumentSave(document.path, rows);
    setSaved(true);
  }, [loadedPath, rows, document?.path]);

  const filtered = useMemo(() => rows.filter(row => Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const exportRows = useMemo(() => rows.map(row => Object.fromEntries(exportColumns.map(column => [column.key, valueFor(row, column.key)]))), [rows]);
  const systems = useMemo(() => new Set(rows.map(row => row.system).filter(Boolean)).size, [rows]);
  const totalLambda = useMemo(() => rows.reduce((sum, row) => sum + (Number.isFinite(row.lambda) ? row.lambda : 0), 0), [rows]);

  function valueFor(row: Asset, key: ColumnKey) {
    if (key === "filler") return "";
    if (key === "mtbf") return row.lambda ? Math.round(meanTimeBetweenFailures(row.lambda)).toLocaleString() : "?";
    if (key === "availability") return componentAvailabilityPercent(row);
    if (key === "fit") return Math.round(failuresInTime(row.lambda)).toLocaleString();
    return String(row[key]);
  }

  function update(rowIndex: number, key: keyof Asset, value: string) {
    const numeric = ["qty", "lambda", "mttr", "mission"].includes(key);
    const target = filtered[rowIndex];
    if (!target) return;
    setRows(current => {
      const next = current.map(row => row.id === target.id ? { ...row, [key]: numeric ? Number(value) : value } : row);
      return next;
    });
    setSaved(false);
  }

  function addRow() {
    setRows(current => [...current, { id: crypto.randomUUID(), tag: `NEW-${String(current.length + 1).padStart(3, "0")}`, description: "New component", system: "Unassigned", qty: 1, lambda: 0, mttr: 0, mission: 8760, criticality: "Operational", status: "Draft" }]);
    setSaved(false);
    setSelectedRow(rows.length);
  }

  function deleteSelected() {
    const target = filtered[selectedRow];
    if (!target) return;
    setRows(current => current.filter(row => row.id !== target.id));
    setSelectedRow(Math.max(0, selectedRow - 1));
    setSaved(false);
  }

  function showNotice(message: string, kind: "success" | "error" = "success") {
    setNotice(message);
    setNoticeKind(kind);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") { showNotice("Import cancelled: choose a CSV file.", "error"); return; }
    try {
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) { showNotice("CSV import requires a header row and at least one component record.", "error"); return; }
    const header = parseCsvLine(lines[0]).map(name => aliases[name.toLowerCase().replace(/[^a-z0-9]/g, "")]);
    if (!header.some(key => key === "tag" || key === "description")) { showNotice("CSV import requires a Component ID or Description column.", "error"); return; }
    const imported = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      const record: Partial<Asset> = {};
      header.forEach((key, index) => { if (key && values[index] !== undefined) (record as Record<string, string | number>)[key] = ["qty", "lambda", "mttr", "mission"].includes(key) ? Number(values[index]) : values[index]; });
      return record;
    }).filter(record => record.tag || record.description);
    if (!imported.length) { showNotice("No component records were found in the CSV file.", "error"); return; }
    if (imported.some(record => [record.qty, record.lambda, record.mttr, record.mission].some(value => value !== undefined && !Number.isFinite(Number(value))))) { showNotice("CSV import cancelled: one or more numeric values are invalid.", "error"); return; }
    setRows(current => {
      const merged = [...current];
      imported.forEach(record => {
        const match = merged.findIndex(row => row.tag.toLowerCase() === String(record.tag || "").toLowerCase());
        if (match >= 0) merged[match] = { ...merged[match], ...record };
        else merged.push({ id: String(record.id || crypto.randomUUID()), tag: String(record.tag || `COMP-${merged.length + 1}`), description: String(record.description || "Imported component"), system: String(record.system || "Unassigned"), qty: Number(record.qty || 1), lambda: Number(record.lambda || 0), mttr: Number(record.mttr || 0), mission: Number(record.mission || 8760), criticality: String(record.criticality || "Operational"), status: String(record.status || "Draft") });
      });
      return merged;
    });
    showNotice(`${imported.length} component record${imported.length === 1 ? "" : "s"} imported and merged by Component ID.`);
    setSaved(false);
    } catch {
      showNotice("The CSV file could not be read. Check its format and try again.", "error");
    }
  }

  return <AppShell title="Data Register" document={document} documentName={document?.name ?? "Untitled Data Register"} eyebrow="ASSET RELIABILITY DATABASE" actions={<>
    <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/>
    <button className="secondary-button" onClick={() => fileInput.current?.click()}><Icons.upload/> Import CSV</button>
    <ExportDialog title="RAMS Component Data Register" subtitle={document ? `${document.name} ? Reliability and maintainability asset baseline` : "Reliability and maintainability asset baseline"} columns={exportColumns.map(({ key, label, width }) => ({ key, label, width: Math.max(12, Math.round(width / 8)) }))} rows={exportRows}/>
  </>}>
    <section className="register-workbench">
      <header className="register-toolbar">
        <button className="wb-action register-add" onClick={addRow}><Icons.plus/>Add component</button>
        <button className="wb-action" onClick={deleteSelected} disabled={!filtered[selectedRow]}><Icons.trash/>Delete</button>
        <span className="wb-separator"/>
        <label className="register-search"><Icons.search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find component, system or tag"/></label>
        <span className="register-matches">{filtered.length} of {rows.length}</span>
      </header>
      <div className="register-table-wrap">
        {notice && <div className={`register-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">?</button></div>}
        <table className={`register-table${resizing ? " resizing" : ""}`}>
          <colgroup>{tableColumns.map(column => <col key={column.key} style={column.key === "filler" ? undefined : { width: columnWidths[column.key as string] ?? column.width }}/>)}</colgroup>
          <thead><tr>{tableColumns.map(column => {
            if (column.key === "filler") return <th key="filler" className="filler" aria-hidden="true"/>;
            return <th key={column.key} className={column.computed ? "computed" : ""}>
              <span className="th-label">{column.label}{column.computed && <b title="Calculated from ? and MTTR">?</b>}</span>
              <span className="col-resizer" role="separator" aria-orientation="vertical" title="Drag to resize ? double-click to reset"
                onMouseDown={event => beginColumnResize(column.key, event)}
                onDoubleClick={() => resetColumnWidth(column.key)}/>
            </th>;
          })}</tr></thead>
          <tbody>{filtered.map((row, rowIndex) => <tr key={row.id} className={selectedRow === rowIndex ? "selected" : ""} onClick={() => setSelectedRow(rowIndex)}>
            {tableColumns.map(column => {
              if (column.key === "filler") return <td key="filler" className="filler" aria-hidden="true"/>;
              const raw = column.key in row ? String(row[column.key as keyof Asset]) : valueFor(row, column.key);
              const inputMode = ["lambda", "mttr"].includes(column.key) ? "decimal" : ["qty", "mission"].includes(column.key) ? "numeric" : undefined;
              return <td key={column.key} className={`${column.computed ? "computed" : ""} ${column.key === "qty" || column.key === "mttr" || column.key === "mission" ? "num" : ""}`}>
                {column.computed ? <span>{valueFor(row, column.key)}</span>
                  : column.key === "status" ? <select className={`register-state state-${raw.toLowerCase().replaceAll(" ", "-")}`} value={raw} onChange={event => update(rowIndex, "status", event.target.value)}><option>Draft</option><option>In review</option><option>Validated</option></select>
                  : <input value={raw} type="text" title={raw} onChange={event => update(rowIndex, column.key as keyof Asset, event.target.value)}/>
                }</td>;
            })}
          </tr>)}</tbody>
        </table>
        {!filtered.length && <p className="register-empty">{rows.length ? "No component matches this search." : "The register is empty. Add a component or import a CSV file."}</p>}
      </div>
      <footer className="register-status">
        <span><b>{rows.length}</b> components</span>
        <span><b>{systems}</b> systems</span>
        <span><b>{totalLambda.toExponential(2)}</b> total ?/h</span>
        <span className={saved ? "register-saved" : "register-dirty"}>{saved ? "All changes saved to the Data Register" : "Saving?"}</span>
      </footer>
    </section>
  </AppShell>;
}
