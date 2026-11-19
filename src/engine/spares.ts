/**
 * Spare-parts provisioning and spares life-cycle cost.
 *
 * Standards basis:
 *   ? EN 50126-3 (CLC/TR 50126-3) ? rolling-stock RAM: line-replaceable units,
 *     failure categories, repair turnaround and supportability;
 *   ? IEC 61703 ? MTBF / MTTR / availability arithmetic used for the demand rate;
 *   ? IEC 60300-3-3 ? initial and replenishment spares as ownership cost, with
 *     holding cost and discounted whole-life cost;
 *   ? Poisson (stationary demand) provisioning with a target cycle service
 *     level, expected backorders and fill rate, which is the conventional
 *     insurance-spares model for low-demand repairable items.
 *
 * The engine is deterministic and pure. Demand is Poisson with mean
 * ? ? installed quantity ? exposure hours; the recommended stock is the
 * smallest quantity whose cumulative probability reaches the target service
 * level. For large means the normal approximation is used so a fleet-sized
 * item does not make the UI iterate thousands of terms.
 */

import {
  DEFAULT_LCC_INPUTS,
  discountFactor,
  LCC_PERIODS,
  lccPeriodYears,
  recurringNominal,
  recurringPresentValue,
  type LccPeriodKey,
  type LccPeriodResult,
} from "./lcc";

export type SparesInputs = {
  currency: string;
  discountRate: number;
  escalationRate: number;
  horizonYears: number;
  operatingHoursPerYear: number;
  defaultServiceLevel: number;
  defaultProtectionPeriodDays: number;
  downtimeCostPerHour: number;
};

export const DEFAULT_SPARES_INPUTS: SparesInputs = {
  currency: "EUR",
  discountRate: 4,
  escalationRate: 2,
  horizonYears: 20,
  operatingHoursPerYear: 8760,
  defaultServiceLevel: 0.95,
  defaultProtectionPeriodDays: 365,
  downtimeCostPerHour: 500,
};

export type SpareRegisterAsset = {
  id: string;
  tag: string;
  description: string;
  system: string;
  qty: number;
  lambda: number;
  mttr: number;
  criticality: string;
};

export type SpareItem = {
  id: string;
  assetId?: string;
  tag: string;
  description: string;
  system: string;
  criticality: string;
  qtyInstalled: number;
  /** Failures per operating hour. */
  lambda: number;
  /** Corrective repair time, hours. */
  mttr: number;
  repairable: boolean;
  /** Procurement lead time, calendar days. */
  leadTimeDays: number;
  /** Workshop repair turnaround for a repairable unit, calendar days. */
  repairTurnaroundDays: number;
  unitCost: number;
  /** Annual holding cost as a percentage of unit value. */
  holdingRate: number;
  /** Target cycle service level, 0?1. */
  serviceLevel: number;
  /** Initial provisioning protection period, calendar days. */
  protectionPeriodDays: number;
  operatingHoursPerYear: number;
  /** Years until the item is expected to become obsolete; 0 = unknown. */
  obsolescenceYears: number;
  /** Fraction of repairs that consume a new unit (repairable scrap). */
  scrapRate: number;
  /** Hold an insurance spare even when the Poisson result is zero. */
  insurance: boolean;
};

export type SparesDocument = {
  formulaVersion: "spares-en50126-3-v1";
  inputs: SparesInputs;
  items: SpareItem[];
};

export type SpareItemResult = {
  id: string;
  tag: string;
  description: string;
  system: string;
  criticality: string;
  qtyInstalled: number;
  mtbfHours: number | null;
  annualFailures: number;
  exposureHours: number;
  demandDuringLeadTime: number;
  demandDuringProtection: number;
  pipelineStock: number;
  recommendedSpares: number;
  reorderPoint: number;
  targetServiceLevel: number;
  cycleServiceLevel: number;
  fillRate: number;
  expectedBackorders: number;
  stockoutRisk: number;
  expectedDowntimeHoursPerYear: number;
  operationalAvailability: number | null;
  initialCost: number;
  annualReplenishmentCost: number;
  annualHoldingCost: number;
  annualDowntimeCost: number;
  annualRecurring: number;
  lastTimeBuyQty: number;
  obsolescenceCost: number;
  lccNpv: number;
  lccUndiscounted: number;
  insuranceRecommended: boolean;
  warnings: string[];
};

export type SparesResult = {
  ok: boolean;
  error?: string;
  warnings: string[];
  currency: string;
  items: SpareItemResult[];
  totals: {
    recommendedSpares: number;
    pipelineStock: number;
    initialCost: number;
    annualReplenishmentCost: number;
    annualHoldingCost: number;
    annualDowntimeCost: number;
    annualRecurring: number;
    annualFailures: number;
    lccNpv: number;
    lccUndiscounted: number;
    weightedServiceLevel: number;
  };
  periods: LccPeriodResult[];
  selected: LccPeriodResult;
  criticality: { key: string; label: string; items: number; spares: number; npv: number }[];
};

/* -------------------------------------------------------------------------- */
/* Poisson and normal helpers                                                  */
/* -------------------------------------------------------------------------- */

const logFactorialCache: number[] = [0, 0];

function logFactorial(n: number): number {
  if (n < 0) return 0;
  const index = Math.floor(n);
  if (index < logFactorialCache.length) return logFactorialCache[index];
  let value = logFactorialCache[logFactorialCache.length - 1];
  for (let i = logFactorialCache.length; i <= index; i += 1) {
    value += Math.log(i);
    logFactorialCache[i] = value;
  }
  return value;
}

export function poissonPmf(k: number, mean: number): number {
  if (mean <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  return Math.exp(-mean + k * Math.log(mean) - logFactorial(k));
}

export function poissonCdf(k: number, mean: number): number {
  if (k < 0) return 0;
  if (mean <= 0) return 1;
  if (mean > 200) {
    const sigma = Math.sqrt(mean);
    return normalCdf((k + 0.5 - mean) / sigma);
  }
  let sum = 0;
  const upper = Math.floor(k);
  for (let i = 0; i <= upper; i += 1) sum += poissonPmf(i, mean);
  return Math.min(1, sum);
}

/** Smallest stock S with P(X ? S) ? serviceLevel. */
export function poissonQuantile(serviceLevel: number, mean: number): number {
  const target = Math.min(0.99999, Math.max(0.5, serviceLevel));
  if (mean <= 0) return 0;
  if (mean > 200) {
    const sigma = Math.sqrt(mean);
    return Math.max(0, Math.ceil(mean + sigma * inverseNormal(target) - 0.5));
  }
  let cumulative = poissonPmf(0, mean);
  if (cumulative >= target) return 0;
  const limit = Math.max(50, Math.ceil(mean + 10 * Math.sqrt(mean) + 20));
  for (let k = 1; k <= limit; k += 1) {
    cumulative += poissonPmf(k, mean);
    if (cumulative >= target) return k;
  }
  return limit;
}

/** Expected backorders E[(X ? S)?]. */
export function poissonExpectedBackorders(stock: number, mean: number): number {
  if (mean <= 0) return 0;
  const s = Math.max(0, Math.floor(stock));
  if (mean > 200) {
    const sigma = Math.sqrt(mean);
    const z = (s - mean) / sigma;
    return Math.max(0, sigma * normalPdf(z) + (mean - s) * (1 - normalCdf(z)));
  }
  let expectedMin = 0;
  for (let k = 0; k <= s; k += 1) expectedMin += k * poissonPmf(k, mean);
  expectedMin += s * (1 - poissonCdf(s, mean));
  return Math.max(0, mean - expectedMin);
}

function normalPdf(z: number) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function normalCdf(z: number) {
  // Abramowitz?Stegun 7.1.26, accurate to ~1.5e-7.
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Peter Acklam's inverse normal CDF approximation. */
function inverseNormal(p: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p <= 0) return -6;
  if (p >= 1) return 6;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* -------------------------------------------------------------------------- */
/* Factories                                                                   */
/* -------------------------------------------------------------------------- */

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nonNegative(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function clampServiceLevel(value: number) {
  if (!Number.isFinite(value)) return 0.95;
  return Math.min(0.9999, Math.max(0.5, value));
}

export function spareFromRegister(asset: SpareRegisterAsset, inputs: SparesInputs): SpareItem {
  return {
    id: newId("spare"),
    assetId: asset.id,
    tag: asset.tag,
    description: asset.description,
    system: asset.system,
    criticality: asset.criticality || "Operational",
    qtyInstalled: Math.max(1, Math.round(nonNegative(asset.qty) || 1)),
    lambda: nonNegative(asset.lambda),
    mttr: nonNegative(asset.mttr),
    repairable: true,
    leadTimeDays: 30,
    repairTurnaroundDays: 15,
    unitCost: 1000,
    holdingRate: 20,
    serviceLevel: clampServiceLevel(inputs.defaultServiceLevel),
    protectionPeriodDays: Math.max(1, inputs.defaultProtectionPeriodDays),
    operatingHoursPerYear: nonNegative(inputs.operatingHoursPerYear),
    obsolescenceYears: 0,
    scrapRate: 0.1,
    insurance: /safety/i.test(asset.criticality || ""),
  };
}

export function emptySpare(inputs: SparesInputs): SpareItem {
  return {
    id: newId("spare"),
    tag: "NEW-SPARE-001",
    description: "New spare item",
    system: "Unassigned",
    criticality: "Operational",
    qtyInstalled: 1,
    lambda: 0.000001,
    mttr: 2,
    repairable: true,
    leadTimeDays: 30,
    repairTurnaroundDays: 15,
    unitCost: 1000,
    holdingRate: 20,
    serviceLevel: clampServiceLevel(inputs.defaultServiceLevel),
    protectionPeriodDays: Math.max(1, inputs.defaultProtectionPeriodDays),
    operatingHoursPerYear: nonNegative(inputs.operatingHoursPerYear),
    obsolescenceYears: 0,
    scrapRate: 0.1,
    insurance: false,
  };
}

/** Service level implied by the EN 50126 criticality of the function. */
export function recommendedServiceLevel(criticality: string) {
  if (/safety/i.test(criticality)) return 0.99;
  if (/mission/i.test(criticality)) return 0.98;
  if (/operational/i.test(criticality)) return 0.95;
  return 0.9;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */
/* -------------------------------------------------------------------------- */

function itemResult(item: SpareItem, inputs: SparesInputs, selectedKey: LccPeriodKey): SpareItemResult {
  const warnings: string[] = [];
  const exposureHours = nonNegative(item.operatingHoursPerYear) > 0 ? nonNegative(item.operatingHoursPerYear) : nonNegative(inputs.operatingHoursPerYear);
  const qty = Math.max(1, Math.round(nonNegative(item.qtyInstalled) || 1));
  const lambda = nonNegative(item.lambda);
  const mtbf = lambda > 0 ? 1 / lambda : null;
  const annualFailures = qty * lambda * exposureHours;
  const leadTimeHours = nonNegative(item.leadTimeDays) * 24;
  const turnaroundHours = item.repairable ? nonNegative(item.repairTurnaroundDays) * 24 : 0;
  const pipelineHours = leadTimeHours + turnaroundHours;
  const demandDuringLeadTime = qty * lambda * pipelineHours;
  const protectionHours = Math.max(24, nonNegative(item.protectionPeriodDays) * 24);
  const demandDuringProtection = qty * lambda * protectionHours;
  const targetServiceLevel = clampServiceLevel(item.serviceLevel || inputs.defaultServiceLevel);

  const poissonStock = poissonQuantile(targetServiceLevel, demandDuringProtection);
  const insuranceRecommended = Boolean(item.insurance) && /safety/i.test(item.criticality) && poissonStock === 0;
  const recommendedSpares = Math.max(poissonStock, insuranceRecommended ? 1 : 0, Math.ceil(demandDuringLeadTime));
  const pipelineStock = Math.ceil(demandDuringLeadTime);
  const reorderPoint = poissonQuantile(targetServiceLevel, demandDuringLeadTime);
  const cycleServiceLevel = poissonCdf(recommendedSpares, demandDuringProtection);
  const expectedBackorders = poissonExpectedBackorders(recommendedSpares, demandDuringProtection);
  const fillRate = demandDuringProtection > 0 ? Math.max(0, 1 - expectedBackorders / demandDuringProtection) : 1;
  const stockoutRisk = 1 - cycleServiceLevel;
  const cyclesPerYear = 365.25 / Math.max(1, nonNegative(item.protectionPeriodDays));
  const unmetPerYear = expectedBackorders * cyclesPerYear;
  const waitHours = leadTimeHours + turnaroundHours;
  const expectedDowntimeHoursPerYear = Math.min(annualFailures * waitHours, unmetPerYear * waitHours);
  const downtimePerFailure = annualFailures > 0 ? expectedDowntimeHoursPerYear / annualFailures : 0;
  const operationalAvailability = mtbf
    ? mtbf / (mtbf + nonNegative(item.mttr) + downtimePerFailure)
    : null;

  const replenishmentUnits = item.repairable ? annualFailures * Math.min(1, nonNegative(item.scrapRate)) : annualFailures;
  const initialCost = recommendedSpares * nonNegative(item.unitCost);
  const annualReplenishmentCost = replenishmentUnits * nonNegative(item.unitCost);
  const averageStock = recommendedSpares + pipelineStock / 2;
  const annualHoldingCost = averageStock * nonNegative(item.unitCost) * (nonNegative(item.holdingRate) / 100);
  const annualDowntimeCost = expectedDowntimeHoursPerYear * nonNegative(inputs.downtimeCostPerHour);
  const annualRecurring = annualReplenishmentCost + annualHoldingCost + annualDowntimeCost;

  const discount = Math.max(-0.99, Math.min(2, nonNegative(inputs.discountRate) / 100));
  const escalation = Math.max(-0.99, Math.min(2, nonNegative(inputs.escalationRate) / 100));
  const years = lccPeriodYears({ ...DEFAULT_LCC_INPUTS, customHorizonYears: inputs.horizonYears }, selectedKey);
  const obsolescenceYear = nonNegative(item.obsolescenceYears) > 0 ? nonNegative(item.obsolescenceYears) : Number.POSITIVE_INFINITY;
  const coveredYears = Math.min(years, obsolescenceYear);
  const lastTimeBuyQty = Number.isFinite(obsolescenceYear) && obsolescenceYear < years
    ? Math.ceil(replenishmentUnits * (years - obsolescenceYear))
    : 0;
  const obsolescenceCost = lastTimeBuyQty * nonNegative(item.unitCost);
  const lccNpv = initialCost
    + recurringPresentValue(annualRecurring, coveredYears, discount, escalation)
    + (obsolescenceCost > 0 ? obsolescenceCost * discountFactor(discount, obsolescenceYear) : 0);
  const lccUndiscounted = initialCost + recurringNominal(annualRecurring, coveredYears, escalation) + obsolescenceCost;

  if (lambda === 0) warnings.push(`${item.tag}: ? is zero, so the model recommends no stock beyond the pipeline.`);
  if (nonNegative(item.unitCost) === 0) warnings.push(`${item.tag}: unit cost is zero, so holding and replenishment cost cannot be valued.`);
  if (nonNegative(item.leadTimeDays) > 180) warnings.push(`${item.tag}: lead time exceeds 180 days; consider an insurance spare.`);
  if (targetServiceLevel < recommendedServiceLevel(item.criticality)) {
    warnings.push(`${item.tag}: target ${(targetServiceLevel * 100).toFixed(1)}% is below the ${(recommendedServiceLevel(item.criticality) * 100).toFixed(0)}% suggested for ${item.criticality}.`);
  }
  if (Number.isFinite(obsolescenceYear) && obsolescenceYear < years) {
    warnings.push(`${item.tag}: obsolescence inside the horizon ? last-time buy of ${lastTimeBuyQty} unit${lastTimeBuyQty === 1 ? "" : "s"} is included.`);
  }

  return {
    id: item.id,
    tag: item.tag,
    description: item.description,
    system: item.system,
    criticality: item.criticality,
    qtyInstalled: qty,
    mtbfHours: mtbf,
    annualFailures,
    exposureHours,
    demandDuringLeadTime,
    demandDuringProtection,
    pipelineStock,
    recommendedSpares,
    reorderPoint,
    targetServiceLevel,
    cycleServiceLevel,
    fillRate,
    expectedBackorders,
    stockoutRisk,
    expectedDowntimeHoursPerYear,
    operationalAvailability,
    initialCost,
    annualReplenishmentCost,
    annualHoldingCost,
    annualDowntimeCost,
    annualRecurring,
    lastTimeBuyQty,
    obsolescenceCost,
    lccNpv,
    lccUndiscounted,
    insuranceRecommended,
    warnings,
  };
}

export function analyzeSpares(document: SparesDocument, selectedKey: LccPeriodKey = "year"): SparesResult {
  const inputs = { ...DEFAULT_SPARES_INPUTS, ...document.inputs };
  const items = document.items ?? [];
  if (!items.length) {
    const periods = LCC_PERIODS.map(period => ({
      key: period.key,
      label: period.label,
      years: lccPeriodYears({ ...DEFAULT_LCC_INPUTS, customHorizonYears: inputs.horizonYears }, period.key),
      undiscounted: 0,
      npv: 0,
      eac: 0,
      costPerOperatingHour: 0,
    }));
    return {
      ok: false,
      error: "No spare items yet. Import the Data Register or add an item to size the spares.",
      warnings: [],
      currency: inputs.currency || "EUR",
      items: [],
      totals: {
        recommendedSpares: 0, pipelineStock: 0, initialCost: 0, annualReplenishmentCost: 0,
        annualHoldingCost: 0, annualDowntimeCost: 0, annualRecurring: 0, annualFailures: 0,
        lccNpv: 0, lccUndiscounted: 0, weightedServiceLevel: 0,
      },
      periods,
      selected: periods.find(period => period.key === selectedKey) ?? periods[3],
      criticality: [],
    };
  }

  const results = items.map(item => itemResult(item, inputs, selectedKey));
  const totals = results.reduce((sum, item) => ({
    recommendedSpares: sum.recommendedSpares + item.recommendedSpares,
    pipelineStock: sum.pipelineStock + item.pipelineStock,
    initialCost: sum.initialCost + item.initialCost,
    annualReplenishmentCost: sum.annualReplenishmentCost + item.annualReplenishmentCost,
    annualHoldingCost: sum.annualHoldingCost + item.annualHoldingCost,
    annualDowntimeCost: sum.annualDowntimeCost + item.annualDowntimeCost,
    annualRecurring: sum.annualRecurring + item.annualRecurring,
    annualFailures: sum.annualFailures + item.annualFailures,
    lccNpv: sum.lccNpv + item.lccNpv,
    lccUndiscounted: sum.lccUndiscounted + item.lccUndiscounted,
    weightedServiceLevel: sum.weightedServiceLevel + item.cycleServiceLevel * Math.max(item.annualFailures, 1e-9),
  }), {
    recommendedSpares: 0, pipelineStock: 0, initialCost: 0, annualReplenishmentCost: 0,
    annualHoldingCost: 0, annualDowntimeCost: 0, annualRecurring: 0, annualFailures: 0,
    lccNpv: 0, lccUndiscounted: 0, weightedServiceLevel: 0,
  });
  const failureWeight = results.reduce((sum, item) => sum + Math.max(item.annualFailures, 1e-9), 0);
  totals.weightedServiceLevel = failureWeight > 0 ? totals.weightedServiceLevel / failureWeight : 0;

  const discount = Math.max(-0.99, Math.min(2, nonNegative(inputs.discountRate) / 100));
  const escalation = Math.max(-0.99, Math.min(2, nonNegative(inputs.escalationRate) / 100));
  const periods = LCC_PERIODS.map(period => {
    const years = lccPeriodYears({ ...DEFAULT_LCC_INPUTS, customHorizonYears: inputs.horizonYears }, period.key);
    const recurring = totals.annualRecurring;
    const npv = totals.initialCost + recurringPresentValue(recurring, years, discount, escalation);
    const undiscounted = totals.initialCost + recurringNominal(recurring, years, escalation);
    return {
      key: period.key,
      label: period.key === "custom" ? `${years.toFixed(2)} years` : period.label,
      years,
      undiscounted,
      npv,
      eac: years > 0 ? npv * (Math.abs(discount) < 1e-9 ? 1 / years : discount / (1 - Math.pow(1 + discount, -years))) : 0,
      costPerOperatingHour: years > 0 && inputs.operatingHoursPerYear > 0 ? npv / (inputs.operatingHoursPerYear * years) : 0,
    };
  });
  const selected = periods.find(period => period.key === selectedKey) ?? periods[3];

  const criticalityMap = new Map<string, { key: string; label: string; items: number; spares: number; npv: number }>();
  for (const item of results) {
    const key = /safety/i.test(item.criticality) ? "safety" : /mission/i.test(item.criticality) ? "mission" : /operational/i.test(item.criticality) ? "operational" : "other";
    const label = key === "safety" ? "Safety critical" : key === "mission" ? "Mission critical" : key === "operational" ? "Operational" : "Non-critical";
    const entry = criticalityMap.get(key) ?? { key, label, items: 0, spares: 0, npv: 0 };
    entry.items += 1;
    entry.spares += item.recommendedSpares;
    entry.npv += item.lccNpv;
    criticalityMap.set(key, entry);
  }

  const warnings: string[] = [];
  for (const item of results) warnings.push(...item.warnings);
  if (nonNegative(inputs.discountRate) < 0) warnings.push("The discount rate is negative; present values exceed nominal cost.");

  return {
    ok: true,
    warnings,
    currency: inputs.currency || "EUR",
    items: results,
    totals,
    periods,
    selected,
    criticality: Array.from(criticalityMap.values()).sort((first, second) => second.npv - first.npv),
  };
}
