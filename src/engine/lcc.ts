/**
 * Life Cycle Costing ? IEC 60300-3-3:2017.
 *
 * The engine keeps the standard's two dimensions explicit:
 *
 *   ? life-cycle stage ? concept, development, realization, utilization,
 *     enhancement, retirement (Clause A.1); the first three are acquisition
 *     costs, the last three are ownership costs;
 *   ? cost category ? labour, materials/spares, support and logistics,
 *     downtime/consequential cost, overhead, residual-risk allowance and
 *     disposal.
 *
 * Only expense elements are counted. Recurring costs are escalated at the
 * agreed rate and discounted to present value; acquisition is a t = 0 cash
 * flow and disposal is discounted from the end of the horizon. The period
 * table deliberately reports short windows (a day, a month, six months) as
 * well as the long horizons used for whole-life comparisons, because the
 * UNICEF/UN LCC tool presents LCC by selectable period.
 *
 * Nothing here is React- or DOM-aware; the workbench memoises the result.
 */

export type LccMode = "pm" | "cm";

export type LccPeriodKey = "day" | "month" | "months6" | "year" | "years5" | "years10" | "years20" | "years35" | "custom";

export type LccPeriodDef = {
  key: LccPeriodKey;
  label: string;
  /** Length in years; `custom` is resolved from the inputs. */
  years: number;
};

const DAYS_PER_YEAR = 365.25;

export const LCC_PERIODS: LccPeriodDef[] = [
  { key: "day", label: "1 day", years: 1 / DAYS_PER_YEAR },
  { key: "month", label: "1 month", years: 1 / 12 },
  { key: "months6", label: "6 months", years: 0.5 },
  { key: "year", label: "1 year", years: 1 },
  { key: "years5", label: "5 years", years: 5 },
  { key: "years10", label: "10 years", years: 10 },
  { key: "years20", label: "20 years", years: 20 },
  { key: "years35", label: "35 years", years: 35 },
  { key: "custom", label: "Custom", years: 0 },
];

export type LccInputs = {
  currency: string;
  /** Nominal annual discount rate, percent. */
  discountRate: number;
  /** Annual cost escalation, percent. */
  escalationRate: number;
  operatingHoursPerYear: number;
  /** Default whole-life horizon, years. */
  horizonYears: number;
  /** Horizon used by the `custom` period, years. */
  customHorizonYears: number;
  includeAcquisition: boolean;
  includeDisposal: boolean;
  /** Overhead applied to direct labour + material, percent. */
  overheadRate: number;
  /** Annual allowance for residual risk that cannot be designed out, currency. */
  residualRiskPerYear: number;
  /** Default consequential cost of an hour of unavailability, currency/h. */
  defaultDowntimeCostPerHour: number;
};

export const DEFAULT_LCC_INPUTS: LccInputs = {
  currency: "EUR",
  discountRate: 4,
  escalationRate: 2,
  operatingHoursPerYear: 8760,
  horizonYears: 20,
  customHorizonYears: 10,
  includeAcquisition: true,
  includeDisposal: true,
  overheadRate: 12,
  residualRiskPerYear: 0,
  defaultDowntimeCostPerHour: 500,
};

/** The fields the engine needs from a Data Register row. */
export type LccRegisterAsset = {
  id: string;
  tag: string;
  description: string;
  system: string;
  qty: number;
  lambda: number;
  mttr: number;
  criticality: string;
};

export type LccAssetBase = {
  id: string;
  assetId?: string;
  tag: string;
  description: string;
  system: string;
  qty: number;
  unitAcquisitionCost: number;
  installationCost: number;
  disposalCost: number;
  /** Failure rate, failures per operating hour. */
  lambda: number;
  /** Corrective repair time, hours (IEC 61703 MTTR). */
  mttr: number;
  criticality: string;
  /** Recurring support cost for the installed population, currency/year. */
  supportCostPerYear: number;
};

export type LccPmTask = {
  id: string;
  name: string;
  frequencyPerYear: number;
  labourHours: number;
  labourRate: number;
  materialCost: number;
  downtimeHours: number;
  downtimeCostPerHour: number;
  supportCost: number;
  active: boolean;
};

export type LccPmAsset = LccAssetBase & { pmTasks: LccPmTask[] };

export type LccCmProfile = {
  crewSize: number;
  labourRate: number;
  partsCostPerRepair: number;
  downtimeCostPerHour: number;
  /** Logistic delay waiting for a part or specialist, hours. */
  logisticDelayHours: number;
  /** Fault detection and administration time, hours. */
  adminDelayHours: number;
  /** Fraction of call-outs that find no fault (0?1). */
  noFaultFoundRate: number;
  calloutCost: number;
  /** Fraction of repairs that consume a new item rather than a repaired one. */
  scrapRate: number;
  replacementCost: number;
};

export type LccCmAsset = LccAssetBase & { cm: LccCmProfile };

export type LccPmDocument = {
  formulaVersion: "lcc-pm-iec60300-3-3-v1";
  inputs: LccInputs;
  assets: LccPmAsset[];
};

export type LccCmDocument = {
  formulaVersion: "lcc-cm-iec60300-3-3-v1";
  inputs: LccInputs;
  assets: LccCmAsset[];
};

export type LccDocument = LccPmDocument | LccCmDocument;

export type LccAssetResult = {
  id: string;
  tag: string;
  description: string;
  qty: number;
  acquisition: number;
  disposal: number;
  annualLabour: number;
  annualMaterial: number;
  annualSupport: number;
  annualDowntime: number;
  annualOverhead: number;
  annualRecurring: number;
  /** PM events or CM repairs per year. */
  annualEvents: number;
  failuresPerYear: number;
  mtbfHours: number | null;
  availability: number | null;
  operationalAvailability: number | null;
  selectedNpv: number;
  selectedUndiscounted: number;
  costPerOperatingHour: number;
};

export type LccPeriodResult = {
  key: LccPeriodKey;
  label: string;
  years: number;
  undiscounted: number;
  npv: number;
  eac: number;
  costPerOperatingHour: number;
};

export type LccCategoryTotal = { key: string; label: string; amount: number; share: number };
export type LccStageTotal = { key: string; label: string; amount: number; share: number };

export type LccSensitivityRow = {
  key: string;
  label: string;
  npv: number;
  delta: number;
  deltaPct: number;
};

export type LccResult = {
  ok: boolean;
  error?: string;
  warnings: string[];
  currency: string;
  mode: LccMode;
  assets: LccAssetResult[];
  totals: {
    acquisition: number;
    disposal: number;
    annualLabour: number;
    annualMaterial: number;
    annualSupport: number;
    annualDowntime: number;
    annualOverhead: number;
    annualResidualRisk: number;
    annualRecurring: number;
    annualEvents: number;
    failuresPerYear: number;
  };
  periods: LccPeriodResult[];
  selected: LccPeriodResult;
  categories: LccCategoryTotal[];
  stages: LccStageTotal[];
  sensitivity: LccSensitivityRow[];
};

/* -------------------------------------------------------------------------- */
/* Cash-flow helpers                                                           */
/* -------------------------------------------------------------------------- */

function rate(value: number) {
  return Math.max(-0.99, Math.min(2, (Number.isFinite(value) ? value : 0) / 100));
}

/** Present value of an annual amount paid at the end of each year. */
export function recurringPresentValue(annual: number, years: number, discount: number, escalation: number) {
  if (!(years > 0) || !Number.isFinite(annual) || annual === 0) return 0;
  const whole = Math.floor(years);
  let pv = 0;
  for (let year = 1; year <= whole; year += 1) {
    pv += annual * Math.pow(1 + escalation, year - 1) / Math.pow(1 + discount, year);
  }
  const fraction = years - whole;
  if (fraction > 1e-9) {
    const year = whole + 1;
    pv += annual * Math.pow(1 + escalation, year - 1) * fraction / Math.pow(1 + discount, year);
  }
  return pv;
}

/** Undiscounted (but escalated) sum of an annual amount over the horizon. */
export function recurringNominal(annual: number, years: number, escalation: number) {
  if (!(years > 0) || !Number.isFinite(annual) || annual === 0) return 0;
  const whole = Math.floor(years);
  let total = 0;
  for (let year = 1; year <= whole; year += 1) total += annual * Math.pow(1 + escalation, year - 1);
  const fraction = years - whole;
  if (fraction > 1e-9) total += annual * Math.pow(1 + escalation, whole) * fraction;
  return total;
}

export function discountFactor(discount: number, years: number) {
  return 1 / Math.pow(1 + discount, Math.max(0, years));
}

function equivalentAnnualCost(npv: number, years: number, discount: number) {
  if (!(years > 0)) return 0;
  if (Math.abs(discount) < 1e-9) return npv / years;
  return (npv * discount) / (1 - Math.pow(1 + discount, -years));
}

function safe(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: number) {
  return Math.max(0, safe(value));
}

/* -------------------------------------------------------------------------- */
/* Factories                                                                   */
/* -------------------------------------------------------------------------- */

export function defaultLccInputs(): LccInputs {
  return { ...DEFAULT_LCC_INPUTS };
}

export function defaultPmTask(inputs: LccInputs): LccPmTask {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "Scheduled inspection",
    frequencyPerYear: 2,
    labourHours: 2,
    labourRate: 65,
    materialCost: 50,
    downtimeHours: 0.5,
    downtimeCostPerHour: inputs.defaultDowntimeCostPerHour,
    supportCost: 0,
    active: true,
  };
}

export function defaultCmProfile(inputs: LccInputs): LccCmProfile {
  return {
    crewSize: 1,
    labourRate: 65,
    partsCostPerRepair: 250,
    downtimeCostPerHour: inputs.defaultDowntimeCostPerHour,
    logisticDelayHours: 4,
    adminDelayHours: 1,
    noFaultFoundRate: 0.1,
    calloutCost: 150,
    scrapRate: 0.05,
    replacementCost: 5000,
  };
}

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function baseFromRegister(asset: LccRegisterAsset): LccAssetBase {
  return {
    id: newId("lcc"),
    assetId: asset.id,
    tag: asset.tag,
    description: asset.description,
    system: asset.system,
    qty: Math.max(1, Math.round(nonNegative(asset.qty) || 1)),
    unitAcquisitionCost: 0,
    installationCost: 0,
    disposalCost: 0,
    lambda: nonNegative(asset.lambda),
    mttr: nonNegative(asset.mttr),
    criticality: asset.criticality,
    supportCostPerYear: 0,
  };
}

export function pmAssetFromRegister(asset: LccRegisterAsset, inputs: LccInputs): LccPmAsset {
  return { ...baseFromRegister(asset), pmTasks: [defaultPmTask(inputs)] };
}

export function cmAssetFromRegister(asset: LccRegisterAsset, inputs: LccInputs): LccCmAsset {
  return { ...baseFromRegister(asset), cm: defaultCmProfile(inputs) };
}

export function emptyPmAsset(inputs: LccInputs): LccPmAsset {
  return {
    ...baseFromRegister({ id: "", tag: "NEW-001", description: "New asset", system: "Unassigned", qty: 1, lambda: 0, mttr: 1, criticality: "Operational" }),
    pmTasks: [defaultPmTask(inputs)],
  };
}

export function emptyCmAsset(inputs: LccInputs): LccCmAsset {
  return {
    ...baseFromRegister({ id: "", tag: "NEW-001", description: "New asset", system: "Unassigned", qty: 1, lambda: 0, mttr: 1, criticality: "Operational" }),
    cm: defaultCmProfile(inputs),
  };
}

/* -------------------------------------------------------------------------- */
/* Annual cost roll-up                                                         */
/* -------------------------------------------------------------------------- */

type AnnualCosts = {
  labour: number;
  material: number;
  support: number;
  downtime: number;
  overhead: number;
  events: number;
  failures: number;
  acquisition: number;
  disposal: number;
  mtbfHours: number | null;
  availability: number | null;
  operationalAvailability: number | null;
};

function overheadOf(inputs: LccInputs, labour: number, material: number) {
  return nonNegative(labour + material) * rate(inputs.overheadRate);
}

function pmAnnual(asset: LccPmAsset, inputs: LccInputs): AnnualCosts {
  let labour = 0;
  let material = 0;
  let support = 0;
  let downtime = 0;
  let events = 0;

  for (const task of asset.pmTasks) {
    if (!task.active) continue;
    const occurrences = nonNegative(task.frequencyPerYear) * asset.qty;
    events += occurrences;
    labour += occurrences * nonNegative(task.labourHours) * nonNegative(task.labourRate);
    material += occurrences * nonNegative(task.materialCost);
    support += occurrences * nonNegative(task.supportCost);
    downtime += occurrences * nonNegative(task.downtimeHours) * nonNegative(task.downtimeCostPerHour);
  }

  support += asset.qty * nonNegative(asset.supportCostPerYear);
  const overhead = overheadOf(inputs, labour, material);
  const mtbf = asset.lambda > 0 ? 1 / asset.lambda : null;

  return {
    labour,
    material,
    support,
    downtime,
    overhead,
    events,
    failures: 0,
    acquisition: asset.qty * nonNegative(asset.unitAcquisitionCost) + nonNegative(asset.installationCost),
    disposal: asset.qty * nonNegative(asset.disposalCost),
    mtbfHours: mtbf,
    availability: mtbf ? mtbf / (mtbf + nonNegative(asset.mttr)) : null,
    operationalAvailability: mtbf ? mtbf / (mtbf + nonNegative(asset.mttr)) : null,
  };
}

function cmAnnual(asset: LccCmAsset, inputs: LccInputs): AnnualCosts {
  const profile = asset.cm;
  const failures = asset.qty * nonNegative(asset.lambda) * nonNegative(inputs.operatingHoursPerYear);
  const callouts = failures * (1 + Math.min(1, nonNegative(profile.noFaultFoundRate)));
  const labour = failures * nonNegative(asset.mttr) * Math.max(1, nonNegative(profile.crewSize)) * nonNegative(profile.labourRate);
  const material = failures * (nonNegative(profile.partsCostPerRepair) + Math.min(1, nonNegative(profile.scrapRate)) * nonNegative(profile.replacementCost))
    + callouts * nonNegative(profile.calloutCost);
  const support = asset.qty * nonNegative(asset.supportCostPerYear);
  const downtimeHours = nonNegative(asset.mttr) + nonNegative(profile.adminDelayHours) + nonNegative(profile.logisticDelayHours);
  const downtime = failures * downtimeHours * nonNegative(profile.downtimeCostPerHour);
  const overhead = overheadOf(inputs, labour, material);
  const mtbf = asset.lambda > 0 ? 1 / asset.lambda : null;
  const availability = mtbf ? mtbf / (mtbf + nonNegative(asset.mttr)) : null;
  const operationalAvailability = mtbf ? mtbf / (mtbf + downtimeHours) : null;

  return {
    labour,
    material,
    support,
    downtime,
    overhead,
    events: failures,
    failures,
    acquisition: asset.qty * nonNegative(asset.unitAcquisitionCost) + nonNegative(asset.installationCost),
    disposal: asset.qty * nonNegative(asset.disposalCost),
    mtbfHours: mtbf,
    availability,
    operationalAvailability,
  };
}

function recurringOf(costs: AnnualCosts, inputs: LccInputs) {
  return costs.labour + costs.material + costs.support + costs.downtime + costs.overhead + nonNegative(inputs.residualRiskPerYear);
}

function horizonYears(inputs: LccInputs, key: LccPeriodKey) {
  if (key === "custom") return Math.max(1 / DAYS_PER_YEAR, nonNegative(inputs.customHorizonYears));
  return LCC_PERIODS.find(period => period.key === key)?.years ?? 1;
}

function periodResult(inputs: LccInputs, acquisition: number, disposal: number, recurring: number, years: number, key: LccPeriodKey, label: string): LccPeriodResult {
  const discount = rate(inputs.discountRate);
  const escalation = rate(inputs.escalationRate);
  const undiscounted = (inputs.includeAcquisition ? acquisition : 0)
    + recurringNominal(recurring, years, escalation)
    + (inputs.includeDisposal ? disposal : 0);
  const npv = (inputs.includeAcquisition ? acquisition : 0)
    + recurringPresentValue(recurring, years, discount, escalation)
    + (inputs.includeDisposal ? disposal * discountFactor(discount, years) : 0);
  const hours = nonNegative(inputs.operatingHoursPerYear) * years;
  return {
    key,
    label,
    years,
    undiscounted,
    npv,
    eac: equivalentAnnualCost(npv, years, discount),
    costPerOperatingHour: hours > 0 ? npv / hours : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                            */
/* -------------------------------------------------------------------------- */

export function analyzeLcc(document: LccDocument, mode: LccMode, selectedKey: LccPeriodKey = "year"): LccResult {
  const inputs = { ...DEFAULT_LCC_INPUTS, ...document.inputs };
  const warnings: string[] = [];
  const assets = document.assets ?? [];

  if (!assets.length) {
    return emptyResult(mode, inputs, selectedKey, "No assets yet. Import the Data Register or add an asset to start the LCC.");
  }

  const assetResults: LccAssetResult[] = [];
  let acquisition = 0;
  let disposal = 0;
  let annualLabour = 0;
  let annualMaterial = 0;
  let annualSupport = 0;
  let annualDowntime = 0;
  let annualOverhead = 0;
  let annualEvents = 0;
  let failuresPerYear = 0;

  for (const asset of assets) {
    const costs = mode === "pm" ? pmAnnual(asset as LccPmAsset, inputs) : cmAnnual(asset as LccCmAsset, inputs);
    const recurring = recurringOf(costs, inputs);
    acquisition += costs.acquisition;
    disposal += costs.disposal;
    annualLabour += costs.labour;
    annualMaterial += costs.material;
    annualSupport += costs.support;
    annualDowntime += costs.downtime;
    annualOverhead += costs.overhead;
    annualEvents += costs.events;
    failuresPerYear += costs.failures;

    const years = horizonYears(inputs, selectedKey);
    const npv = (inputs.includeAcquisition ? costs.acquisition : 0)
      + recurringPresentValue(recurring, years, rate(inputs.discountRate), rate(inputs.escalationRate))
      + (inputs.includeDisposal ? costs.disposal * discountFactor(rate(inputs.discountRate), years) : 0);
    const undiscounted = (inputs.includeAcquisition ? costs.acquisition : 0)
      + recurringNominal(recurring, years, rate(inputs.escalationRate))
      + (inputs.includeDisposal ? costs.disposal : 0);

    assetResults.push({
      id: asset.id,
      tag: asset.tag,
      description: asset.description,
      qty: asset.qty,
      acquisition: costs.acquisition,
      disposal: costs.disposal,
      annualLabour: costs.labour,
      annualMaterial: costs.material,
      annualSupport: costs.support,
      annualDowntime: costs.downtime,
      annualOverhead: costs.overhead,
      annualRecurring: recurring,
      annualEvents: costs.events,
      failuresPerYear: costs.failures,
      mtbfHours: costs.mtbfHours,
      availability: costs.availability,
      operationalAvailability: costs.operationalAvailability,
      selectedNpv: npv,
      selectedUndiscounted: undiscounted,
      costPerOperatingHour: nonNegative(inputs.operatingHoursPerYear) * years > 0
        ? npv / (nonNegative(inputs.operatingHoursPerYear) * years)
        : 0,
    });

    if (mode === "pm") {
      const pm = asset as LccPmAsset;
      if (!pm.pmTasks.some(task => task.active)) warnings.push(`${asset.tag}: no active preventive task, so only support and residual cost are counted.`);
    } else {
      const cm = asset as LccCmAsset;
      if (nonNegative(asset.lambda) === 0) warnings.push(`${asset.tag}: failure rate is zero, so no corrective demand is forecast.`);
      if (nonNegative(cm.cm.partsCostPerRepair) === 0 && nonNegative(cm.cm.replacementCost) === 0) warnings.push(`${asset.tag}: no repair-parts cost is set.`);
    }
    if (nonNegative(asset.unitAcquisitionCost) === 0) warnings.push(`${asset.tag}: acquisition cost is zero ? add the unit cost for a whole-life comparison.`);
    if (nonNegative(asset.lambda) > 1) warnings.push(`${asset.tag}: ? = ${asset.lambda}/h is unusually high; check the Data Register unit.`);
  }

  const annualResidualRisk = nonNegative(inputs.residualRiskPerYear);
  const annualRecurring = annualLabour + annualMaterial + annualSupport + annualDowntime + annualOverhead + annualResidualRisk;

  const periods = LCC_PERIODS.map(period => {
    const years = horizonYears(inputs, period.key);
    return periodResult(inputs, acquisition, disposal, annualRecurring, years, period.key, period.key === "custom" ? `${years.toFixed(2)} years` : period.label);
  });
  const selected = periods.find(period => period.key === selectedKey) ?? periods[3];

  const recurringPv = recurringPresentValue(annualRecurring, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate));
  const categoryValues: { key: string; label: string; amount: number }[] = [
    { key: "labour", label: "Labour", amount: recurringPresentValue(annualLabour, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "material", label: "Materials & spares", amount: recurringPresentValue(annualMaterial, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "support", label: "Support & logistics", amount: recurringPresentValue(annualSupport, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "downtime", label: "Downtime / consequential", amount: recurringPresentValue(annualDowntime, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "overhead", label: "Overhead", amount: recurringPresentValue(annualOverhead, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "residual", label: "Residual-risk allowance", amount: recurringPresentValue(annualResidualRisk, selected.years, rate(inputs.discountRate), rate(inputs.escalationRate)) },
    { key: "acquisition", label: "Acquisition", amount: inputs.includeAcquisition ? acquisition : 0 },
    { key: "disposal", label: "Disposal / retirement", amount: inputs.includeDisposal ? disposal * discountFactor(rate(inputs.discountRate), selected.years) : 0 },
  ];
  const categoryTotal = categoryValues.reduce((sum, entry) => sum + entry.amount, 0) || 1;
  const categories = categoryValues
    .filter(entry => Math.abs(entry.amount) > 1e-9)
    .map(entry => ({ ...entry, share: entry.amount / categoryTotal }));

  const stageValues = [
    { key: "realization", label: "Realization (acquisition)", amount: inputs.includeAcquisition ? acquisition : 0 },
    { key: "utilization", label: "Utilization (ownership)", amount: recurringPv },
    { key: "retirement", label: "Retirement", amount: inputs.includeDisposal ? disposal * discountFactor(rate(inputs.discountRate), selected.years) : 0 },
  ];
  const stageTotal = stageValues.reduce((sum, entry) => sum + entry.amount, 0) || 1;
  const stages = stageValues.map(entry => ({ ...entry, share: entry.amount / stageTotal }));

  const baseNpv = selected.npv;
  function npvWith(patch: { labour?: number; material?: number; support?: number; downtime?: number; residual?: number; discount?: number; escalation?: number }) {
    const labour = patch.labour ?? annualLabour;
    const material = patch.material ?? annualMaterial;
    const overhead = overheadOf(inputs, labour, material);
    const recurring = labour + material + (patch.support ?? annualSupport) + (patch.downtime ?? annualDowntime) + overhead + (patch.residual ?? annualResidualRisk);
    return (inputs.includeAcquisition ? acquisition : 0)
      + recurringPresentValue(recurring, selected.years, rate(patch.discount ?? inputs.discountRate), rate(patch.escalation ?? inputs.escalationRate))
      + (inputs.includeDisposal ? disposal * discountFactor(rate(patch.discount ?? inputs.discountRate), selected.years) : 0);
  }
  const sensitivityInputs: { key: string; label: string; value: number }[] = [
    { key: "discount-up", label: `Discount ${(safe(inputs.discountRate) + 2).toFixed(1)}%`, value: npvWith({ discount: safe(inputs.discountRate) + 2 }) },
    { key: "discount-down", label: `Discount ${(safe(inputs.discountRate) - 2).toFixed(1)}%`, value: npvWith({ discount: safe(inputs.discountRate) - 2 }) },
    { key: "labour-up", label: "Labour +20%", value: npvWith({ labour: annualLabour * 1.2 }) },
    { key: "material-up", label: "Material +20%", value: npvWith({ material: annualMaterial * 1.2 }) },
    { key: "downtime-up", label: "Downtime +20%", value: npvWith({ downtime: annualDowntime * 1.2 }) },
    { key: "support-up", label: "Support +20%", value: npvWith({ support: annualSupport * 1.2 }) },
    { key: "residual-up", label: "Residual risk +50%", value: npvWith({ residual: annualResidualRisk * 1.5 }) },
    { key: "escalation-up", label: "Escalation +1 point", value: npvWith({ escalation: safe(inputs.escalationRate) + 1 }) },
  ];
  const sensitivity = sensitivityInputs.map(entry => ({
    key: entry.key,
    label: entry.label,
    npv: entry.value,
    delta: entry.value - baseNpv,
    deltaPct: baseNpv !== 0 ? (entry.value - baseNpv) / Math.abs(baseNpv) : 0,
  }));

  if (safe(inputs.discountRate) < 0) warnings.push("The discount rate is negative; present values will be higher than nominal costs.");
  if (safe(inputs.operatingHoursPerYear) <= 0) warnings.push("Operating hours per year is zero; cost per operating hour cannot be reported.");
  if (safe(inputs.horizonYears) <= 0) warnings.push("The whole-life horizon must be greater than zero.");

  return {
    ok: true,
    warnings,
    currency: inputs.currency || "EUR",
    mode,
    assets: assetResults,
    totals: {
      acquisition,
      disposal,
      annualLabour,
      annualMaterial,
      annualSupport,
      annualDowntime,
      annualOverhead,
      annualResidualRisk,
      annualRecurring,
      annualEvents,
      failuresPerYear,
    },
    periods,
    selected,
    categories,
    stages,
    sensitivity,
  };
}

function emptyResult(mode: LccMode, inputs: LccInputs, selectedKey: LccPeriodKey, error: string): LccResult {
  const periods = LCC_PERIODS.map(period => periodResult(inputs, 0, 0, 0, horizonYears(inputs, period.key), period.key, period.label));
  return {
    ok: false,
    error,
    warnings: [],
    currency: inputs.currency || "EUR",
    mode,
    assets: [],
    totals: {
      acquisition: 0, disposal: 0, annualLabour: 0, annualMaterial: 0, annualSupport: 0,
      annualDowntime: 0, annualOverhead: 0, annualResidualRisk: 0, annualRecurring: 0,
      annualEvents: 0, failuresPerYear: 0,
    },
    periods,
    selected: periods.find(period => period.key === selectedKey) ?? periods[3],
    categories: [],
    stages: [],
    sensitivity: [],
  };
}

/** Period length for a key, used by the workbench's selector. */
export function lccPeriodYears(inputs: LccInputs, key: LccPeriodKey) {
  return horizonYears(inputs, key);
}
