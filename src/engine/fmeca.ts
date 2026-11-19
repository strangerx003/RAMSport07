/**
 * MIL-STD-1629A FMECA (24 November 1980) with EN 50126-1:2017 risk assessment.
 *
 * RAMSport is a railway RAMS tool, so the risk vocabulary is the EN 50126 one:
 * six frequency categories and safety severity S1?S5 on the four-tier
 * Intolerable / Undesirable / Tolerable / Negligible matrix. The quantitative
 * criticality path still follows MIL-STD-1629A Task 102:
 *
 *   Cm = ? ? ? ? ?p ? t        Cr = ? Cm over the modes of one severity class
 *
 * with ?p in failures/10^6 h so Cm comes out in the standard's 10^-6 units.
 * Criticality numbers are relative ranking indicators, not absolute
 * probabilities (MIL-STD-1629A ?4.4.3 / Appendix A).
 */

import {
  en50126FrequencyFromRate,
  en50126RiskLevel,
  en50126RiskRank,
  en50126WorstRisk,
  EN50126_FREQUENCIES,
  EN50126_FREQUENCY_ORDER,
  EN50126_RISK_LEVEL_ORDER,
  EN50126_SEVERITIES,
  EN50126_SEVERITY_ORDER,
  type En50126Frequency,
  type En50126RiskLevel,
  type En50126Severity,
} from "./en50126";

export type FmecaMode = "fmea" | "fmeca";
export type FmecaSeverity = En50126Severity;
export type FmecaFrequency = En50126Frequency;

/** Legacy MIL-STD-1629A values still found in previously saved documents. */
type LegacySeverity = "I" | "II" | "III" | "IV";
type LegacyProbability = "A" | "B" | "C" | "D" | "E";

export const FMECA_SEVERITIES = EN50126_SEVERITIES;
export const FMECA_FREQUENCIES = EN50126_FREQUENCIES;
/** @deprecated Use FMECA_FREQUENCIES. Kept for older imports. */
export const FMECA_PROBABILITIES = EN50126_FREQUENCIES;

export const FMECA_SEVERITY_ORDER: FmecaSeverity[] = EN50126_SEVERITY_ORDER;
export const FMECA_FREQUENCY_ORDER: FmecaFrequency[] = EN50126_FREQUENCY_ORDER;
/** @deprecated Use FMECA_FREQUENCY_ORDER. Kept for older imports. */
export const FMECA_PROBABILITY_ORDER = EN50126_FREQUENCY_ORDER;

export type FmecaModeRecord = {
  id: string;
  failureMode: string;
  cause: string;
  missionPhase: string;
  localEffect: string;
  nextEffect: string;
  endEffect: string;
  detection: string;
  compensating: string;
  /** EN 50126 safety severity S1 (worst) ? S5 (least). */
  severity: FmecaSeverity;
  remarks: string;
  /** EN 50126 frequency category (stored under the historical name `probability`). */
  probability: FmecaFrequency;
  /** Failure effect probability ? (0?1). */
  beta: number;
  /** Failure mode ratio ? (0?1); ?? = 1 per item. */
  alpha: number;
  /** Part failure rate ?p in failures/10^6 h. */
  lambdaP: number;
  /** Operating time in the mission phase, hours. */
  time: number;
};

export type FmecaItemRecord = {
  id: string;
  /** Data Register asset id when the item originates from the register. */
  assetId?: string;
  reference: string;
  item: string;
  function: string;
  modes: FmecaModeRecord[];
};

export type FmecaOptions = {
  mode: FmecaMode;
  /** Global fallback operating time when a mode has none. */
  missionTime: number;
};

export type FmecaModeResult = FmecaModeRecord & {
  /** ? ? ? ? ?p ? t in 10^-6 units. */
  cm: number;
  /** EN 50126 risk tier for this severity/frequency pair. */
  riskLevel: En50126RiskLevel;
};

export type FmecaItemResult = {
  item: FmecaItemRecord;
  modes: FmecaModeResult[];
  cr: Record<FmecaSeverity, number>;
  totalCr: number;
  worstSeverity: FmecaSeverity;
  worstRisk: En50126RiskLevel;
  alphaSum: number;
  critical: boolean;
};

export type FmecaAnalysis = {
  mode: FmecaMode;
  items: FmecaItemResult[];
  /** Count of recorded modes in each severity/frequency cell. */
  matrix: Record<FmecaSeverity, Record<FmecaFrequency, number>>;
  /** Count of recorded modes in each EN 50126 risk tier. */
  riskCounts: Record<En50126RiskLevel, number>;
  worstRisk: En50126RiskLevel | null;
  totalCr: number;
  criticalItems: {
    item: string;
    mode: string;
    severity: FmecaSeverity;
    frequency: FmecaFrequency;
    riskLevel: En50126RiskLevel;
    cr: number;
  }[];
  warnings: string[];
};

export type FmecaAssetSeed = {
  id: string;
  tag: string;
  description: string;
  lambda: number;
  mission: number;
};

const LEGACY_SEVERITY: Record<LegacySeverity, FmecaSeverity> = { I: "S1", II: "S2", III: "S3", IV: "S4" };
const LEGACY_PROBABILITY: Record<LegacyProbability, FmecaFrequency> = {
  A: "frequent",
  B: "probable",
  C: "occasional",
  D: "remote",
  E: "highly-improbable",
};

/** Accept current EN 50126 codes and translate legacy MIL-STD-1629A values. */
export function normalizeSeverity(value: string): FmecaSeverity {
  if (EN50126_SEVERITY_ORDER.includes(value as FmecaSeverity)) return value as FmecaSeverity;
  return LEGACY_SEVERITY[value as LegacySeverity] ?? "S5";
}

/** Accept current EN 50126 codes and translate legacy A?E probability levels. */
export function normalizeFrequency(value: string): FmecaFrequency {
  if (EN50126_FREQUENCY_ORDER.includes(value as FmecaFrequency)) return value as FmecaFrequency;
  return LEGACY_PROBABILITY[value as LegacyProbability] ?? "highly-improbable";
}

export function defaultFmecaMode(index = 1): FmecaModeRecord {
  return {
    id: `mode-${index}`,
    failureMode: "Failure to operate",
    cause: "",
    missionPhase: "Mission",
    localEffect: "",
    nextEffect: "",
    endEffect: "",
    detection: "Built-in test",
    compensating: "",
    severity: "S3",
    remarks: "",
    probability: "remote",
    beta: 1,
    alpha: 1,
    lambdaP: 1,
    time: 1,
  };
}

export function defaultFmecaItem(asset: FmecaAssetSeed, index = 1): FmecaItemRecord {
  return {
    id: `item-${asset.id}`,
    assetId: asset.id,
    reference: asset.tag,
    item: asset.description,
    function: "",
    modes: [{
      ...defaultFmecaMode(index),
      probability: en50126FrequencyFromRate(asset.lambda),
      lambdaP: Number.isFinite(asset.lambda) && asset.lambda > 0 ? asset.lambda * 1e6 : 1,
      time: Number.isFinite(asset.mission) && asset.mission > 0 ? asset.mission : 1,
    }],
  };
}

export function severityRank(value: FmecaSeverity): number {
  return EN50126_SEVERITY_ORDER.indexOf(value);
}

function worstSeverityOf(modes: FmecaModeRecord[]): FmecaSeverity {
  let worst: FmecaSeverity = "S5";
  for (const mode of modes) {
    const severity = normalizeSeverity(mode.severity);
    if (severityRank(severity) < severityRank(worst)) worst = severity;
  }
  return worst;
}

export function analyzeFmeca(items: FmecaItemRecord[], options: FmecaOptions): FmecaAnalysis {
  const warnings: string[] = [];
  const validMissionTime = Number.isFinite(options.missionTime) && options.missionTime > 0;
  if (options.mode === "fmeca" && !validMissionTime) {
    warnings.push("Mission time must be greater than zero; using 1 h for criticality.");
  }
  const matrix = Object.fromEntries(
    EN50126_SEVERITY_ORDER.map(severity => [
      severity,
      Object.fromEntries(EN50126_FREQUENCY_ORDER.map(frequency => [frequency, 0])),
    ]),
  ) as Record<FmecaSeverity, Record<FmecaFrequency, number>>;
  const riskCounts = Object.fromEntries(
    EN50126_RISK_LEVEL_ORDER.map(level => [level, 0]),
  ) as Record<En50126RiskLevel, number>;

  const results: FmecaItemResult[] = items.map(item => {
    const modes: FmecaModeResult[] = item.modes.map(mode => {
      const severity = normalizeSeverity(mode.severity);
      const frequency = normalizeFrequency(mode.probability);
      const beta = Number.isFinite(mode.beta) && mode.beta >= 0 ? mode.beta : 0;
      const alpha = Number.isFinite(mode.alpha) && mode.alpha >= 0 ? mode.alpha : 0;
      const lambdaP = Number.isFinite(mode.lambdaP) && mode.lambdaP >= 0 ? mode.lambdaP : 0;
      const effectiveMissionTime = Number.isFinite(options.missionTime) && options.missionTime > 0 ? options.missionTime : 1;
      const validTime = Number.isFinite(mode.time) && mode.time > 0;
      if (options.mode === "fmeca" && !validTime) {
        warnings.push(`${item.reference} ? ${mode.failureMode}: operating time must be greater than zero; using ${effectiveMissionTime} h.`);
      }
      const time = validTime ? mode.time : effectiveMissionTime;
      const cm = options.mode === "fmeca"
        ? beta * alpha * lambdaP * time
        : 0;
      const riskLevel = en50126RiskLevel(severity, frequency);
      matrix[severity][frequency] += 1;
      riskCounts[riskLevel] += 1;
      return { ...mode, severity, probability: frequency, time, cm, riskLevel };
    });

    const cr = Object.fromEntries(EN50126_SEVERITY_ORDER.map(severity => [severity, 0])) as Record<FmecaSeverity, number>;
    for (const mode of modes) cr[mode.severity] += mode.cm;
    const totalCr = EN50126_SEVERITY_ORDER.reduce((sum, severity) => sum + cr[severity], 0);
    const alphaSum = modes.reduce((sum, mode) => sum + (Number.isFinite(mode.alpha) ? mode.alpha : 0), 0);
    const worstSeverity = worstSeverityOf(modes);
    const worstRisk = en50126WorstRisk(modes.map(mode => mode.riskLevel)) ?? "negligible";

    if (!item.modes.length) warnings.push(`${item.reference}: no failure modes recorded.`);
    // Only warn about alpha sum in quantitative FMECA mode, not in qualitative FMEA mode.
    if (options.mode === "fmeca" && item.modes.length && Math.abs(alphaSum - 1) > 0.01) {
      warnings.push(`${item.reference}: ?? = ${alphaSum.toFixed(3)}; failure-mode ratios should sum to 1.000.`);
    }
    for (const mode of modes) {
      if (!mode.detection.trim()) warnings.push(`${item.reference} ? ${mode.failureMode}: no failure detection method recorded.`);
      if (!mode.cause.trim()) warnings.push(`${item.reference} ? ${mode.failureMode}: no failure cause recorded.`);
      if (mode.riskLevel === "intolerable") {
        warnings.push(`${item.reference} ? ${mode.failureMode}: EN 50126 risk is Intolerable (${mode.severity}, ${mode.probability}) ? eliminate or reduce before acceptance.`);
      } else if (mode.riskLevel === "undesirable") {
        warnings.push(`${item.reference} ? ${mode.failureMode}: EN 50126 risk is Undesirable (${mode.severity}, ${mode.probability}) ? reduce where practicable or record a justified acceptance.`);
      }
    }

    return {
      item,
      modes,
      cr,
      totalCr,
      worstSeverity,
      worstRisk,
      alphaSum,
      critical: en50126RiskRank(worstRisk) >= en50126RiskRank("undesirable"),
    };
  });

  const criticalItems = results.flatMap(result => result.modes
    .filter(mode => en50126RiskRank(mode.riskLevel) >= en50126RiskRank("undesirable"))
    .map(mode => ({
      item: result.item.reference,
      mode: mode.failureMode,
      severity: mode.severity,
      frequency: mode.probability,
      riskLevel: mode.riskLevel,
      cr: mode.cm,
    })));

  const worstRisk = en50126WorstRisk(results.flatMap(result => result.modes.map(mode => mode.riskLevel)));

  if (!items.length) warnings.push("No FMECA items yet. Import the Data Register or add an item to start the worksheet.");
  if (options.mode === "fmeca") warnings.push("Criticality numbers are relative ranking indicators, not absolute probabilities (MIL-STD-1629A ?4.4.3).");
  warnings.push("Risk tiers follow EN 50126-1:2017 Annex C: Intolerable / Undesirable / Tolerable / Negligible.");

  return {
    mode: options.mode,
    items: results,
    matrix,
    riskCounts,
    worstRisk,
    totalCr: results.reduce((sum, result) => sum + result.totalCr, 0),
    criticalItems,
    warnings,
  };
}

export function formatCriticality(value: number) {
  if (!Number.isFinite(value) || value === 0) return "?";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
