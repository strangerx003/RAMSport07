"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icons } from "@/lib/icons";
import {
  analyzeFmeca,
  defaultFmecaItem,
  defaultFmecaMode,
  formatCriticality,
  normalizeFrequency,
  normalizeSeverity,
  FMECA_FREQUENCIES,
  FMECA_SEVERITIES,
  type FmecaItemRecord,
  type FmecaMode,
  type FmecaModeRecord,
  type FmecaFrequency,
  type FmecaSeverity,
} from "@/engine/fmeca";
import {
  en50126FrequencyDef,
  en50126RiskLevel,
  en50126RiskLevelDef,
  en50126SeverityDef,
  EN50126_RISK_LEVELS,
  type En50126RiskLevel,
} from "@/engine/en50126";
import { isFmecaDocument, readFmeca, saveFmeca, type FmecaDocument, type Asset } from "@/data/workspace";
import { loadDocument, queueDocumentSave, saveDocument } from "@/services/documents/client";
import { loadProjectRegister } from "@/services/documents/project-register";
import SaveDialog from "@/components/documents/SaveDialog";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const DEFAULT_MISSION_TIME = 1;
const FMECA_COLUMN_WIDTHS = [118, 112, 96, 78, 112, 118, 112, 104, 126, 82, 92, 58, 58, 92, 76, 72, 38];
const MIN_COLUMN_WIDTH = 44;
const MAX_COLUMN_WIDTH = 360;

type ResizableHeaderProps = {
  children?: ReactNode;
  className?: string;
  index: number;
  width: number;
  onResize: (index: number, width: number) => void;
  ariaLabel?: string;
};

function ResizableHeader({ children, className, index, width, onResize, ariaLabel }: ResizableHeaderProps) {
  function startResize(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const move = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + pointerEvent.clientX - startX));
      onResize(index, nextWidth);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  return <th className={className} aria-label={ariaLabel}>
    {children}
    <span
      className="fmeca-column-resizer"
      role="separator"
      aria-label={`Resize ${typeof children === "string" ? children : ariaLabel ?? "column"}`}
      aria-orientation="vertical"
      aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={startResize}
      onDoubleClick={() => onResize(index, FMECA_COLUMN_WIDTHS[index] ?? 92)}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onResize(index, Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width + (event.key === "ArrowRight" ? 8 : -8))));
      }}
    />
  </th>;
}

function defaultDocument(): FmecaDocument {
  return { formulaVersion: "mil-std-1629a-v1", mode: "fmea", items: [], options: { missionTime: DEFAULT_MISSION_TIME } };
}

function newManualItem(): FmecaItemRecord {
  return {
    id: crypto.randomUUID(),
    reference: "NEW-ITEM",
    item: "New item",
    function: "",
    modes: [defaultFmecaMode(1)],
  };
}

function seedFromAsset(asset: Asset): FmecaItemRecord {
  const seeded = defaultFmecaItem({ id: asset.id, tag: asset.tag, description: asset.description, lambda: asset.lambda, mission: asset.mission });
  return { ...seeded, id: crypto.randomUUID() };
}

function severityLabel(value: FmecaSeverity) {
  return en50126SeverityDef(value).short;
}

function frequencyLabel(value: FmecaFrequency) {
  return en50126FrequencyDef(value).short;
}

function riskLabel(value: En50126RiskLevel) {
  return en50126RiskLevelDef(value).label;
}

type Props = {
  documentPath?: string;
  onReportChange?: (rows: ExportRow[]) => void;
  onModeChange?: (mode: FmecaMode) => void;
};

export default function FmecaWorkbench({ documentPath, onReportChange, onModeChange }: Props) {
  const [record, setRecord] = useState<FmecaDocument>(() => defaultDocument());
  const [register, setRegister] = useState<Asset[]>([]);
  const [registerSource, setRegisterSource] = useState("Loading Data Register?");
  const [registerLoading, setRegisterLoading] = useState(true);
  const [saveTarget, setSaveTarget] = useState<string | null>(documentPath ?? null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [columnWidths, setColumnWidths] = useState(FMECA_COLUMN_WIDTHS);
  const hydratedPath = useRef<string | null>(null);

  useEffect(() => {
    setSaveTarget(documentPath ?? null);
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    setHydrated(false);

    const apply = (next: FmecaDocument) => {
      setRecord({
        ...next,
        options: { missionTime: Number(next.options?.missionTime) || DEFAULT_MISSION_TIME },
        items: next.items.map(item => ({
          ...item,
          modes: item.modes.map(mode => ({
            ...mode,
            severity: normalizeSeverity(String(mode.severity)),
            probability: normalizeFrequency(String(mode.probability)),
          })),
        })),
      });
    };

    void (async () => {
      if (!documentPath) {
        const saved = await readFmeca();
        if (!active) return;
        apply(saved ?? defaultDocument());
        hydratedPath.current = "";
        setHydrated(true);
        const response = await fetch("/api/save-locations?kind=fmeca", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { fmeca?: string | null } } : null;
        const remembered = payload?.locations?.fmeca;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isFmecaDocument(remote)) return;
        apply(remote);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
      } else {
        hydratedPath.current = null;
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isFmecaDocument(remote)) apply(remote);
        hydratedPath.current = documentPath;
        setHydrated(true);
      }
    })();

    return () => { active = false; };
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    setRegisterLoading(true);
    void loadProjectRegister(documentPath).then(result => {
      if (!active) return;
      setRegister(result.assets);
      setRegisterSource(result.source);
      setRegisterLoading(false);
    }).catch(() => {
      if (active) { setRegister([]); setRegisterSource("Data Register unavailable"); setRegisterLoading(false); }
    });
    return () => { active = false; };
  }, [documentPath]);

  const analysis = useMemo(() => analyzeFmeca(record.items, { mode: record.mode, missionTime: record.options.missionTime }), [record.items, record.mode, record.options.missionTime]);

  function snapshot(): FmecaDocument {
    return { ...record };
  }

  useEffect(() => {
    if (!hydrated) return;
    const next = snapshot();
    void saveFmeca(next, saveTarget ?? undefined);
    if (saveTarget && hydratedPath.current === saveTarget) queueDocumentSave(saveTarget, next);
  }, [record, hydrated, saveTarget]);

  useEffect(() => {
    const rows: ExportRow[] = [];
    for (const result of analysis.items) {
      for (const mode of result.modes) {
        const row: ExportRow = {
          reference: result.item.reference,
          item: result.item.item,
          failureMode: mode.failureMode,
          cause: mode.cause || "?",
          localEffect: mode.localEffect || "?",
          nextEffect: mode.nextEffect || "?",
          endEffect: mode.endEffect || "?",
          severity: `${mode.severity} ? ${severityLabel(mode.severity)}`,
          frequency: `${frequencyLabel(mode.probability)}`,
          risk: riskLabel(mode.riskLevel),
          detection: mode.detection || "?",
        };
        if (record.mode === "fmeca") {
          row.beta = mode.beta.toFixed(2);
          row.alpha = mode.alpha.toFixed(3);
          row.lambdaP = mode.lambdaP.toExponential(3);
          row.time = String(mode.time);
          row.cm = formatCriticality(mode.cm);
          row.cr = formatCriticality(result.cr[mode.severity]);
        }
        rows.push(row);
      }
    }
    onReportChange?.(rows);
  }, [analysis, record.mode, onReportChange]);

  useEffect(() => {
    onModeChange?.(record.mode);
  }, [record.mode, onModeChange]);

  function updateOptions(patch: Partial<FmecaDocument["options"]>) {
    setRecord(current => ({ ...current, options: { ...current.options, ...patch } }));
  }

  function updateItem(id: string, patch: Partial<FmecaItemRecord>) {
    setRecord(current => ({ ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch } : item) }));
  }

  function addItem() {
    setRecord(current => ({ ...current, items: [...current.items, newManualItem()] }));
  }

  function removeItem(id: string) {
    setRecord(current => ({ ...current, items: current.items.filter(item => item.id !== id) }));
  }

  function addMode(itemId: string) {
    setRecord(current => ({
      ...current,
      items: current.items.map(item => item.id === itemId ? { ...item, modes: [...item.modes, defaultFmecaMode(item.modes.length + 1)] } : item),
    }));
  }

  function removeMode(itemId: string, modeId: string) {
    setRecord(current => ({
      ...current,
      items: current.items.map(item => item.id === itemId ? { ...item, modes: item.modes.filter(mode => mode.id !== modeId) } : item),
    }));
  }

  function updateMode(itemId: string, modeId: string, patch: Partial<FmecaModeRecord>) {
    setRecord(current => ({
      ...current,
      items: current.items.map(item => item.id === itemId
        ? { ...item, modes: item.modes.map(mode => mode.id === modeId ? { ...mode, ...patch } : mode) }
        : item),
    }));
  }

  function importRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.items.filter(item => item.assetId).map(item => [item.assetId as string, item]));
      const manual = current.items.filter(item => !item.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) return { ...existing, reference: asset.tag, item: asset.description };
        return seedFromAsset(asset);
      });
      return { ...current, items: [...fromRegister, ...manual] };
    });
    setNotice(`Imported ${register.length} item${register.length === 1 ? "" : "s"} from the Data Register.`);
  }

  function syncRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.items.filter(item => item.assetId).map(item => [item.assetId as string, item]));
      const manual = current.items.filter(item => !item.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) return { ...existing, reference: asset.tag, item: asset.description };
        return seedFromAsset(asset);
      });
      return { ...current, items: [...fromRegister, ...manual] };
    });
    setNotice(`Synced with the Data Register ? ${register.length} item${register.length === 1 ? "" : "s"}.`);
  }

  async function saveNow() {
    if (!saveTarget) { setSaveOpen(true); return; }
    setSaving(true);
    await saveDocument(saveTarget, snapshot(), true);
    setSaving(false);
    setNotice(`Saved to ${saveTarget}.`);
  }

  function handleSaved(path: string) {
    hydratedPath.current = path;
    setSaveTarget(path);
    const params = new URLSearchParams(window.location.search);
    params.set("project", path.split("/")[0] || "");
    params.set("file", path);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setNotice(`Saved to ${path}.`);
  }

  const saveFolder = saveTarget ? saveTarget.split("/").slice(0, -1).join("/") : "";
  const saveName = saveTarget?.split("/").pop() || "Untitled FMECA";
  const quantitative = record.mode === "fmeca";
  const columnHeaders = quantitative
    ? ["Reference", "Failure mode", "Cause", "Phase", "Local effect", "Next-higher effect", "End effect", "Detection", "Compensating provision", "Severity", "Frequency", "?", "?", "?p ?10??/h", "t (h)", "Cm", ""]
    : ["Reference", "Failure mode", "Cause", "Phase", "Local effect", "Next-higher effect", "End effect", "Detection", "Compensating provision", "Severity", "Frequency", ""];
  const visibleColumnWidths = quantitative ? columnWidths : [...columnWidths.slice(0, 11), columnWidths[16]];
  const resizeColumn = (visibleIndex: number, width: number) => {
    const sourceIndex = quantitative || visibleIndex < 11 ? visibleIndex : 16;
    setColumnWidths(current => current.map((value, index) => index === sourceIndex ? width : value));
  };
  const modeCount = record.items.reduce((sum, item) => sum + item.modes.length, 0);
  const criticalModes = analysis.criticalItems.length;
  const worstRisk = analysis.worstRisk;

  return (
    <section className="fmeca-workbench">
      <header className="fmeca-toolbar">
        <div className="fmeca-mode-group" role="group" aria-label="Analysis type">
          {(["fmea", "fmeca"] as const).map(mode => (
            <button key={mode} type="button" className={record.mode === mode ? "active" : ""} onClick={() => setRecord(current => ({ ...current, mode: mode as FmecaMode }))} title={mode === "fmea" ? "Failure Mode and Effects Analysis (Task 101)" : "FMECA with Criticality Analysis (Tasks 101 + 102)"}>
              {mode === "fmea" ? "FMEA" : "FMECA"}
            </button>
          ))}
        </div>

        <label className="fmeca-inline-field">Mission time (h)
          <input type="number" min="0.001" step="0.1" value={record.options.missionTime} onChange={event => updateOptions({ missionTime: Math.max(0.001, Number(event.target.value) || DEFAULT_MISSION_TIME) })}/>
        </label>

        <span className="fmeca-toolbar-spacer"/>

        <button type="button" className="fmeca-button" onClick={syncRegister} disabled={registerLoading} title={registerSource}><Icons.link/><span>Sync register</span></button>
        <button type="button" className="fmeca-button" onClick={() => void saveNow()} disabled={saving}><Icons.save/><span>{saving ? "Saving?" : "Save"}</span></button>
        <button type="button" className="fmeca-button primary" onClick={() => setSaveOpen(true)}><Icons.download/><span>Save as</span></button>
      </header>

      <div className="fmeca-statusbar">
        <span>{record.items.length} item{record.items.length === 1 ? "" : "s"} ? {modeCount} failure mode{modeCount === 1 ? "" : "s"}</span>
        <span>{registerSource}</span>
        <span>{saving ? "Saving?" : saveTarget ? `Saved to ${saveName}` : "Not saved to a project file"}</span>
        {notice && <button type="button" className="fmeca-notice" onClick={() => setNotice("")}>{notice} ?</button>}
      </div>

      <div className="fmeca-layout">
        <div className="fmeca-main">
          <section className="fmeca-summary">
            <article className="fmeca-result-card primary">
              <span>Items</span>
              <strong>{record.items.length}</strong>
              <small>from the Data Register</small>
            </article>
            <article className="fmeca-result-card">
              <span>Failure modes</span>
              <strong>{modeCount}</strong>
              <small>recorded lines</small>
            </article>
            <article className={`fmeca-result-card ${criticalModes ? "critical" : ""}`}>
              <span>Intolerable / Undesirable</span>
              <strong>{criticalModes}</strong>
              <small>EN 50126 risk</small>
            </article>
            <article className={`fmeca-result-card risk-${worstRisk ?? "negligible"}`}>
              <span>Worst risk</span>
              <strong>{worstRisk ? riskLabel(worstRisk) : "?"}</strong>
              <small>EN 50126-1 Annex C</small>
            </article>
            {quantitative ? (
              <article className="fmeca-result-card primary">
                <span>? Cr</span>
                <strong>{formatCriticality(analysis.totalCr)}</strong>
                <small>criticality index</small>
              </article>
            ) : (
              <article className="fmeca-result-card">
                <span>Analysis</span>
                <strong>FMEA</strong>
                <small>qualitative</small>
              </article>
            )}
          </section>

          <div className="fmeca-toolrow">
            <button type="button" className="fmeca-button" onClick={importRegister} disabled={registerLoading}><Icons.table/><span>Import register</span></button>
            <button type="button" className="fmeca-button" onClick={addItem}><Icons.plus/><span>Add item</span></button>
            <span className="fmeca-toolrow-note">{quantitative ? "FMECA adds ?, ?, ?p and t to compute Cm and Cr; risk tiers follow EN 50126." : "FMEA records effects and the EN 50126 severity/frequency pair; switch to FMECA for criticality numbers."}</span>
          </div>

          <div className="fmeca-sheet-scroll">
            <table className="fmeca-sheet">
              <colgroup>
                {visibleColumnWidths.map((width, index) => <col key={`fmeca-col-${index}`} style={{ width }}/>) }
              </colgroup>
              <thead>
                <tr>
                  {columnHeaders.map((header, index) => <ResizableHeader
                    key={`fmeca-heading-${index}`}
                    index={index}
                    width={visibleColumnWidths[index]}
                    onResize={resizeColumn}
                    className={index === 0 ? "sticky-col" : undefined}
                    ariaLabel={header || "Remove"}
                  >{header}</ResizableHeader>)}
                </tr>
              </thead>
              <tbody>
                {analysis.items.map((result, index) => (
                  <Fragment key={`fmeca-item-${index}-${result.item.id}`}>
                    <tr className="fmeca-item-row" key={`fmeca-item-row-${index}`}>
                      <td className="sticky-col">
                        <input className="fmeca-ref" value={result.item.reference} onChange={event => updateItem(result.item.id, { reference: event.target.value })} aria-label="Item reference"/>
                        <input className="fmeca-item-name" value={result.item.item} onChange={event => updateItem(result.item.id, { item: event.target.value })} aria-label="Item name"/>
                      </td>
                      <td colSpan={quantitative ? 16 : 11} className="fmeca-item-meta">
                        <span>Function <input value={result.item.function} onChange={event => updateItem(result.item.id, { function: event.target.value })} placeholder="Describe the item function"/></span>
                        <span className={`fmeca-worst sev-${result.worstSeverity}`}>Worst: {result.worstSeverity} ? {severityLabel(result.worstSeverity)}</span>
                        <span className={`fmeca-worst risk-${result.worstRisk}`}>Risk: {riskLabel(result.worstRisk)}</span>
                        {quantitative && <span className="fmeca-cr">?? = {result.alphaSum.toFixed(3)} ? Cr = {formatCriticality(result.totalCr)}</span>}
                        <span className="fmeca-item-actions">
                          <button type="button" onClick={() => addMode(result.item.id)} title="Add failure mode"><Icons.plus/></button>
                          <button type="button" onClick={() => removeItem(result.item.id)} title="Remove item"><Icons.trash/></button>
                        </span>
                      </td>
                    </tr>
                    {result.modes.map(mode => (
                      <tr key={`fmeca-mode-${index}-${mode.id}`} className={`fmeca-mode-row sev-${mode.severity}`}>
                        <td className="sticky-col fmeca-mode-cell"><span className="fmeca-mode-tag">{mode.id}</span></td>
                        <td><input value={mode.failureMode} onChange={event => updateMode(result.item.id, mode.id, { failureMode: event.target.value })} aria-label="Failure mode"/></td>
                        <td><input value={mode.cause} onChange={event => updateMode(result.item.id, mode.id, { cause: event.target.value })} aria-label="Cause"/></td>
                        <td><input value={mode.missionPhase} onChange={event => updateMode(result.item.id, mode.id, { missionPhase: event.target.value })} aria-label="Mission phase"/></td>
                        <td><input value={mode.localEffect} onChange={event => updateMode(result.item.id, mode.id, { localEffect: event.target.value })} aria-label="Local effect"/></td>
                        <td><input value={mode.nextEffect} onChange={event => updateMode(result.item.id, mode.id, { nextEffect: event.target.value })} aria-label="Next-higher effect"/></td>
                        <td><input value={mode.endEffect} onChange={event => updateMode(result.item.id, mode.id, { endEffect: event.target.value })} aria-label="End effect"/></td>
                        <td><input value={mode.detection} onChange={event => updateMode(result.item.id, mode.id, { detection: event.target.value })} aria-label="Detection method"/></td>
                        <td><input value={mode.compensating} onChange={event => updateMode(result.item.id, mode.id, { compensating: event.target.value })} aria-label="Compensating provision"/></td>
                        <td>
                          <select className={`sev-select sev-${mode.severity}`} value={mode.severity} onChange={event => updateMode(result.item.id, mode.id, { severity: event.target.value as FmecaSeverity })} aria-label="EN 50126 severity">
                            {FMECA_SEVERITIES.map(severity => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={mode.probability} onChange={event => updateMode(result.item.id, mode.id, { probability: event.target.value as FmecaFrequency })} aria-label="EN 50126 frequency">
                            {FMECA_FREQUENCIES.map(frequency => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}
                          </select>
                        </td>
                        {quantitative && <>
                          <td><input type="number" min="0" max="1" step="0.01" value={mode.beta} onChange={event => updateMode(result.item.id, mode.id, { beta: Math.max(0, Math.min(1, Number(event.target.value))) })} aria-label="Beta"/></td>
                          <td><input type="number" min="0" max="1" step="0.001" value={mode.alpha} onChange={event => updateMode(result.item.id, mode.id, { alpha: Math.max(0, Math.min(1, Number(event.target.value))) })} aria-label="Alpha"/></td>
                          <td><input type="number" min="0" step="any" value={mode.lambdaP} onChange={event => updateMode(result.item.id, mode.id, { lambdaP: Math.max(0, Number(event.target.value)) })} aria-label="Part failure rate"/></td>
                          <td><input type="number" min="0" step="any" value={mode.time} onChange={event => updateMode(result.item.id, mode.id, { time: Math.max(0, Number(event.target.value)) })} aria-label="Operating time"/></td>
                          <td className="fmeca-computed">{formatCriticality(mode.cm)}</td>
                        </>}
                        <td><button type="button" className="fmeca-row-delete" onClick={() => removeMode(result.item.id, mode.id)} aria-label={`Remove ${mode.failureMode}`}><Icons.trash/></button></td>
                      </tr>
                    ))}
                    {!result.modes.length && (
                      <tr key={`fmeca-empty-${index}`} className="fmeca-empty-row"><td colSpan={quantitative ? 17 : 12}>No failure modes. Add one to continue the analysis.</td></tr>
                    )}
                  </Fragment>
                ))}
                {!record.items.length && (
                  <tr><td colSpan={quantitative ? 17 : 12} className="fmeca-table-empty">No items yet. Import the Data Register or add an item.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="fmeca-side">
          <section className="fmeca-card">
            <h3>EN 50126 risk matrix</h3>
            <p className="fmeca-card-note">Safety severity S1?S5 against frequency class. Counts show recorded modes; the cell colour is the EN 50126-1 Annex C risk tier.</p>
            <div className="fmeca-matrix-wrap">
              <table className="fmeca-matrix">
                <thead>
                  <tr><th>Sev</th>{FMECA_FREQUENCIES.map(frequency => <th key={frequency.value} title={`${frequency.label} ? ${frequency.range}`}>{frequency.short}</th>)}</tr>
                </thead>
                <tbody>
                  {FMECA_SEVERITIES.map(severity => (
                    <tr key={severity.value} className={`sev-${severity.value}`}>
                      <th title={severity.description}>{severity.value}</th>
                      {FMECA_FREQUENCIES.map(frequency => {
                        const level = en50126RiskLevel(severity.value, frequency.value);
                        const count = analysis.matrix[severity.value][frequency.value];
                        return <td key={frequency.value} className={`risk-${level} ${count > 0 ? "filled" : ""}`} title={`${severity.label} ? ${frequency.label} ? ${riskLabel(level)}`}>{count || ""}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="fmeca-risk-legend">
              {EN50126_RISK_LEVELS.map(level => <li key={level.value} className={`risk-${level.value}`} title={level.description}><i/>{level.label}</li>)}
            </ul>
          </section>

          <section className="fmeca-card">
            <h3>Risk distribution</h3>
            <table className="fmeca-mini-table">
              <thead><tr><th>EN 50126 tier</th><th>Modes</th></tr></thead>
              <tbody>
                {EN50126_RISK_LEVELS.map(level => (
                  <tr key={level.value} className={`risk-${level.value}`}><td>{level.label}</td><td>{analysis.riskCounts[level.value]}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="fmeca-card-note">Intolerable and Undesirable modes need reduction or a recorded, justified acceptance.</p>
          </section>

          {quantitative && (
            <section className="fmeca-card">
              <h3>Cr by severity</h3>
              <table className="fmeca-mini-table">
                <thead><tr><th>Severity</th><th>Cr</th></tr></thead>
                <tbody>
                  {FMECA_SEVERITIES.map(severity => {
                    const total = analysis.items.reduce((sum, item) => sum + item.cr[severity.value], 0);
                    return <tr key={severity.value} className={`sev-${severity.value}`}><td>{severity.value} ? {severity.short}</td><td>{formatCriticality(total)}</td></tr>;
                  })}
                </tbody>
              </table>
            </section>
          )}

          <section className="fmeca-card">
            <h3>Priority risk items</h3>
            {analysis.criticalItems.length ? (
              <ul className="fmeca-critical-list">
                {analysis.criticalItems.map((entry, index) => (
                  <li key={`${entry.item}-${entry.mode}-${index}`} className={`risk-${entry.riskLevel}`}>
                    <b>{entry.item}</b>
                    <span>{entry.mode}</span>
                    <em>{riskLabel(entry.riskLevel)} ? {entry.severity} / {frequencyLabel(entry.frequency)}{quantitative ? ` ? Cm ${formatCriticality(entry.cr)}` : ""}</em>
                  </li>
                ))}
              </ul>
            ) : <p className="fmeca-card-note">No Intolerable or Undesirable failure modes recorded.</p>}
          </section>

          <details className="fmeca-method-note">
            <summary>Method and formulas used</summary>
            <p><b>EN 50126-1:2017 Annex C risk assessment.</b> Each failure mode is assigned a safety severity S1?S5 and a frequency class (Frequent to Highly improbable). The pair is read on the four-tier matrix to obtain Intolerable, Undesirable, Tolerable or Negligible risk. The railway RAMS basis is EN 50126, not the MIL-STD-1629A severity/probability classes.</p>
            <p><b>MIL-STD-1629A Task 101 (FMEA).</b> Each failure mode is assessed for its local, next-higher and end effect, detection method and compensating provision.</p>
            <p><b>Task 102 (Criticality Analysis).</b> The optional quantitative view computes the mode criticality number Cm = ? ? ? ? ?p ? t and the item criticality Cr = ? Cm within each EN 50126 severity class, with ?p in failures per 10? hours.</p>
            <p>? is the conditional probability that the failure effect occurs given the failure mode, ? is the failure-mode ratio (?? = 1 per item), ?p is the part failure rate and t is the operating time in the mission phase. Criticality numbers are relative ranking indicators, not absolute probabilities (MIL-STD-1629A ?4.4.3).</p>
          </details>

          {analysis.warnings.length > 0 && (
            <div className="fmeca-warnings" role="status">
              <strong>Worksheet checks</strong>
              <ul>{analysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
            </div>
          )}
        </aside>
      </div>

      <SaveDialog
        open={saveOpen}
        kind="fmeca"
        defaultFolder={saveFolder}
        defaultName={saveName}
        data={snapshot()}
        onClose={() => setSaveOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}
