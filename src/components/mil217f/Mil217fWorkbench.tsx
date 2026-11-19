"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "@/lib/icons";
import {
  analyzeMil217f,
  defaultMil217fInputs,
  formatMil217fRate,
  mil217fFactorResults,
  mil217fModel,
  MIL217F_ENVIRONMENTS,
  MIL217F_METHODS,
  MIL217F_MODELS,
  type Mil217fMethod,
  type Mil217fModelDef,
  type Mil217fOptions,
  type Mil217fPart,
  type Mil217fValues,
} from "@/engine/mil217f";
import { isMil217fDocument, readMil217f, saveMil217f, type Mil217fDocument, type Asset } from "@/data/workspace";
import { loadDocument, queueDocumentSave, saveDocument } from "@/services/documents/client";
import { loadProjectRegister } from "@/services/documents/project-register";
import SaveDialog from "@/components/documents/SaveDialog";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const DEFAULT_OPTIONS: Mil217fOptions = { method: "stress", environment: "GB", ambient: 40, temperatureRise: 0, missionTime: 8760 };

function defaultDocument(): Mil217fDocument {
  return { formulaVersion: "mil217f-notice2-v1", parts: [], options: { ...DEFAULT_OPTIONS } };
}

/** Best-effort map from a Data Register description to a handbook part family. */
function guessModelId(description: string, system = ""): string {
  const text = `${description} ${system}`.toLowerCase();
  if (/microprocessor|microcontroller|controller|\bcpu\b|\bdsp\b/.test(text)) return "microcircuit-processor";
  if (/memory|\bram\b|\brom\b|eeprom|flash/.test(text)) return "microcircuit-memory";
  if (/hybrid/.test(text)) return "hybrid";
  if (/microcircuit|\bic\b|integrated circuit|\bgate\b|logic|op-?amp/.test(text)) return "microcircuit-logic";
  if (/tantalum/.test(text)) return "capacitor-tantalum";
  if (/alumin(i)?um/.test(text)) return "capacitor-aluminum";
  if (/mica/.test(text)) return "capacitor-mica";
  if (/film|polyester|polypropylene/.test(text)) return "capacitor-film";
  if (/glass/.test(text)) return "capacitor-glass";
  if (/capacitor|\bcap\b/.test(text)) return "capacitor-ceramic";
  if (/resistor|\bres\b/.test(text)) return /variable|potentiometer|trimmer/.test(text) ? "resistor-variable" : "resistor-film";
  if (/thermistor/.test(text)) return "resistor-thermistor";
  if (/transformer/.test(text)) return "transformer";
  if (/inductor|choke|coil/.test(text)) return "inductor";
  if (/\bled\b|light.?emitting/.test(text)) return "led";
  if (/zener|reference diode/.test(text)) return "diode-zener";
  if (/diode|rectifier/.test(text)) return /high.?frequency|schottky|fast/.test(text) ? "diode-hf" : "diode-lf";
  if (/mosfet|\bfet\b|field.?effect/.test(text)) return "fet";
  if (/thyristor|\bscr\b|triac/.test(text)) return "thyristor";
  if (/transistor/.test(text)) return /power/.test(text) ? "transistor-power" : /high.?frequency|\brf\b/.test(text) ? "transistor-hf" : "transistor-lf";
  if (/relay/.test(text)) return "relay";
  if (/switch/.test(text)) return "switch";
  if (/connector|terminal|plug/.test(text)) return "connector";
  if (/pcb|printed circuit|board/.test(text)) return "pcb";
  if (/crystal|oscillator/.test(text)) return "crystal";
  if (/fuse/.test(text)) return "fuse";
  if (/lamp|indicator/.test(text)) return "lamp";
  return "generic";
}

function createPart(asset: Asset): Mil217fPart {
  const modelId = guessModelId(asset.description, asset.system);
  const model = mil217fModel(modelId) ?? MIL217F_MODELS[0];
  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    reference: asset.tag,
    description: asset.description,
    modelId: model.id,
    quantity: Number.isFinite(asset.qty) && asset.qty > 0 ? asset.qty : 1,
    inputs: defaultMil217fInputs(model),
  };
}

function newManualPart(): Mil217fPart {
  const model = mil217fModel("resistor-film") ?? MIL217F_MODELS[0];
  return {
    id: crypto.randomUUID(),
    reference: "NEW-PART",
    description: "New electronic part",
    modelId: model.id,
    quantity: 1,
    inputs: defaultMil217fInputs(model),
  };
}

function formatFit(value: number) {
  if (!Number.isFinite(value)) return "?";
  if (value === 0) return "0";
  if (value < 0.01) return value.toExponential(2);
  if (value >= 1000) return Math.round(value).toLocaleString("en-US");
  return value.toFixed(2);
}

function formatMtbf(hours: number) {
  if (!Number.isFinite(hours)) return "?";
  if (hours >= 1e9) return `${(hours / 1e9).toFixed(2)} ? 10? h`;
  if (hours >= 1e6) return `${(hours / 1e6).toFixed(2)} ? 10? h`;
  if (hours >= 1e3) return `${Math.round(hours).toLocaleString("en-US")} h`;
  return `${hours.toFixed(1)} h`;
}

type Props = {
  documentPath?: string;
  onReportChange?: (rows: ExportRow[]) => void;
};

export default function Mil217fWorkbench({ documentPath, onReportChange }: Props) {
  const [record, setRecord] = useState<Mil217fDocument>(() => defaultDocument());
  const [register, setRegister] = useState<Asset[]>([]);
  const [registerSource, setRegisterSource] = useState("Loading Data Register?");
  const [registerLoading, setRegisterLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [saveTarget, setSaveTarget] = useState<string | null>(documentPath ?? null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const hydratedPath = useRef<string | null>(null);

  useEffect(() => {
    setSaveTarget(documentPath ?? null);
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    setHydrated(false);

    const apply = (next: Mil217fDocument) => {
      setRecord({ ...next, options: { ...DEFAULT_OPTIONS, ...next.options } });
    };

    void (async () => {
      if (!documentPath) {
        const saved = await readMil217f();
        if (!active) return;
        apply(saved ?? defaultDocument());
        hydratedPath.current = "";
        setHydrated(true);
        const response = await fetch("/api/save-locations?kind=mil217f", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { mil217f?: string | null } } : null;
        const remembered = payload?.locations?.mil217f;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isMil217fDocument(remote)) return;
        apply(remote);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
      } else {
        hydratedPath.current = null;
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isMil217fDocument(remote)) apply(remote);
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

  const analysis = useMemo(() => analyzeMil217f(record.parts, record.options), [record.parts, record.options]);
  const selected = record.parts.find(part => part.id === selectedId) ?? record.parts[0] ?? null;
  const selectedModel = selected ? mil217fModel(selected.modelId) : undefined;
  const selectedResult = selected ? analysis.results.find(result => result.part.id === selected.id) : undefined;
  const selectedFactors = useMemo(
    () => (selected && selectedModel ? mil217fFactorResults(selectedModel, { ...defaultMil217fInputs(selectedModel), ...selected.inputs }) : []),
    [selected, selectedModel],
  );

  useEffect(() => {
    if (!record.parts.length) { if (selectedId) setSelectedId(""); return; }
    if (!record.parts.some(part => part.id === selectedId)) setSelectedId(record.parts[0].id);
  }, [record.parts, selectedId]);

  function snapshot(): Mil217fDocument {
    return { ...record };
  }

  useEffect(() => {
    if (!hydrated) return;
    const next = snapshot();
    void saveMil217f(next, saveTarget ?? undefined);
    if (saveTarget && hydratedPath.current === saveTarget) queueDocumentSave(saveTarget, next);
  }, [record, hydrated, saveTarget]);

  useEffect(() => {
    const rows: ExportRow[] = [
      { parameter: "Analysis method", value: record.options.method === "count" ? "Parts Count" : "Parts Stress", detail: "MIL-HDBK-217F Notice 2" },
      { parameter: "Environment", value: record.options.environment, detail: MIL217F_ENVIRONMENTS.find(entry => entry.value === record.options.environment)?.label ?? "" },
      { parameter: "Ambient temperature", value: `${record.options.ambient} ?C`, detail: `Junction rise ${record.options.temperatureRise} ?C ? ${record.options.ambient + record.options.temperatureRise} ?C` },
      { parameter: "Total failure rate ?", value: `${formatMil217fRate(analysis.totalRate)} /h`, detail: "? n? ? ?p?" },
      { parameter: "Total FIT", value: formatFit(analysis.totalFits), detail: "failures per 10? hours" },
      { parameter: "MTBF", value: formatMtbf(analysis.mtbf), detail: "1 / ?" },
      ...analysis.results.map(result => ({
        parameter: `${result.part.reference} ? ${result.model.name}`,
        value: `${formatMil217fRate(result.lambdaP * 1e-6)} /h`,
        detail: `?p = ${result.lambdaP.toExponential(4)} ?10??/h ? n = ${result.quantity} ? contribution ${formatFit(result.contribution * 1e3)} FIT`,
      })),
    ];
    onReportChange?.(rows);
  }, [analysis, record.options, onReportChange]);

  function updateOptions(patch: Partial<Mil217fOptions>) {
    setRecord(current => ({ ...current, options: { ...current.options, ...patch } }));
  }

  function updatePart(id: string, patch: Partial<Mil217fPart>) {
    setRecord(current => ({ ...current, parts: current.parts.map(part => part.id === id ? { ...part, ...patch } : part) }));
  }

  function updateModel(id: string, modelId: string) {
    const model = mil217fModel(modelId);
    if (!model) return;
    updatePart(id, { modelId, inputs: defaultMil217fInputs(model) });
  }

  function updateFactor(id: string, key: string, value: string | number) {
    setRecord(current => ({
      ...current,
      parts: current.parts.map(part => part.id === id ? { ...part, inputs: { ...part.inputs, [key]: value } } : part),
    }));
  }

  function addPart() {
    const part = newManualPart();
    setRecord(current => ({ ...current, parts: [...current.parts, part] }));
    setSelectedId(part.id);
  }

  function removePart(id: string) {
    setRecord(current => ({ ...current, parts: current.parts.filter(part => part.id !== id) }));
  }

  function importRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.parts.filter(part => part.assetId).map(part => [part.assetId as string, part]));
      const manual = current.parts.filter(part => !part.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) return { ...existing, reference: asset.tag, description: asset.description, quantity: Number.isFinite(asset.qty) && asset.qty > 0 ? asset.qty : 1 };
        return createPart(asset);
      });
      return { ...current, parts: [...fromRegister, ...manual] };
    });
    setNotice(`Imported ${register.length} component${register.length === 1 ? "" : "s"} from the Data Register.`);
  }

  function syncRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.parts.filter(part => part.assetId).map(part => [part.assetId as string, part]));
      const manual = current.parts.filter(part => !part.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) return { ...existing, reference: asset.tag, description: asset.description, quantity: Number.isFinite(asset.qty) && asset.qty > 0 ? asset.qty : 1 };
        return createPart(asset);
      });
      return { ...current, parts: [...fromRegister, ...manual] };
    });
    setNotice(`Synced with the Data Register ? ${register.length} component${register.length === 1 ? "" : "s"}.`);
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
  const saveName = saveTarget?.split("/").pop() || "Untitled MIL-217F";
  const totalParts = record.parts.reduce((sum, part) => sum + part.quantity, 0);
  const worstCategory = analysis.categories.slice().sort((first, second) => second.rate - first.rate)[0];

  return (
    <section className="mil217f-workbench">
      <header className="mil217f-toolbar">
        <div className="mil217f-method-group" role="group" aria-label="Analysis method">
          {MIL217F_METHODS.map(method => (
            <button key={method.value} type="button" className={record.options.method === method.value ? "active" : ""} onClick={() => updateOptions({ method: method.value as Mil217fMethod })} title={method.hint}>
              {method.value === "stress" ? "Parts stress" : "Parts count"}
            </button>
          ))}
        </div>

        <label className="mil217f-inline-field">Environment
          <select value={record.options.environment} onChange={event => updateOptions({ environment: event.target.value })}>
            {MIL217F_ENVIRONMENTS.map(environment => <option key={environment.value} value={environment.value}>{environment.label}</option>)}
          </select>
        </label>

        <label className="mil217f-inline-field">Ambient ?C
          <input type="number" step="1" value={record.options.ambient} onChange={event => updateOptions({ ambient: Number(event.target.value) })}/>
        </label>

        <label className="mil217f-inline-field">?T ?C
          <input type="number" step="1" value={record.options.temperatureRise} onChange={event => updateOptions({ temperatureRise: Number(event.target.value) })}/>
        </label>

        <label className="mil217f-inline-field">Mission h
          <input type="number" min="1" step="1" value={record.options.missionTime} onChange={event => updateOptions({ missionTime: Math.max(1, Number(event.target.value) || 1) })}/>
        </label>

        <span className="mil217f-toolbar-spacer"/>

        <button type="button" className="mil217f-button" onClick={syncRegister} disabled={registerLoading} title={registerSource}><Icons.link/><span>Sync register</span></button>
        <button type="button" className="mil217f-button" onClick={() => void saveNow()} disabled={saving}><Icons.save/><span>{saving ? "Saving?" : "Save"}</span></button>
        <button type="button" className="mil217f-button primary" onClick={() => setSaveOpen(true)}><Icons.download/><span>Save as</span></button>
      </header>

      <div className="mil217f-statusbar">
        <span>{totalParts} part{totalParts === 1 ? "" : "s"} ? {record.parts.length} line{record.parts.length === 1 ? "" : "s"}</span>
        <span>{registerSource}</span>
        <span>{saving ? "Saving?" : saveTarget ? `Saved to ${saveName}` : "Not saved to a project file"}</span>
        {notice && <button type="button" className="mil217f-notice" onClick={() => setNotice("")}>{notice} ?</button>}
      </div>

      <div className="mil217f-layout">
        <aside className="mil217f-parts-panel">
          <div className="mil217f-panel-head">
            <div><strong>Parts list</strong><span>Originated from the Data Register</span></div>
            <div className="mil217f-head-actions">
              <button type="button" onClick={importRegister} disabled={registerLoading} title="Add the project Data Register components to this prediction">Import</button>
              <button type="button" onClick={addPart} title="Add a manual part"><Icons.plus/></button>
            </div>
          </div>

          <div className="mil217f-table-scroll">
            <table className="mil217f-parts-table">
              <thead>
                <tr><th>Reference</th><th>Model</th><th>Qty</th><th>?p ?10??/h</th><th aria-label="Remove"/></tr>
              </thead>
              <tbody>
                {record.parts.map(part => {
                  const result = analysis.results.find(entry => entry.part.id === part.id);
                  return (
                    <tr key={part.id} className={selected?.id === part.id ? "selected" : ""} onClick={() => setSelectedId(part.id)}>
                      <td><input value={part.reference} onChange={event => updatePart(part.id, { reference: event.target.value })} aria-label="Reference" onClick={event => event.stopPropagation()}/></td>
                      <td>
                        <select value={part.modelId} onChange={event => updateModel(part.id, event.target.value)} aria-label="Part model" onClick={event => event.stopPropagation()}>
                          {MIL217F_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="1" step="1" value={part.quantity} onChange={event => updatePart(part.id, { quantity: Math.max(1, Math.round(Number(event.target.value) || 1)) })} aria-label="Quantity" onClick={event => event.stopPropagation()}/></td>
                      <td className="computed">{result ? result.lambdaP.toExponential(3) : "?"}</td>
                      <td><button type="button" className="mil217f-row-delete" onClick={event => { event.stopPropagation(); removePart(part.id); }} aria-label={`Remove ${part.reference}`}><Icons.trash/></button></td>
                    </tr>
                  );
                })}
                {!record.parts.length && <tr><td colSpan={5} className="mil217f-table-empty">No parts yet. Import the Data Register or add a part.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mil217f-input-footer">
            <p>Each line links to a Data Register asset by id. The handbook model and ?-factors are stored with this prediction.</p>
          </div>
        </aside>

        <div className="mil217f-main">
          <section className="mil217f-summary">
            <article className="mil217f-result-card primary">
              <span>Total failure rate ?</span>
              <strong>{formatMil217fRate(analysis.totalRate)}</strong>
              <small>failures per hour</small>
            </article>
            <article className="mil217f-result-card primary">
              <span>Total FIT</span>
              <strong>{formatFit(analysis.totalFits)}</strong>
              <small>failures per 10? h</small>
            </article>
            <article className="mil217f-result-card">
              <span>MTBF</span>
              <strong>{formatMtbf(analysis.mtbf)}</strong>
              <small>1 / ?</small>
            </article>
            <article className="mil217f-result-card">
              <span>Parts / lines</span>
              <strong>{totalParts} / {record.parts.length}</strong>
              <small>quantity / rows</small>
            </article>
            <article className="mil217f-result-card">
              <span>Mission</span>
              <strong>{record.options.missionTime.toLocaleString("en-US")} h</strong>
              <small>{record.options.method === "count" ? "Parts count" : "Parts stress"} ? {record.options.environment}</small>
            </article>
          </section>

          <div className="mil217f-result-grid">
            <section className="mil217f-card">
              <h3>Failure rate by category</h3>
              {analysis.categories.length ? (
                <table className="mil217f-mini-table">
                  <thead><tr><th>Category</th><th>? (/h)</th><th>Share</th></tr></thead>
                  <tbody>
                    {analysis.categories.slice().sort((first, second) => second.rate - first.rate).map(category => (
                      <tr key={category.category}>
                        <td>{category.category}</td>
                        <td>{category.rate.toExponential(3)}</td>
                        <td>{analysis.totalRate > 0 ? `${((category.rate / analysis.totalRate) * 100).toFixed(1)}%` : "?"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="mil217f-note">Add parts to see the category breakdown.</p>}
              {worstCategory && analysis.totalRate > 0 && (
                <p className="mil217f-note">Largest contributor: <b>{worstCategory.category}</b> at {((worstCategory.rate / analysis.totalRate) * 100).toFixed(1)}% of the predicted rate.</p>
              )}
            </section>

            <section className="mil217f-card">
              <h3>Selected part ? {selected ? selected.reference : "none"}</h3>
              {selected && selectedModel && selectedResult ? (
                <>
                  <div className="mil217f-equation">
                    <span className="mil217f-section-badge">? {selectedModel.section}</span>
                    <code>{selectedModel.equation}</code>
                    <p>{selectedModel.description}</p>
                  </div>

                  <div className="mil217f-model-facts">
                    <span>{record.options.method === "count" ? "?g" : "?b"} <b>{selectedResult.lambdaB.toExponential(3)} ?10??/h</b></span>
                    <span>Ea <b>{selectedModel.activationEnergy.toFixed(2)} eV</b></span>
                    <span>Tj <b>{selectedResult.temperature.toFixed(0)} ?C</b></span>
                    <span>?T <b>{selectedResult.piT.toFixed(4)}</b></span>
                    <span>?p <b>{selectedResult.lambdaP.toExponential(4)} ?10??/h</b></span>
                  </div>

                  <div className="mil217f-factor-list">
                    {selectedFactors.map(factor => {
                      const def = selectedModel.factors.find(entry => entry.key === factor.key);
                      if (!def) return null;
                      const raw = selected.inputs[def.key] ?? def.default;
                      return (
                        <label key={def.key} className="mil217f-factor" title={def.hint}>
                          <span>{def.label}{def.unit ? ` (${def.unit})` : ""}</span>
                          {def.kind === "select" ? (
                            <select value={String(raw)} onChange={event => updateFactor(selected.id, def.key, event.target.value)}>
                              {def.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          ) : (
                            <input type="number" min={def.min} max={def.max} step={def.step ?? 0.01} value={Number(raw)} onChange={event => updateFactor(selected.id, def.key, Number(event.target.value))}/>
                          )}
                          <b>?{factor.effective.toFixed(4)}</b>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : <p className="mil217f-note">Select a part to edit its handbook model and ?-factors.</p>}
            </section>
          </div>

          <section className="mil217f-card mil217f-detail-card">
            <h3>Part results</h3>
            {analysis.results.length ? (
              <div className="mil217f-table-scroll">
                <table className="mil217f-mini-table">
                  <thead><tr><th>Reference</th><th>Model</th><th>Qty</th><th>?p (10??/h)</th><th>Contribution (10??/h)</th><th>FIT</th></tr></thead>
                  <tbody>
                    {analysis.results.map(result => (
                      <tr key={result.part.id}>
                        <td>{result.part.reference}</td>
                        <td>{result.model.name}</td>
                        <td>{result.quantity}</td>
                        <td>{result.lambdaP.toExponential(4)}</td>
                        <td>{result.contribution.toExponential(4)}</td>
                        <td>{formatFit(result.contribution * 1e3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mil217f-note">No parts to report yet.</p>}
          </section>

          {analysis.warnings.length > 0 && (
            <div className="mil217f-warnings" role="status">
              <strong>Model checks</strong>
              <ul>{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}

          <details className="mil217f-method-note">
            <summary>Method and formulas used</summary>
            <p><b>MIL-HDBK-217F Notice 2.</b> Parts-stress analysis computes each part's failure rate from its base rate (?b or ?g) multiplied by the temperature factor ?T and the part-specific ? factors, then by ?Q and ?E. Parts-count analysis uses the generic rate ?g ? ?Q ? ?E for early estimates.</p>
            <p>Temperature factor: ?T = exp[?Ea/k ? (1/Tj ? 1/298.15)], with k = 8.617 ? 10?? eV/K and Tj in kelvin. Junction temperature Tj = ambient + ?T. Microcircuits apply the handbook's 0.1 ? ?T term inside the model.</p>
            <p>Total failure rate ? = ? n? ? ?p? in failures per 10? hours, converted to failures/hour at the boundary. MTBF = 1 / ?. FIT = ? ? 10?. The ?-factor defaults are the handbook's generic values ? set the exact table values for the part's specification, quality level and environment for a formal prediction.</p>
          </details>
        </div>
      </div>

      <SaveDialog
        open={saveOpen}
        kind="mil217f"
        defaultFolder={saveFolder}
        defaultName={saveName}
        data={snapshot()}
        onClose={() => setSaveOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}
