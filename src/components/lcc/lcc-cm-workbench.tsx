"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeLcc,
  DEFAULT_LCC_INPUTS,
  defaultCmProfile,
  emptyCmAsset,
  cmAssetFromRegister,
  type LccCmAsset,
  type LccCmDocument,
  type LccCmProfile,
  type LccInputs,
  type LccPeriodKey,
} from "@/engine/lcc";
import { isLccCmDocument, loadProjectRegister, readLccCm, saveLccCm, type Asset } from "@/data/workspace";
import { loadDocument, queueDocumentSave, saveDocument } from "@/services/documents/client";
import { Icons } from "@/lib/icons";
import { ModuleKpis } from "@/components/layout/header-kpis";
import SaveDialog from "@/components/documents/SaveDialog";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const PERIOD_OPTIONS: { key: LccPeriodKey; label: string }[] = [
  { key: "day", label: "1 day" },
  { key: "month", label: "1 month" },
  { key: "months6", label: "6 months" },
  { key: "year", label: "1 year" },
  { key: "years5", label: "5 years" },
  { key: "years10", label: "10 years" },
  { key: "years20", label: "20 years" },
  { key: "years35", label: "35 years" },
  { key: "custom", label: "Custom" },
];

function defaultDocument(): LccCmDocument {
  return { formulaVersion: "lcc-cm-iec60300-3-3-v1", inputs: { ...DEFAULT_LCC_INPUTS }, assets: [] };
}

function numberValue(value: string, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : minimum;
}

export default function LccCmWorkbench({ documentPath, onReportChange }: { documentPath?: string; onReportChange?: (rows: ExportRow[]) => void }) {
  const [record, setRecord] = useState<LccCmDocument>(defaultDocument);
  const [register, setRegister] = useState<Asset[]>([]);
  const [registerLoading, setRegisterLoading] = useState(true);
  const [saveTarget, setSaveTarget] = useState<string | null>(documentPath ?? null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const hydratedPath = useRef<string | null>(null);
  const autoSeeded = useRef(false);
  const [periodKey, setPeriodKey] = useState<LccPeriodKey>("year");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setSaveTarget(documentPath ?? null);
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    setHydrated(false);

    const apply = (next: LccCmDocument) => {
      setRecord({ ...next, inputs: { ...DEFAULT_LCC_INPUTS, ...next.inputs } });
    };

    void (async () => {
      if (!documentPath) {
        const saved = await readLccCm();
        if (!active) return;
        apply(saved ?? defaultDocument());
        hydratedPath.current = "";
        setHydrated(true);
        // Resume from the last location used by this module.
        const response = await fetch("/api/save-locations?kind=lcccm", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { lcccm?: string | null } } : null;
        const remembered = payload?.locations?.lcccm;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isLccCmDocument(remote)) return;
        apply(remote);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
      } else {
        hydratedPath.current = null;
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isLccCmDocument(remote)) apply(remote);
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
      setRegisterLoading(false);
    }).catch(() => {
      if (active) { setRegister([]); setRegisterLoading(false); }
    });
    return () => { active = false; };
  }, [documentPath]);

  const analysis = useMemo(() => analyzeLcc(record, "cm", periodKey), [record, periodKey]);

  useEffect(() => {
    if (!hydrated) return;
    const next = snapshot();
    void saveLccCm(next, saveTarget ?? undefined);
    if (saveTarget && hydratedPath.current === saveTarget) queueDocumentSave(saveTarget, next);
  }, [record, hydrated, saveTarget]);

  // A brand-new, unsaved document starts from the project Data Register.
  useEffect(() => {
    if (!hydrated || autoSeeded.current) return;
    if (hydratedPath.current !== "" || record.assets.length || !register.length) return;
    autoSeeded.current = true;
    setRecord(current => ({ ...current, assets: register.map(asset => cmAssetFromRegister(asset, current.inputs)) }));
    setNotice(`Imported ${register.length} asset${register.length === 1 ? "" : "s"} from the Data Register.`);
  }, [hydrated, register, record.assets.length]);

  useEffect(() => {
    const rows: ExportRow[] = analysis.assets.map(result => {
      const asset = record.assets.find(candidate => candidate.id === result.id);
      return {
        tag: result.tag,
        description: result.description,
        cm: asset
          ? `${asset.cm.crewSize} crew ? ${asset.cm.labourRate}/h ? parts ${asset.cm.partsCostPerRepair} ? delay ${asset.cm.logisticDelayHours}h`
          : "?",
        acquisition: result.acquisition.toFixed(2),
        npv: result.selectedNpv.toFixed(2),
      };
    });
    onReportChange?.(rows);
  }, [analysis, record.assets, onReportChange]);

  function snapshot(): LccCmDocument {
    return { ...record, inputs: { ...DEFAULT_LCC_INPUTS, ...record.inputs } };
  }

  function updateOptions(patch: Partial<LccInputs>) {
    setRecord(current => ({ ...current, inputs: { ...current.inputs, ...patch } }));
  }

  function updateAsset(id: string, patch: Partial<LccCmAsset>) {
    setRecord(current => ({
      ...current,
      assets: current.assets.map(asset => asset.id === id ? { ...asset, ...patch } : asset),
    }));
  }

  function updateProfile(id: string, patch: Partial<LccCmProfile>) {
    setRecord(current => ({
      ...current,
      assets: current.assets.map(asset => asset.id === id ? { ...asset, cm: { ...asset.cm, ...patch } } : asset),
    }));
  }

  function addAsset() {
    setRecord(current => {
      const asset = emptyCmAsset(current.inputs);
      return { ...current, assets: [...current.assets, { ...asset, tag: `ASSET-${current.assets.length + 1}` }] };
    });
  }

  function removeAsset(id: string) {
    setRecord(current => ({ ...current, assets: current.assets.filter(asset => asset.id !== id) }));
  }

  function importRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.assets.filter(asset => asset.assetId).map(asset => [asset.assetId as string, asset]));
      const manual = current.assets.filter(asset => !asset.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) {
          return {
            ...existing,
            tag: asset.tag,
            description: asset.description,
            system: asset.system,
            qty: Math.max(1, Math.round(asset.qty || 1)),
            lambda: asset.lambda,
            mttr: asset.mttr,
            criticality: asset.criticality,
          };
        }
        return cmAssetFromRegister(asset, current.inputs);
      });
      return { ...current, assets: [...fromRegister, ...manual] };
    });
    setNotice(`Imported ${register.length} asset${register.length === 1 ? "" : "s"} from the Data Register.`);
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
  const saveName = saveTarget?.split("/").pop() || "Untitled LCC-CM";

  function formatValue(value: number, digits = 2) {
    if (!Number.isFinite(value)) return "?";
    if (value === 0) return "0";
    const magnitude = Math.abs(value);
    if (magnitude >= 1e6 || magnitude < 1e-3) return value.toExponential(3);
    return value.toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function formatCurrency(value: number) {
    return formatValue(value);
  }

  return (
    <section className="lcc-cm-workbench">
      {analysis.ok && <ModuleKpis
        ariaLabel="Corrective maintenance life cycle cost headline results"
        metrics={[
          { symbol: "NPV", name: "Total life cycle cost", value: formatCurrency(analysis.selected.npv), primary: true },
          { symbol: "?C", name: "Undiscounted total", value: formatCurrency(analysis.selected.undiscounted), primary: true },
          { symbol: "EAC", name: "Equivalent annual cost", value: formatCurrency(analysis.selected.eac), unit: "/yr" },
          { symbol: "c/h", name: "Cost per operating hour", value: formatCurrency(analysis.selected.costPerOperatingHour) },
        ]}
      />}
      <header className="lcc-cm-toolbar">
        <label className="lcc-cm-inline-field">Discount %
          <select value={String(record.inputs.discountRate)} onChange={event => updateOptions({ discountRate: Number(event.target.value) })}>
            <option value="3">3%</option>
            <option value="4">4%</option>
            <option value="5">5%</option>
            <option value="7">7%</option>
            <option value="10">10%</option>
          </select>
        </label>

        <label className="lcc-cm-inline-field">Escalation %
          <select value={String(record.inputs.escalationRate)} onChange={event => updateOptions({ escalationRate: Number(event.target.value) })}>
            <option value="1">1%</option>
            <option value="2">2%</option>
            <option value="3">3%</option>
            <option value="5">5%</option>
          </select>
        </label>

        <label className="lcc-cm-inline-field">Horizon
          <select value={periodKey} onChange={event => setPeriodKey(event.target.value as LccPeriodKey)}>
            {PERIOD_OPTIONS.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}
          </select>
        </label>

        {periodKey === "custom" && (
          <label className="lcc-cm-inline-field">Custom years
            <input type="number" min="0.1" step="0.1" value={String(record.inputs.customHorizonYears)} onChange={event => updateOptions({ customHorizonYears: numberValue(event.target.value, 0.1) })}/>
          </label>
        )}

        <label className="lcc-cm-inline-field">Hours/yr
          <input type="number" min="0" step="1" value={String(record.inputs.operatingHoursPerYear)} onChange={event => updateOptions({ operatingHoursPerYear: numberValue(event.target.value) })} placeholder="e.g. 8760"/>
        </label>

        <label className="lcc-cm-inline-field">Overhead %
          <input type="number" min="0" step="1" value={String(record.inputs.overheadRate)} onChange={event => updateOptions({ overheadRate: numberValue(event.target.value) })}/>
        </label>

        <label className="lcc-cm-inline-field">Residual risk
          <input type="number" min="0" step="100" value={String(record.inputs.residualRiskPerYear)} onChange={event => updateOptions({ residualRiskPerYear: numberValue(event.target.value) })} placeholder="e.g. 0"/>
        </label>

        <span className="lcc-cm-toolbar-spacer"/>

        <button type="button" className="lcc-cm-button" onClick={addAsset} disabled={saving}>
          <Icons.plus/><span>Add Asset</span>
        </button>
        <button type="button" className="lcc-cm-button" onClick={() => void saveNow()} disabled={saving}>
          <Icons.save/><span>{saving ? "Saving?" : "Save"}</span>
        </button>
        <button type="button" className="lcc-cm-button primary" onClick={() => setSaveOpen(true)}>
          <Icons.download/><span>Save as</span>
        </button>
      </header>

      <div className="lcc-cm-statusbar">
        <span>{analysis.ok ? `${analysis.assets.length} asset${analysis.assets.length === 1 ? "" : "s"} ? Corrective Maintenance` : "No assets yet"}</span>
        <span>{saving ? "Saving?" : saveTarget ? `Linked to ${saveName}` : "Not saved to a project file"}</span>
        {notice && <button type="button" className="lcc-cm-notice" onClick={() => setNotice("")}>{notice} ?</button>}
      </div>

      <div className="lcc-cm-layout">
        <aside className="lcc-cm-input-panel">
          <div className="lcc-cm-panel-head">
            <div><strong>Assets</strong><span>Imported from the Data Register or added manually</span></div>
            <button type="button" className="lcc-cm-button small" onClick={importRegister} disabled={registerLoading}>
              <Icons.table/><span>{registerLoading ? "Loading?" : "Import"}</span>
            </button>
          </div>

          <div className="lcc-cm-table-scroll">
            <table className="lcc-cm-data-table">
              <colgroup>
                <col style={{ width: 26 }} />
                <col style={{ width: 76 }} />
                <col />
                <col style={{ width: 86 }} />
                <col style={{ width: 48 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 106 }} />
                <col style={{ width: 34 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tag</th>
                  <th>Description</th>
                  <th>System</th>
                  <th>Qty</th>
                  <th>? (1/h)</th>
                  <th>MTTR (h)</th>
                  <th>CM Profile</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {record.assets.map((asset, index) => (
                  <Fragment key={asset.id}>
                    <tr>
                      <td>{index + 1}</td>
                      <td>{asset.tag}</td>
                      <td><input type="text" value={asset.description} onChange={event => updateAsset(asset.id, { description: event.target.value })} aria-label={`Description for ${asset.tag}`}/></td>
                      <td>{asset.system}</td>
                      <td><input type="number" min="1" step="1" value={String(asset.qty)} onChange={event => updateAsset(asset.id, { qty: numberValue(event.target.value, 1) })} aria-label={`Quantity for ${asset.tag}`}/></td>
                      <td><input type="number" min="0" step="0.000001" value={String(asset.lambda)} onChange={event => updateAsset(asset.id, { lambda: numberValue(event.target.value) })} aria-label={`Failure rate for ${asset.tag}`}/></td>
                      <td><input type="number" min="0" step="0.1" value={String(asset.mttr)} onChange={event => updateAsset(asset.id, { mttr: numberValue(event.target.value) })} aria-label={`MTTR for ${asset.tag}`}/></td>
                      <td>
                        <button type="button" className="lcc-cm-task-toggle" onClick={() => setExpanded(expanded === asset.id ? null : asset.id)} aria-expanded={expanded === asset.id}>
                          {asset.cm.crewSize} crew ? {asset.cm.labourRate}/h {expanded === asset.id ? "?" : "?"}
                        </button>
                      </td>
                      <td><button type="button" className="lcc-cm-row-delete" onClick={() => removeAsset(asset.id)} aria-label={`Remove ${asset.tag}`}><Icons.trash/></button></td>
                    </tr>
                    {expanded === asset.id && (
                      <tr className="lcc-cm-task-row">
                        <td colSpan={9}>
                          <div className="lcc-cm-task-editor">
                            <fieldset>
                              <legend>Asset costs ({record.inputs.currency})</legend>
                              <label>Unit acquisition
                                <input type="number" min="0" step="100" value={String(asset.unitAcquisitionCost)} onChange={event => updateAsset(asset.id, { unitAcquisitionCost: numberValue(event.target.value) })}/>
                              </label>
                              <label>Installation
                                <input type="number" min="0" step="100" value={String(asset.installationCost)} onChange={event => updateAsset(asset.id, { installationCost: numberValue(event.target.value) })}/>
                              </label>
                              <label>Disposal
                                <input type="number" min="0" step="100" value={String(asset.disposalCost)} onChange={event => updateAsset(asset.id, { disposalCost: numberValue(event.target.value) })}/>
                              </label>
                              <label>Support / year
                                <input type="number" min="0" step="100" value={String(asset.supportCostPerYear)} onChange={event => updateAsset(asset.id, { supportCostPerYear: numberValue(event.target.value) })}/>
                              </label>
                            </fieldset>

                            <fieldset>
                              <legend>Corrective-maintenance profile</legend>
                              <label>Crew size
                                <input type="number" min="1" step="1" value={String(asset.cm.crewSize)} onChange={event => updateProfile(asset.id, { crewSize: numberValue(event.target.value, 1) })}/>
                              </label>
                              <label>Labour ?/h
                                <input type="number" min="0" step="1" value={String(asset.cm.labourRate)} onChange={event => updateProfile(asset.id, { labourRate: numberValue(event.target.value) })}/>
                              </label>
                              <label>Parts ? / repair
                                <input type="number" min="0" step="10" value={String(asset.cm.partsCostPerRepair)} onChange={event => updateProfile(asset.id, { partsCostPerRepair: numberValue(event.target.value) })}/>
                              </label>
                              <label>Downtime ?/h
                                <input type="number" min="0" step="10" value={String(asset.cm.downtimeCostPerHour)} onChange={event => updateProfile(asset.id, { downtimeCostPerHour: numberValue(event.target.value) })}/>
                              </label>
                              <label>Logistic delay h
                                <input type="number" min="0" step="0.5" value={String(asset.cm.logisticDelayHours)} onChange={event => updateProfile(asset.id, { logisticDelayHours: numberValue(event.target.value) })}/>
                              </label>
                              <label>Admin delay h
                                <input type="number" min="0" step="0.5" value={String(asset.cm.adminDelayHours)} onChange={event => updateProfile(asset.id, { adminDelayHours: numberValue(event.target.value) })}/>
                              </label>
                              <label>No-fault-found
                                <input type="number" min="0" max="1" step="0.01" value={String(asset.cm.noFaultFoundRate)} onChange={event => updateProfile(asset.id, { noFaultFoundRate: Math.min(1, numberValue(event.target.value)) })}/>
                              </label>
                              <label>Callout ?
                                <input type="number" min="0" step="10" value={String(asset.cm.calloutCost)} onChange={event => updateProfile(asset.id, { calloutCost: numberValue(event.target.value) })}/>
                              </label>
                              <label>Scrap rate
                                <input type="number" min="0" max="1" step="0.01" value={String(asset.cm.scrapRate)} onChange={event => updateProfile(asset.id, { scrapRate: Math.min(1, numberValue(event.target.value)) })}/>
                              </label>
                              <label>Replacement ?
                                <input type="number" min="0" step="100" value={String(asset.cm.replacementCost)} onChange={event => updateProfile(asset.id, { replacementCost: numberValue(event.target.value) })}/>
                              </label>
                            </fieldset>

                            <button type="button" className="lcc-cm-add-row" onClick={() => updateProfile(asset.id, defaultCmProfile(record.inputs))}>
                              <Icons.undo/><span> Reset profile to defaults</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!record.assets.length && <tr><td colSpan={9} className="lcc-cm-table-empty">No assets. Import the Data Register or add an asset manually.</td></tr>}
              </tbody>
            </table>
          </div>

          <button type="button" className="lcc-cm-add-row" onClick={addAsset}><Icons.plus/><span> Add asset</span></button>
        </aside>

        <div className="lcc-cm-main">
          <section className="lcc-cm-results-panel lcc-summary">
            {analysis.ok ? (
              <>
                <div className="lcc-cm-period-table">
                  <h3>LCC by selectable period</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Years</th>
                        <th>Undiscounted</th>
                        <th>NPV</th>
                        <th>EAC</th>
                        <th>per hour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.periods.map(period => (
                        <tr key={period.key}>
                          <td>{period.label}</td>
                          <td>{period.years.toFixed(2)}</td>
                          <td>{formatCurrency(period.undiscounted)}</td>
                          <td>{formatCurrency(period.npv)}</td>
                          <td>{formatCurrency(period.eac)}</td>
                          <td>{formatCurrency(period.costPerOperatingHour)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lcc-cm-categories">
                  <h3>Cost breakdown (NPV)</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>NPV ({record.inputs.currency})</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.categories.map(category => (
                        <tr key={category.key}>
                          <td>{category.label}</td>
                          <td>{formatCurrency(category.amount)}</td>
                          <td>{(category.share * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lcc-cm-stages">
                  <h3>Life-cycle stages</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>NPV ({record.inputs.currency})</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.stages.map(stage => (
                        <tr key={stage.key}>
                          <td>{stage.label}</td>
                          <td>{formatCurrency(stage.amount)}</td>
                          <td>{(stage.share * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {analysis.sensitivity.length > 0 && (
                  <div className="lcc-cm-sensitivity">
                    <h3>Sensitivity analysis</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Factor</th>
                          <th>NPV ({record.inputs.currency})</th>
                          <th>?</th>
                          <th>? %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.sensitivity.map(row => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td>{formatCurrency(row.npv)}</td>
                            <td>{formatCurrency(row.delta)}</td>
                            <td>{(row.deltaPct * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analysis.warnings.length > 0 && (
                  <div className="lcc-cm-warnings" role="status">
                    <strong>Model checks</strong>
                    <ul>{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                  </div>
                )}
              </>
            ) : (
              <div className="lcc-cm-empty">
                <strong>No LCC result</strong>
                <p>Import the Data Register or add an asset to start the corrective-maintenance life-cycle cost.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <SaveDialog
        open={saveOpen}
        kind="lcccm"
        defaultFolder={saveFolder}
        defaultName={saveName}
        data={snapshot()}
        onClose={() => setSaveOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}
