"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeSpares,
  DEFAULT_SPARES_INPUTS,
  emptySpare,
  recommendedServiceLevel,
  spareFromRegister,
  type SpareItem,
  type SpareItemResult,
  type SparesDocument,
  type SparesInputs,
} from "@/engine/spares";
import type { LccPeriodKey } from "@/engine/lcc";
import { isSparesDocument, loadProjectRegister, readSpares, saveSpares, type Asset } from "@/data/workspace";
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

function defaultDocument(): SparesDocument {
  return { formulaVersion: "spares-en50126-3-v1", inputs: { ...DEFAULT_SPARES_INPUTS }, items: [] };
}

function numberValue(value: string, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : minimum;
}

function itemFromRegister(asset: Asset, inputs: SparesInputs): SpareItem {
  const item = spareFromRegister(asset, inputs);
  return { ...item, serviceLevel: Math.max(item.serviceLevel, recommendedServiceLevel(item.criticality)) };
}

export default function SparesWorkbench({ documentPath, onReportChange }: { documentPath?: string; onReportChange?: (rows: ExportRow[]) => void }) {
  const [record, setRecord] = useState<SparesDocument>(defaultDocument);
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

    const apply = (next: SparesDocument) => {
      setRecord({ ...next, inputs: { ...DEFAULT_SPARES_INPUTS, ...next.inputs } });
    };

    void (async () => {
      if (!documentPath) {
        const saved = await readSpares();
        if (!active) return;
        apply(saved ?? defaultDocument());
        hydratedPath.current = "";
        setHydrated(true);
        // Resume from the last location used by this module.
        const response = await fetch("/api/save-locations?kind=spares", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { spares?: string | null } } : null;
        const remembered = payload?.locations?.spares;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isSparesDocument(remote)) return;
        apply(remote);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
      } else {
        hydratedPath.current = null;
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isSparesDocument(remote)) apply(remote);
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

  const analysis = useMemo(() => analyzeSpares(record, periodKey), [record, periodKey]);
  const resultsById = useMemo(() => new Map(analysis.items.map(item => [item.id, item])), [analysis]);

  useEffect(() => {
    if (!hydrated) return;
    const next = snapshot();
    void saveSpares(next, saveTarget ?? undefined);
    if (saveTarget && hydratedPath.current === saveTarget) queueDocumentSave(saveTarget, next);
  }, [record, hydrated, saveTarget]);

  // A brand-new, unsaved document starts from the project Data Register.
  useEffect(() => {
    if (!hydrated || autoSeeded.current) return;
    if (hydratedPath.current !== "" || record.items.length || !register.length) return;
    autoSeeded.current = true;
    setRecord(current => ({ ...current, items: register.map(asset => itemFromRegister(asset, current.inputs)) }));
    setNotice(`Imported ${register.length} item${register.length === 1 ? "" : "s"} from the Data Register.`);
  }, [hydrated, register, record.items.length]);

  useEffect(() => {
    const rows: ExportRow[] = analysis.items.map(result => ({
      tag: result.tag,
      description: result.description,
      lambda: result.mtbfHours ? result.mtbfHours.toFixed(1) : "?",
      mttr: (record.items.find(item => item.id === result.id)?.mttr ?? 0).toFixed(1),
      recommendedSpares: Math.round(result.recommendedSpares),
      cycleServiceLevel: `${(result.cycleServiceLevel * 100).toFixed(1)}%`,
    }));
    onReportChange?.(rows);
  }, [analysis, record.items, onReportChange]);

  function snapshot(): SparesDocument {
    return {
      ...record,
      inputs: { ...DEFAULT_SPARES_INPUTS, ...record.inputs },
      items: record.items.map(item => ({ ...item, operatingHoursPerYear: record.inputs.operatingHoursPerYear })),
    };
  }

  function updateOptions(patch: Partial<SparesInputs>) {
    setRecord(current => ({ ...current, inputs: { ...current.inputs, ...patch } }));
  }

  function updateItem(id: string, patch: Partial<SpareItem>) {
    setRecord(current => ({
      ...current,
      items: current.items.map(item => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  function addItem() {
    setRecord(current => {
      const item = emptySpare(current.inputs);
      return { ...current, items: [...current.items, { ...item, tag: `SPARE-${current.items.length + 1}` }] };
    });
  }

  function removeItem(id: string) {
    setRecord(current => ({ ...current, items: current.items.filter(item => item.id !== id) }));
  }

  function importRegister() {
    if (registerLoading) { setNotice("The project Data Register is still loading ? try again in a moment."); return; }
    if (!register.length) { setNotice("The project Data Register is empty. Add components there first."); return; }
    setRecord(current => {
      const linked = new Map(current.items.filter(item => item.assetId).map(item => [item.assetId as string, item]));
      const manual = current.items.filter(item => !item.assetId);
      const fromRegister = register.map(asset => {
        const existing = linked.get(asset.id);
        if (existing) {
          return {
            ...existing,
            tag: asset.tag,
            description: asset.description,
            system: asset.system,
            criticality: asset.criticality || "Operational",
            qtyInstalled: Math.max(1, Math.round(asset.qty || 1)),
            lambda: asset.lambda || 0.000001,
            mttr: asset.mttr || 2,
          };
        }
        return itemFromRegister(asset, current.inputs);
      });
      return { ...current, items: [...fromRegister, ...manual] };
    });
    setNotice(`Imported ${register.length} item${register.length === 1 ? "" : "s"} from the Data Register.`);
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
  const saveName = saveTarget?.split("/").pop() || "Untitled Spares";

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
    <section className="spares-workbench">
      {analysis.ok && <ModuleKpis
        ariaLabel="Spare parts headline results"
        metrics={[
          { symbol: "NPV", name: "Total life cycle cost", value: formatCurrency(analysis.totals.lccNpv), primary: true },
          { symbol: "?C", name: "Undiscounted total", value: formatCurrency(analysis.totals.lccUndiscounted), primary: true },
          { symbol: "SL", name: "Weighted service level", value: `${(analysis.totals.weightedServiceLevel * 100).toFixed(1)}%` },
          { symbol: "Nf", name: "Annual failures", value: analysis.totals.annualFailures.toFixed(1), unit: "/yr" },
        ]}
      />}
      <header className="spares-toolbar">
        <label className="spares-inline-field">Discount %
          <select value={String(record.inputs.discountRate)} onChange={event => updateOptions({ discountRate: Number(event.target.value) })}>
            <option value="3">3%</option>
            <option value="4">4%</option>
            <option value="5">5%</option>
            <option value="7">7%</option>
            <option value="10">10%</option>
          </select>
        </label>

        <label className="spares-inline-field">Escalation %
          <select value={String(record.inputs.escalationRate)} onChange={event => updateOptions({ escalationRate: Number(event.target.value) })}>
            <option value="1">1%</option>
            <option value="2">2%</option>
            <option value="3">3%</option>
            <option value="5">5%</option>
          </select>
        </label>

        <label className="spares-inline-field">Horizon
          <select value={periodKey} onChange={event => setPeriodKey(event.target.value as LccPeriodKey)}>
            {PERIOD_OPTIONS.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}
          </select>
        </label>

        <label className="spares-inline-field">Hours/yr
          <input type="number" min="0" step="1" value={String(record.inputs.operatingHoursPerYear)} onChange={event => updateOptions({ operatingHoursPerYear: numberValue(event.target.value) })} placeholder="e.g. 8760"/>
        </label>

        <label className="spares-inline-field">Service level
          <select value={String(record.inputs.defaultServiceLevel)} onChange={event => updateOptions({ defaultServiceLevel: Number(event.target.value) })}>
            <option value="0.90">90%</option>
            <option value="0.95">95%</option>
            <option value="0.98">98%</option>
            <option value="0.99">99%</option>
          </select>
        </label>

        <label className="spares-inline-field">Protection d
          <input type="number" min="1" step="1" value={String(record.inputs.defaultProtectionPeriodDays)} onChange={event => updateOptions({ defaultProtectionPeriodDays: numberValue(event.target.value, 1) })} placeholder="e.g. 365"/>
        </label>

        <label className="spares-inline-field">Downtime cost/h
          <input type="number" min="0" step="100" value={String(record.inputs.downtimeCostPerHour)} onChange={event => updateOptions({ downtimeCostPerHour: numberValue(event.target.value) })} placeholder="e.g. 500"/>
        </label>

        <span className="spares-toolbar-spacer"/>

        <button type="button" className="spares-button" onClick={addItem} disabled={saving}>
          <Icons.plus/><span>Add item</span>
        </button>
        <button type="button" className="spares-button" onClick={() => void saveNow()} disabled={saving}>
          <Icons.save/><span>{saving ? "Saving?" : "Save"}</span>
        </button>
        <button type="button" className="spares-button primary" onClick={() => setSaveOpen(true)}>
          <Icons.download/><span>Save as</span>
        </button>
      </header>

      <div className="spares-statusbar">
        <span>{analysis.ok ? `${analysis.items.length} item${analysis.items.length === 1 ? "" : "s"} ? Spare analysis` : "No items yet"}</span>
        <span>{saving ? "Saving?" : saveTarget ? `Linked to ${saveName}` : "Not saved to a project file"}</span>
        {notice && <button type="button" className="spares-notice" onClick={() => setNotice("")}>{notice} ?</button>}
      </div>

      <div className="spares-layout">
        <aside className="spares-input-panel">
          <div className="spares-panel-head">
            <div><strong>Items</strong><span>Imported from the Data Register or added manually</span></div>
            <button type="button" className="spares-button small" onClick={importRegister} disabled={registerLoading}>
              <Icons.table/><span>{registerLoading ? "Loading?" : "Import"}</span>
            </button>
          </div>

          <div className="spares-table-scroll">
            <table className="spares-data-table">
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: 76 }} />
                <col />
                <col style={{ width: 86 }} />
                <col style={{ width: 48 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 58 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 74 }} />
                <col style={{ width: 82 }} />
                <col style={{ width: 36 }} />
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
                  <th>Lead time (d)</th>
                  <th>Repair (d)</th>
                  <th>Recommended</th>
                  <th>Cycle SL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item, index) => {
                  const result: SpareItemResult | undefined = resultsById.get(item.id);
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>{index + 1}</td>
                        <td>{item.tag}</td>
                        <td><input type="text" value={item.description} onChange={event => updateItem(item.id, { description: event.target.value })} aria-label={`Description for ${item.tag}`}/></td>
                        <td>{item.system}</td>
                        <td><input type="number" min="1" step="1" value={String(item.qtyInstalled)} onChange={event => updateItem(item.id, { qtyInstalled: numberValue(event.target.value, 1) })} aria-label={`Installed quantity for ${item.tag}`}/></td>
                        <td><input type="number" min="0" step="0.000001" value={String(item.lambda)} onChange={event => updateItem(item.id, { lambda: numberValue(event.target.value) })} aria-label={`Failure rate for ${item.tag}`}/></td>
                        <td><input type="number" min="0" step="0.1" value={String(item.mttr)} onChange={event => updateItem(item.id, { mttr: numberValue(event.target.value) })} aria-label={`MTTR for ${item.tag}`}/></td>
                        <td><input type="number" min="1" step="1" value={String(item.leadTimeDays)} onChange={event => updateItem(item.id, { leadTimeDays: numberValue(event.target.value, 1) })} aria-label={`Lead time for ${item.tag}`}/></td>
                        <td><input type="number" min="1" step="1" value={String(item.repairTurnaroundDays)} onChange={event => updateItem(item.id, { repairTurnaroundDays: numberValue(event.target.value, 1) })} aria-label={`Repair turnaround for ${item.tag}`}/></td>
                        <td><input type="number" value={result ? String(Math.round(result.recommendedSpares)) : "0"} readOnly aria-label={`Recommended spares for ${item.tag}`}/></td>
                        <td>
                          <button type="button" className="spares-task-toggle" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id}>
                            {result ? `${(result.cycleServiceLevel * 100).toFixed(1)}%` : "?"} {expanded === item.id ? "?" : "?"}
                          </button>
                        </td>
                        <td><button type="button" className="spares-row-delete" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.tag}`}><Icons.trash/></button></td>
                      </tr>
                      {expanded === item.id && (
                        <tr className="spares-task-row">
                          <td colSpan={12}>
                            <div className="spares-task-editor">
                              <fieldset>
                                <legend>Procurement and cost</legend>
                                <label>Unit cost
                                  <input type="number" min="0" step="100" value={String(item.unitCost)} onChange={event => updateItem(item.id, { unitCost: numberValue(event.target.value) })}/>
                                </label>
                                <label>Holding % / year
                                  <input type="number" min="0" step="1" value={String(item.holdingRate)} onChange={event => updateItem(item.id, { holdingRate: numberValue(event.target.value) })}/>
                                </label>
                                <label>Target service level
                                  <input type="number" min="0.5" max="0.999" step="0.005" value={String(item.serviceLevel)} onChange={event => updateItem(item.id, { serviceLevel: Math.min(0.999, numberValue(event.target.value, 0.5)) })}/>
                                </label>
                                <label>Protection period (days)
                                  <input type="number" min="1" step="1" value={String(item.protectionPeriodDays)} onChange={event => updateItem(item.id, { protectionPeriodDays: numberValue(event.target.value, 1) })}/>
                                </label>
                                <label>Obsolescence (years)
                                  <input type="number" min="0" step="1" value={String(item.obsolescenceYears)} onChange={event => updateItem(item.id, { obsolescenceYears: numberValue(event.target.value) })}/>
                                </label>
                                <label>Scrap rate
                                  <input type="number" min="0" max="1" step="0.01" value={String(item.scrapRate)} onChange={event => updateItem(item.id, { scrapRate: Math.min(1, numberValue(event.target.value)) })}/>
                                </label>
                                <label className="spares-check">Repairable
                                  <input type="checkbox" checked={item.repairable} onChange={event => updateItem(item.id, { repairable: event.target.checked })}/>
                                </label>
                                <label className="spares-check">Insurance spare
                                  <input type="checkbox" checked={item.insurance} onChange={event => updateItem(item.id, { insurance: event.target.checked })}/>
                                </label>
                              </fieldset>

                              {result && (
                                <dl className="spares-result-detail">
                                  <div><dt>MTBF</dt><dd>{result.mtbfHours ? `${formatValue(result.mtbfHours, 1)} h` : "?"}</dd></div>
                                  <div><dt>Annual failures</dt><dd>{formatValue(result.annualFailures, 2)}</dd></div>
                                  <div><dt>Pipeline stock</dt><dd>{Math.round(result.pipelineStock)}</dd></div>
                                  <div><dt>Reorder point</dt><dd>{Math.round(result.reorderPoint)}</dd></div>
                                  <div><dt>Fill rate</dt><dd>{(result.fillRate * 100).toFixed(1)}%</dd></div>
                                  <div><dt>Expected backorders</dt><dd>{formatValue(result.expectedBackorders, 2)}</dd></div>
                                  <div><dt>Stockout risk</dt><dd>{(result.stockoutRisk * 100).toFixed(1)}%</dd></div>
                                  <div><dt>Last-time buy</dt><dd>{Math.round(result.lastTimeBuyQty)}</dd></div>
                                  <div><dt>Operational availability</dt><dd>{result.operationalAvailability === null ? "?" : `${(result.operationalAvailability * 100).toFixed(2)}%`}</dd></div>
                                  <div><dt>Spares NPV</dt><dd>{formatCurrency(result.lccNpv)}</dd></div>
                                </dl>
                              )}

                              {result && result.warnings.length > 0 && (
                                <ul className="spares-item-warnings">
                                  {result.warnings.map(warning => <li key={warning}>{warning}</li>)}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!record.items.length && <tr><td colSpan={12} className="spares-table-empty">No items. Import the Data Register or add an item manually.</td></tr>}
              </tbody>
            </table>
          </div>

          <button type="button" className="spares-add-row" onClick={addItem}><Icons.plus/><span> Add item</span></button>
        </aside>

        <div className="spares-main">
          <section className="spares-results-panel spares-summary">
            {analysis.ok ? (
              <>
                <div className="spares-period-table">
                  <h3>Spares LCC by selectable period</h3>
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

                <div className="spares-criticality">
                  <h3>Criticality breakdown</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Criticality</th>
                        <th>Items</th>
                        <th>Recommended Spares</th>
                        <th>NPV ({record.inputs.currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.criticality.map(group => (
                        <tr key={group.key}>
                          <td>{group.label}</td>
                          <td>{group.items}</td>
                          <td>{group.spares.toFixed(1)}</td>
                          <td>{formatCurrency(group.npv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {analysis.warnings.length > 0 && (
                  <div className="spares-warnings" role="status">
                    <strong>Model checks</strong>
                    <ul>{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                  </div>
                )}
              </>
            ) : (
              <div className="spares-empty">
                <strong>No spares analysis</strong>
                <p>Import the Data Register or add an item to size the spares and their life-cycle cost.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <SaveDialog
        open={saveOpen}
        kind="spares"
        defaultFolder={saveFolder}
        defaultName={saveName}
        data={snapshot()}
        onClose={() => setSaveOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}
