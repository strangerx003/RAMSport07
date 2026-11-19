"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icons } from "@/lib/icons";
import {
  analyzeWeibull,
  DEFAULT_WEIBULL_OPTIONS,
  evaluateMaterialLife,
  materialByKey,
  WEIBULL_MATERIAL_LIBRARY,
  weibullExample,
  weibullMaterialExample,
  type WeibullAnalysis,
  type WeibullDataPoint,
  type WeibullLru,
  type WeibullMethod,
  type WeibullOptions,
  type WeibullRegression,
} from "@/engine/weibull";
import { isWeibullDocument, readWeibull, saveWeibull, type WeibullDocument } from "@/data/workspace";
import { loadDocument, queueDocumentSave, saveDocument } from "@/services/documents/client";
import { ModuleKpis } from "@/components/layout/header-kpis";
import SaveDialog from "@/components/documents/SaveDialog";
import type { ExportRow } from "@/components/reporting/ExportDialog";
import WeibullPlot from "./WeibullPlot";

const DEFAULT_MISSION_TIMES = [100, 500, 1000, 5000, 10000];
const MATERIAL_COLUMN_DEFAULTS = [34, 154, 148, 62, 52, 94, 98, 84, 96, 34];
const LIFE_DATA_COLUMN_DEFAULTS = [30, 104, 68, 112, 32];
const WEIBULL_COLUMN_MIN = 34;
const WEIBULL_COLUMN_MAX = 360;

function ResizableWeibullHeader({ children, index, width, defaultWidth, onResize, className, ariaLabel }: {
  children?: ReactNode;
  index: number;
  width: number;
  defaultWidth: number;
  onResize: (index: number, width: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  function startResize(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const move = (pointerEvent: PointerEvent) => onResize(index, Math.max(WEIBULL_COLUMN_MIN, Math.min(WEIBULL_COLUMN_MAX, startWidth + pointerEvent.clientX - startX)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  return <th className={className} aria-label={ariaLabel}>
    {children}
    <span className="weibull-column-resizer" role="separator" aria-orientation="vertical" aria-label={`Resize ${typeof children === "string" ? children : ariaLabel ?? "column"}`} aria-valuemin={WEIBULL_COLUMN_MIN} aria-valuemax={WEIBULL_COLUMN_MAX} aria-valuenow={Math.round(width)} tabIndex={0} onPointerDown={startResize} onDoubleClick={() => onResize(index, defaultWidth)} onKeyDown={event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onResize(index, Math.max(WEIBULL_COLUMN_MIN, Math.min(WEIBULL_COLUMN_MAX, width + (event.key === "ArrowRight" ? 8 : -8))));
    }}/>
  </th>;
}

const METHOD_LABELS: Record<WeibullMethod, string> = {
  mrr: "Median-rank regression",
  mle: "Maximum likelihood",
  weibayes: "WeiBayes (known ?)",
};

function defaultDocument(): WeibullDocument {
  return {
    formulaVersion: "weibull-iec61649-v1",
    points: weibullExample("annexE"),
    options: { ...DEFAULT_WEIBULL_OPTIONS },
    missionTimes: DEFAULT_MISSION_TIMES,
    material: { lrus: weibullMaterialExample(), horizonYears: 10 },
  };
}

function parseMissionTimes(input: string) {
  return input
    .split(/[,;\s]+/)
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value >= 0);
}

function formatValue(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "?";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-3) return value.toExponential(3);
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatInterval(interval: [number, number] | null, confidence: number, oneSided = false) {
  if (!interval) return "approximate interval unavailable";
  const low = formatValue(interval[0]);
  const high = formatValue(interval[1]);
  if (oneSided) return `one-sided lower bound ${low}`;
  return `approx. ${(confidence * 100).toFixed(1)}% CI ${low} ? ${high}`;
}

function suspendedTimesOf(points: WeibullDataPoint[]) {
  return points
    .filter(point => point.suspended && Number.isFinite(point.time) && point.time >= 0)
    .flatMap(point => {
      const quantity = Math.max(1, Math.min(2000, Math.round(point.quantity || 1)));
      return Array.from({ length: quantity }, () => point.time);
    });
}

type Props = {
  documentPath?: string;
  onReportChange?: (rows: ExportRow[]) => void;
};

export default function WeibullWorkbench({ documentPath, onReportChange }: Props) {
  const [record, setRecord] = useState<WeibullDocument>(() => defaultDocument());
  const [view, setView] = useState<"material" | "life">("material");
  const [missionInput, setMissionInput] = useState(DEFAULT_MISSION_TIMES.join(", "));
  const [saveTarget, setSaveTarget] = useState<string | null>(documentPath ?? null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [materialColumnWidths, setMaterialColumnWidths] = useState(MATERIAL_COLUMN_DEFAULTS);
  const [lifeDataColumnWidths, setLifeDataColumnWidths] = useState(LIFE_DATA_COLUMN_DEFAULTS);
  const hydratedPath = useRef<string | null>(null);

  useEffect(() => {
    setSaveTarget(documentPath ?? null);
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    setHydrated(false);

    const apply = (next: WeibullDocument) => {
      setRecord({
        ...next,
        options: { ...DEFAULT_WEIBULL_OPTIONS, ...next.options },
        material: next.material ?? { lrus: weibullMaterialExample(), horizonYears: 10 },
      });
      setMissionInput(next.missionTimes.join(", "));
    };

    void (async () => {
      if (!documentPath) {
        const saved = await readWeibull();
        if (!active) return;
        apply(saved ?? defaultDocument());
        hydratedPath.current = "";
        setHydrated(true);
        // Resume the file this account saved into last, the way RBD and FTA do.
        const response = await fetch("/api/save-locations?kind=weibull", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { weibull?: string | null } } : null;
        const remembered = payload?.locations?.weibull;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isWeibullDocument(remote)) return;
        apply(remote);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
      } else {
        hydratedPath.current = null;
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isWeibullDocument(remote)) apply(remote);
        hydratedPath.current = documentPath;
        setHydrated(true);
      }
    })();

    return () => { active = false; };
  }, [documentPath]);

  const missionTimes = useMemo(() => parseMissionTimes(missionInput), [missionInput]);
  const analysis = useMemo(() => analyzeWeibull(record.points, record.options, missionTimes), [record.points, record.options, missionTimes]);
  const suspendedTimes = useMemo(() => suspendedTimesOf(record.points), [record.points]);

  function snapshot(): WeibullDocument {
    return { ...record, missionTimes };
  }

  useEffect(() => {
    if (!hydrated) return;
    const next = snapshot();
    void saveWeibull(next, saveTarget ?? undefined);
    if (saveTarget && hydratedPath.current === saveTarget) queueDocumentSave(saveTarget, next);
  }, [record, missionTimes, hydrated, saveTarget]);

  useEffect(() => {
    if (!analysis.ok) { onReportChange?.([]); return; }
    const b10 = analysis.bLives.find(entry => entry.label === "B10")?.value ?? Number.NaN;
    const rows: ExportRow[] = [
      { parameter: "Shape parameter ?", value: analysis.beta.toFixed(4), detail: formatInterval(analysis.betaCi, record.options.confidence) },
      { parameter: "Scale parameter ?", value: formatValue(analysis.eta), detail: formatInterval(analysis.etaCi, record.options.confidence, analysis.method === "weibayes") },
      ...(analysis.t0 > 0 ? [{ parameter: "Location parameter t?", value: formatValue(analysis.t0), detail: "Three-parameter Weibull failure-free life" }] : []),
      { parameter: "Mean time to failure", value: formatValue(analysis.mttf), detail: "Eq. 19: MTTF = t? + ???(1 + 1/?)" },
      { parameter: "B10 life", value: formatValue(b10), detail: "Eq. 20: t(F) = t? + ??[?ln(1 ? F)]^(1/?)" },
      { parameter: "Plot fit r?", value: analysis.r2.toFixed(4), detail: `${METHOD_LABELS[analysis.method]} ? n = ${analysis.n}, r = ${analysis.r}, suspended = ${analysis.suspended}` },
      ...analysis.bLives.map(entry => ({ parameter: `${entry.label} life`, value: formatValue(entry.value), detail: `F = ${(entry.p * 100).toFixed(1)}%` })),
      ...analysis.reliability.map(point => ({
        parameter: `R(t) at t = ${formatValue(point.time)}`,
        value: `${(point.reliability * 100).toFixed(4)}%`,
        detail: `h(t) = ${point.hazard.toExponential(3)} ? H(t) = ${point.cumulativeHazard.toFixed(4)}`,
      })),
    ];
    onReportChange?.(rows);
  }, [analysis, onReportChange, record.options.confidence]);

  function updateOptions(patch: Partial<WeibullOptions>) {
    setRecord(current => ({ ...current, options: { ...current.options, ...patch } }));
  }

  function updatePoint(id: string, patch: Partial<WeibullDataPoint>) {
    setRecord(current => ({ ...current, points: current.points.map(point => point.id === id ? { ...point, ...patch } : point) }));
  }

  function addPoint() {
    setRecord(current => {
      const last = current.points.at(-1);
      const time = Math.max(1, Math.round((last?.time ?? 0) + 10));
      return { ...current, points: [...current.points, { id: crypto.randomUUID(), time, quantity: 1, suspended: false }] };
    });
  }

  function removePoint(id: string) {
    setRecord(current => ({ ...current, points: current.points.filter(point => point.id !== id) }));
  }

  /* ---------------------------------------------------------- material life */
  const material = record.material ?? { lrus: [], horizonYears: 10 };
  const materialRows = useMemo(
    () => material.lrus.map(lru => ({
      lru,
      library: materialByKey(lru.materialKey),
      life: evaluateMaterialLife(lru.eta, lru.beta, material.horizonYears, lru.replaceAt),
    })),
    [material],
  );
  const totalFpmh = useMemo(() => materialRows.reduce((sum, row) => sum + (Number.isFinite(row.life.fpmh) ? row.life.fpmh : 0), 0), [materialRows]);
  const minMtbf = useMemo(() => {
    const values = materialRows.map(row => row.life.mtbfYears).filter(Number.isFinite);
    return values.length ? Math.min(...values) : Number.NaN;
  }, [materialRows]);
  const meanReliability = useMemo(() => {
    const values = materialRows.map(row => row.life.reliability).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
  }, [materialRows]);

  function updateMaterial(patch: Partial<{ lrus: WeibullLru[]; horizonYears: number }>) {
    setRecord(current => ({ ...current, material: { ...(current.material ?? material), ...patch } }));
  }
  function updateLru(id: string, patch: Partial<WeibullLru>) {
    updateMaterial({ lrus: material.lrus.map(lru => lru.id === id ? { ...lru, ...patch } : lru) });
  }
  function selectMaterial(id: string, materialKey: string) {
    const library = materialByKey(materialKey);
    updateLru(id, library ? { materialKey, eta: library.eta, beta: library.beta, replaceAt: Math.round(library.eta * 0.75 * 10) / 10 } : { materialKey });
  }
  function addLru() {
    const library = WEIBULL_MATERIAL_LIBRARY[1];
    updateMaterial({ lrus: [...material.lrus, { id: crypto.randomUUID(), component: `NEW LRU ${material.lrus.length + 1}`, materialKey: library.key, eta: library.eta, beta: library.beta, replaceAt: Math.round(library.eta * 0.75 * 10) / 10 }] });
  }
  function removeLru(id: string) {
    updateMaterial({ lrus: material.lrus.filter(lru => lru.id !== id) });
  }
  function loadMaterialExample() {
    updateMaterial({ lrus: weibullMaterialExample(), horizonYears: 10 });
    setNotice("Loaded the indoor railway LRU table with the published material ? and ? values.");
  }

  function loadExample(kind: "annexB" | "annexE" | "weibayes") {
    setRecord(current => ({
      ...current,
      points: weibullExample(kind),
      options: { ...current.options, method: kind === "weibayes" ? "weibayes" : "mrr", ...(kind === "weibayes" ? { assumedBeta: 5 } : {}) },
    }));
    setNotice(kind === "annexB"
      ? "Loaded the IEC 61649 Annex B censored sample: 20 failures and 20 suspensions."
      : kind === "annexE"
        ? "Loaded the IEC 61649 Annex E complete sample: 10 failure times."
        : "Loaded a small WeiBayes sample with a known shape parameter.");
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
  const saveName = saveTarget?.split("/").pop() || "Untitled Weibull";
  const confidence = record.options.confidence;

  return (
    <section className="weibull-workbench">
      <header className="weibull-toolbar">
        <div className="weibull-method-group" role="group" aria-label="Weibull view">
          <button type="button" className={view === "material" ? "active" : ""} onClick={() => setView("material")} title="LRU expected life by material">Material life</button>
          <button type="button" className={view === "life" ? "active" : ""} onClick={() => setView("life")} title="IEC 61649 failure-time analysis">Failure data</button>
        </div>

        {view === "material" ? <>
          <label className="weibull-inline-field">Quote at t
            <input type="number" min="1" step="1" value={material.horizonYears} onChange={event => updateMaterial({ horizonYears: Math.max(1, Number(event.target.value) || 1) })} title="Analysis horizon in years"/>
            <span>yrs</span>
          </label>
          <button type="button" className="weibull-button" onClick={addLru}><Icons.plus/><span>Add LRU</span></button>
          <button type="button" className="weibull-button" onClick={loadMaterialExample} title="Load the indoor railway example table">Example</button>
        </> : <>
        <div className="weibull-method-group" role="group" aria-label="Estimation method">
          {(["mrr", "mle", "weibayes"] as const).map(method => (
            <button key={method} type="button" className={record.options.method === method ? "active" : ""} onClick={() => updateOptions({ method })} title={METHOD_LABELS[method]}>
              {method === "mrr" ? "MRR" : method === "mle" ? "MLE" : "WeiBayes"}
            </button>
          ))}
        </div>

        <label className="weibull-inline-field">Regression
          <select value={record.options.regression} onChange={event => updateOptions({ regression: event.target.value as WeibullRegression })}>
            <option value="x-on-y">X on Y</option>
            <option value="y-on-x">Y on X</option>
          </select>
        </label>

        <label className="weibull-inline-field">Confidence
          <select value={String(record.options.confidence)} onChange={event => updateOptions({ confidence: Number(event.target.value) })}>
            <option value="0.632">63.2%</option>
            <option value="0.9">90%</option>
            <option value="0.95">95%</option>
            <option value="0.99">99%</option>
          </select>
        </label>

        {record.options.method === "weibayes" && (
          <label className="weibull-inline-field">Assumed ?
            <input type="number" min="0.01" step="0.01" value={record.options.assumedBeta} onChange={event => updateOptions({ assumedBeta: Math.max(0.01, Number(event.target.value) || 0.01) })}/>
          </label>
        )}

        <label className="weibull-check">
          <input type="checkbox" checked={record.options.threeParameter} onChange={event => updateOptions({ threeParameter: event.target.checked })}/>
          <span>3-parameter (t?)</span>
        </label>
        </>}

        <span className="weibull-toolbar-spacer"/>

        <button type="button" className="weibull-button" onClick={() => void saveNow()} disabled={saving}>
          <Icons.save/><span>{saving ? "Saving?" : "Save"}</span>
        </button>
        <button type="button" className="weibull-button primary" onClick={() => setSaveOpen(true)}>
          <Icons.download/><span>Save as</span>
        </button>
      </header>

      <div className="weibull-statusbar">
        {view === "material" ? <span>{material.lrus.length} LRUs ? quoted at t = {material.horizonYears} yr ? replace-at is the planned maintenance age</span> : <span>{analysis.ok ? `${analysis.n} items ? ${analysis.r} failure${analysis.r === 1 ? "" : "s"} ? ${analysis.suspended} suspended` : "Waiting for valid life data"}</span>}
        <span>{saving ? "Saving?" : saveTarget ? `Saved to ${saveName}` : "Not saved to a project file"}</span>
        {notice && <button type="button" className="weibull-notice" onClick={() => setNotice("")}>{notice} ?</button>}
      </div>

      {view === "material" && <ModuleKpis
        ariaLabel="Material life headline figures"
        metrics={[
          { symbol: "N", name: "LRUs analysed", value: String(material.lrus.length), primary: true },
          { symbol: "?FPMH", name: "Total failure rate", value: totalFpmh.toFixed(3) },
          { symbol: "MTBF", name: "Shortest MTBF", value: formatValue(minMtbf, 2), unit: "yr" },
          { symbol: "R", name: "Mean reliability", value: `${meanReliability.toFixed(2)}%`, primary: true },
        ]}
      />}

      {view === "material" ? (
        <div className="weibull-material-view">
          <section className="weibull-material-sheet">
            <header className="weibull-material-head">
              <div><strong>All LRUs ? Weibull expected life</strong><span>Based on material expected life ? indoor railway application</span></div>
              <span className="weibull-material-horizon">FPMH and R(t) at t = {material.horizonYears} years</span>
            </header>
            <div className="weibull-material-scroll">
              <table className="weibull-material-table">
                <colgroup>
                  {materialColumnWidths.map((width, index) => <col key={`material-col-${index}`} style={{ width }}/>) }
                </colgroup>
                <thead>
                  <tr>
                    {["Sr.", "Component (LRU)", "Material type", "? (yr)", "?", `FPMH @ ${material.horizonYears} yr`, `R(t) % @ ${material.horizonYears} yr`, "MTBF (yr)", "Replace at (yr)", ""].map((label, index) => <ResizableWeibullHeader
                      key={`material-heading-${index}`}
                      index={index}
                      width={materialColumnWidths[index]}
                      defaultWidth={MATERIAL_COLUMN_DEFAULTS[index]}
                      onResize={(column, width) => setMaterialColumnWidths(current => current.map((value, currentIndex) => currentIndex === column ? width : value))}
                      className={index >= 5 && index <= 7 ? "weibull-col-calc" : index === 8 ? "weibull-col-policy" : undefined}
                      ariaLabel={label || "Remove"}
                    >{label}</ResizableWeibullHeader>)}
                  </tr>
                </thead>
                <tbody>
                  {materialRows.map(({ lru, library, life }, index) => (
                    <tr key={lru.id}>
                      <td className="weibull-material-index">{index + 1}</td>
                      <td><input value={lru.component} onChange={event => updateLru(lru.id, { component: event.target.value })} aria-label={`Component for row ${index + 1}`}/></td>
                      <td>
                        <select value={lru.materialKey} onChange={event => selectMaterial(lru.id, event.target.value)} aria-label={`Material for row ${index + 1}`}>
                          {WEIBULL_MATERIAL_LIBRARY.map(entry => <option key={entry.key} value={entry.key}>{entry.material}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0.1" step="0.1" value={lru.eta} onChange={event => updateLru(lru.id, { eta: Math.max(0.1, Number(event.target.value) || 0.1) })} aria-label={`Eta for row ${index + 1}`}/></td>
                      <td><input type="number" min="0.1" step="0.1" value={lru.beta} onChange={event => updateLru(lru.id, { beta: Math.max(0.1, Number(event.target.value) || 0.1) })} aria-label={`Beta for row ${index + 1}`}/></td>
                      <td className="weibull-material-calc">{life.fpmh.toFixed(4)}</td>
                      <td className="weibull-material-calc">{life.reliability.toFixed(4)}</td>
                      <td className="weibull-material-calc">{life.mtbfYears.toFixed(4)}</td>
                      <td className="weibull-material-policy">
                        <input type="number" min="0.1" step="0.1" value={lru.replaceAt} onChange={event => updateLru(lru.id, { replaceAt: Math.max(0.1, Number(event.target.value) || 0.1) })} title={Number.isFinite(life.reliabilityAtReplace) ? `Survival at replacement: ${life.reliabilityAtReplace.toFixed(1)}%` : "Planned replacement age"} aria-label={`Replace at for row ${index + 1}`}/>
                        <small>{Number.isFinite(life.reliabilityAtReplace) ? `~${life.reliabilityAtReplace.toFixed(0)}% R` : ""}</small>
                      </td>
                      <td><button type="button" className="weibull-row-delete" onClick={() => removeLru(lru.id)} aria-label={`Remove row ${index + 1}`}><Icons.trash/></button></td>
                    </tr>
                  ))}
                  {!materialRows.length && <tr><td colSpan={10} className="weibull-table-empty">No LRUs yet. Add one or load the example table.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="weibull-formula-reference">
            <div className="weibull-material-sheet-head"><span>?</span><strong>Weibull analysis ? key formulas</strong></div>
            <div className="weibull-formula-grid">
              <div><b>Failure rate ?(t)</b><code>?(t) = (? ? ?) ? (t ? ?)<sup>??1</sup></code><p>Failures per year at time t</p></div>
              <div><b>Reliability R(t)</b><code>R(t) = e<sup>?[(t/?)^?]</sup></code><p>Probability of surviving till time t</p></div>
              <div><b>FPMH conversion</b><code>FPMH = ?(t) ? 8760 ? 10,000,000</code><p>Convert yearly rate to failures per million hours</p></div>
              <div><b>MTBF</b><code>MTBF = 1 ? ?(t) &nbsp;[in years]</code><p>Mean time between failures</p></div>
              <div className="wide"><b>Where ? (Beta) ? shape parameter</b><p>? &gt; 1 wear-out/aging (your components) ? ? &lt; 1 early failure (infant mortality) ? ? = 1 exponential (constant failure rate) ? ? ? 2 mild aging ? ? ? 3?4 strong wear-out (rapid aging effect).</p></div>
              <div className="wide"><b>Where ? (Eta) ? scale parameter</b><p>Characteristic life: the expected/design life of the component in years. At t = ?, R(t) = e<sup>?1</sup> ? 36.8%.</p></div>
            </div>
          </section>

          <section className="weibull-material-sheet">
            <div className="weibull-material-sheet-head"><span>?</span><strong>Beta (?) values used</strong></div>
            <div className="weibull-material-scroll">
              <table className="weibull-material-table weibull-library-table">
                <colgroup><col style={{ width: 40 }}/><col/><col style={{ width: 74 }}/><col style={{ width: 140 }}/><col style={{ width: 108 }}/><col style={{ width: 100 }}/><col/></colgroup>
                <thead><tr><th>Sr.</th><th>Material / component type</th><th>? value</th><th>Failure mode</th><th>Life range</th><th>? used (years)</th><th>Reason</th></tr></thead>
                <tbody>
                  {WEIBULL_MATERIAL_LIBRARY.map((entry, index) => (
                    <tr key={entry.key}>
                      <td className="weibull-material-index">{index + 1}</td>
                      <td>{entry.material}</td>
                      <td className="weibull-material-calc">{entry.beta}</td>
                      <td>{entry.failureMode}</td>
                      <td>{entry.lifeRange}</td>
                      <td className="weibull-material-calc">{entry.eta}</td>
                      <td>{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
      <div className="weibull-layout">
        <aside className="weibull-input-panel">
          <div className="weibull-panel-head">
            <div><strong>Life data</strong><span>IEC 61649 Clause 7 ? one row per distinct time</span></div>
            <div className="weibull-example-buttons" aria-label="Load an example data set">
              <button type="button" onClick={() => loadExample("annexE")} title="Complete data, IEC 61649 Annex E">Annex E</button>
              <button type="button" onClick={() => loadExample("annexB")} title="Singly censored data, IEC 61649 Annex B">Annex B</button>
              <button type="button" onClick={() => loadExample("weibayes")} title="Known-shape sample">WeiBayes</button>
            </div>
          </div>

          <div className="weibull-table-scroll">
            <table className="weibull-data-table">
              <colgroup>{lifeDataColumnWidths.map((width, index) => <col key={`life-data-col-${index}`} style={{ width }}/>)}</colgroup>
              <thead>
                <tr>{["#", "Time t", "Qty", "Status", ""].map((label, index) => <ResizableWeibullHeader
                  key={`life-data-heading-${index}`}
                  index={index}
                  width={lifeDataColumnWidths[index]}
                  defaultWidth={LIFE_DATA_COLUMN_DEFAULTS[index]}
                  onResize={(column, width) => setLifeDataColumnWidths(current => current.map((value, currentIndex) => currentIndex === column ? width : value))}
                  ariaLabel={label || "Remove"}
                >{label}</ResizableWeibullHeader>)}</tr>
              </thead>
              <tbody>
                {record.points.map((point, index) => (
                  <tr key={point.id} className={point.suspended ? "suspended" : ""}>
                    <td className="row-index">{index + 1}</td>
                    <td><input type="number" min="0" step="any" value={Number.isFinite(point.time) ? point.time : ""} onChange={event => updatePoint(point.id, { time: Number(event.target.value) })} aria-label={`Time for row ${index + 1}`}/></td>
                    <td><input type="number" min="1" step="1" value={point.quantity} onChange={event => updatePoint(point.id, { quantity: Math.max(1, Math.round(Number(event.target.value) || 1)) })} aria-label={`Quantity for row ${index + 1}`}/></td>
                    <td>
                      <select className={point.suspended ? "status-suspended" : "status-failure"} value={point.suspended ? "suspended" : "failure"} onChange={event => updatePoint(point.id, { suspended: event.target.value === "suspended" })} aria-label={`Status for row ${index + 1}`}>
                        <option value="failure">Failure</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                    <td><button type="button" className="weibull-row-delete" onClick={() => removePoint(point.id)} aria-label={`Remove row ${index + 1}`}><Icons.trash/></button></td>
                  </tr>
                ))}
                {!record.points.length && <tr><td colSpan={5} className="weibull-table-empty">No life data yet. Add a row or load an example.</td></tr>}
              </tbody>
            </table>
          </div>

          <button type="button" className="weibull-add-row" onClick={addPoint}><Icons.plus/><span>Add life</span></button>

          <div className="weibull-input-footer">
            <label>Mission times
              <input value={missionInput} onChange={event => setMissionInput(event.target.value)} placeholder="e.g. 1000, 5000, 10000"/>
            </label>
            <p>Comma-separated times used for the reliability table. Enter 0 to include the start of life.</p>
          </div>
        </aside>

        <div className="weibull-main">
          <section className="weibull-plot-panel">
            <div className="weibull-panel-head">
              <div><strong>Weibull probability plot</strong><span>ln(t ? t?) against ln[?ln(1 ? F)] ? Benard median ranks</span></div>
              <span className={`weibull-method-badge ${record.options.method}`}>{record.options.method.toUpperCase()}</span>
            </div>
            <WeibullPlot analysis={analysis} suspendedTimes={suspendedTimes}/>
          </section>

          <section className="weibull-results-panel">
            {analysis.ok ? (
              <>
                <div className="weibull-result-cards">
                  <article className="weibull-result-card primary">
                    <span>Shape ?</span>
                    <strong>{analysis.beta.toFixed(4)}</strong>
                    <small>{formatInterval(analysis.betaCi, confidence)}</small>
                  </article>
                  <article className="weibull-result-card primary">
                    <span>Scale ?</span>
                    <strong>{formatValue(analysis.eta)}</strong>
                    <small>{formatInterval(analysis.etaCi, confidence, analysis.method === "weibayes")}</small>
                  </article>
                  {analysis.t0 > 0 && (
                    <article className="weibull-result-card">
                      <span>Location t?</span>
                      <strong>{formatValue(analysis.t0)}</strong>
                      <small>failure-free life</small>
                    </article>
                  )}
                  <article className="weibull-result-card">
                    <span>MTTF</span>
                    <strong>{formatValue(analysis.mttf)}</strong>
                    <small>Eq. 19</small>
                  </article>
                  <article className="weibull-result-card">
                    <span>B10 life</span>
                    <strong>{formatValue(analysis.bLives.find(entry => entry.label === "B10")?.value ?? Number.NaN)}</strong>
                    <small>Eq. 20</small>
                  </article>
                  <article className="weibull-result-card">
                    <span>Plot fit r?</span>
                    <strong>{analysis.r2.toFixed(4)}</strong>
                    <small>{METHOD_LABELS[analysis.method]}</small>
                  </article>
                </div>

                <div className={`weibull-regime ${analysis.regime}`}>
                  <span className={`weibull-regime-chip ${analysis.regime}`}>{analysis.regimeLabel}</span>
                  <p>{analysis.regimeDescription}</p>
                </div>

                <div className="weibull-result-grid">
                  <section className="weibull-table-card">
                    <h3>B-lives ? Eq. 20</h3>
                    <table>
                      <thead><tr><th>Percentile</th><th>Life</th><th>F(t)</th></tr></thead>
                      <tbody>
                        {analysis.bLives.map(entry => (
                          <tr key={entry.label}><td>{entry.label}</td><td>{formatValue(entry.value)}</td><td>{(entry.p * 100).toFixed(1)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </section>

                  <section className="weibull-table-card">
                    <h3>Reliability at mission time</h3>
                    {analysis.reliability.length ? (
                      <table>
                        <thead><tr><th>t</th><th>R(t)</th><th>h(t)</th><th>H(t)</th></tr></thead>
                        <tbody>
                          {analysis.reliability.map(point => (
                            <tr key={point.time}>
                              <td>{formatValue(point.time)}</td>
                              <td>{(point.reliability * 100).toFixed(4)}%</td>
                              <td>{point.hazard.toExponential(2)}</td>
                              <td>{point.cumulativeHazard.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <p className="weibull-table-note">Enter one or more mission times to calculate R(t), h(t) and H(t).</p>}
                  </section>
                </div>

                {analysis.warnings.length > 0 && (
                  <div className="weibull-warnings" role="status">
                    <strong>Model checks</strong>
                    <ul>{analysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
                  </div>
                )}

                <details className="weibull-method-note">
                  <summary>Method and formulas used</summary>
                  <p><b>{METHOD_LABELS[analysis.method]}.</b>{" "}
                    {analysis.method === "mrr"
                      ? "A straight line is fitted to the median-rank points using Benard plotting positions (Eq. 6) and adjusted ranks for suspensions (Eq. 7). X-on-Y minimises horizontal deviations; Y-on-X minimises vertical deviations. MRR is preferred for small samples and low percentiles (Clause 11)."
                      : analysis.method === "mle"
                        ? "The shape parameter solves the maximum-likelihood equation (Eq. 17) and the scale follows from Eq. 18. MLE is intended for singly censored samples with at least 10 relevant failures; parameter intervals use the observed Fisher information and are approximate."
                        : "The shape parameter is fixed from prior knowledge and the scale follows from the WeiBayes equation (Eq. 48). With zero failures, ? uses the fictitious failure count from Clause 12.3 and is reported as a lower-bound estimate."}
                  </p>
                  <p>B-lives use t(F) = t? + ??[?ln(1 ? F)]<sup>1/?</sup> (Eq. 20). MTTF uses t? + ???(1 + 1/?) (Eq. 19). The reliability function is R(t) = exp&#123;?[(t ? t?)/?]<sup>?</sup>&#125; and the hazard is h(t) = (?/?)?[(t ? t?)/?]<sup>??1</sup> (Eqs. 2?3).</p>
                  <p>Plotting bounds are Beta-binomial intervals (Eqs. 39?40) at the 5 % and 95 % plotting positions. Parameter intervals are approximate and should be interpreted with the sample size, the number of failures and the censoring pattern in mind.</p>
                </details>
              </>
            ) : (
              <div className="weibull-empty">
                <strong>No Weibull result</strong>
                <p>{analysis.error}</p>
              </div>
            )}
          </section>
        </div>
      </div>
      )}

      <SaveDialog
        open={saveOpen}
        kind="weibull"
        defaultFolder={saveFolder}
        defaultName={saveName}
        data={snapshot()}
        onClose={() => setSaveOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}
