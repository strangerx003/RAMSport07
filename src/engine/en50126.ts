/**
 * EN 50126-1:2017 ? Railway RAMS risk acceptance framework (Annex C).
 *
 * All RAMSport risk work uses the railway categories from EN 50126 rather than
 * MIL-STD-1629A severity/probability classes:
 *
 *   ? six frequency categories ? Frequent ? Highly improbable;
 *   ? five safety severity categories ? S1 (catastrophic) ? S5 (negligible);
 *   ? the four-tier tolerability matrix ? Intolerable / Undesirable /
 *     Tolerable / Negligible.
 *
 * The quantitative bands are the indicative per-hour frequencies used to
 * calibrate the qualitative categories; the risk tier comes from the matrix.
 * The framework is shared by FMECA, FTA and any other risk view so the whole
 * application speaks one railway safety vocabulary.
 */

export type En50126Frequency =
  | "frequent"
  | "probable"
  | "occasional"
  | "remote"
  | "improbable"
  | "highly-improbable";

export type En50126Severity = "S1" | "S2" | "S3" | "S4" | "S5";

export type En50126RiskLevel = "intolerable" | "undesirable" | "tolerable" | "negligible";

export type En50126FrequencyDef = {
  value: En50126Frequency;
  label: string;
  short: string;
  description: string;
  /** Indicative frequency band, per operating hour. */
  range: string;
  /** Lower bound (inclusive), per hour. */
  min: number;
  /** Upper bound (exclusive), per hour; `Infinity` for Frequent. */
  max: number;
};

export type En50126SeverityDef = {
  value: En50126Severity;
  label: string;
  short: string;
  description: string;
};

export type En50126RiskLevelDef = {
  value: En50126RiskLevel;
  label: string;
  description: string;
  /** Higher is worse; used for ranking. */
  rank: number;
};

export const EN50126_FREQUENCIES: En50126FrequencyDef[] = [
  {
    value: "frequent",
    label: "Frequent",
    short: "Frequent",
    description: "Likely to occur frequently ? the hazard is continuously or repeatedly present.",
    range: "? 1 ? 10?? /h",
    min: 1e-3,
    max: Number.POSITIVE_INFINITY,
  },
  {
    value: "probable",
    label: "Probable",
    short: "Probable",
    description: "Will occur several times in the life of the system.",
    range: "1 ? 10?? ? 1 ? 10?? /h",
    min: 1e-4,
    max: 1e-3,
  },
  {
    value: "occasional",
    label: "Occasional",
    short: "Occasional",
    description: "Likely to occur sometime in the life of the system.",
    range: "1 ? 10?? ? 1 ? 10?? /h",
    min: 1e-5,
    max: 1e-4,
  },
  {
    value: "remote",
    label: "Remote",
    short: "Remote",
    description: "Unlikely to occur, but possible.",
    range: "1 ? 10?? ? 1 ? 10?? /h",
    min: 1e-6,
    max: 1e-5,
  },
  {
    value: "improbable",
    label: "Improbable",
    short: "Improbable",
    description: "Very unlikely to occur.",
    range: "1 ? 10?? ? 1 ? 10?? /h",
    min: 1e-7,
    max: 1e-6,
  },
  {
    value: "highly-improbable",
    label: "Highly improbable",
    short: "Highly improbable",
    description: "Extremely unlikely ? not expected to occur during the system life.",
    range: "< 1 ? 10?? /h",
    min: 0,
    max: 1e-7,
  },
];

export const EN50126_SEVERITIES: En50126SeverityDef[] = [
  {
    value: "S1",
    label: "S1 ? Catastrophic",
    short: "Catastrophic",
    description: "Multiple fatalities or many equivalent fatalities.",
  },
  {
    value: "S2",
    label: "S2 ? Critical",
    short: "Critical",
    description: "Single fatality or severe irreversible injury.",
  },
  {
    value: "S3",
    label: "S3 ? Severe",
    short: "Severe",
    description: "Major injury or serious damage to the system.",
  },
  {
    value: "S4",
    label: "S4 ? Minor",
    short: "Minor",
    description: "Minor injury or minor system damage.",
  },
  {
    value: "S5",
    label: "S5 ? Negligible",
    short: "Negligible",
    description: "No injury; negligible or no system damage.",
  },
];

export const EN50126_RISK_LEVELS: En50126RiskLevelDef[] = [
  {
    value: "intolerable",
    label: "Intolerable",
    description: "The risk cannot be accepted; the hazard must be eliminated or reduced.",
    rank: 3,
  },
  {
    value: "undesirable",
    label: "Undesirable",
    description: "The risk may be accepted only when reduction is impracticable and the duty holder records the decision.",
    rank: 2,
  },
  {
    value: "tolerable",
    label: "Tolerable",
    description: "The risk is acceptable provided it is kept under review and reduced where reasonably practicable (ALARP).",
    rank: 1,
  },
  {
    value: "negligible",
    label: "Negligible",
    description: "The risk is broadly acceptable; no further action is required beyond routine monitoring.",
    rank: 0,
  },
];

export const EN50126_FREQUENCY_ORDER: En50126Frequency[] = EN50126_FREQUENCIES.map(entry => entry.value);
export const EN50126_SEVERITY_ORDER: En50126Severity[] = EN50126_SEVERITIES.map(entry => entry.value);
export const EN50126_RISK_LEVEL_ORDER: En50126RiskLevel[] = ["intolerable", "undesirable", "tolerable", "negligible"];

/**
 * EN 50126-1:2017 Annex C four-tier tolerability matrix.
 *
 * Rows are safety severity S1 (worst) ? S5 (least); columns are frequency
 * Frequent ? Highly improbable. Every cell maps to exactly one risk tier.
 */
export const EN50126_RISK_MATRIX: Record<En50126Severity, Record<En50126Frequency, En50126RiskLevel>> = {
  S1: {
    frequent: "intolerable",
    probable: "intolerable",
    occasional: "intolerable",
    remote: "undesirable",
    improbable: "undesirable",
    "highly-improbable": "tolerable",
  },
  S2: {
    frequent: "intolerable",
    probable: "intolerable",
    occasional: "undesirable",
    remote: "undesirable",
    improbable: "tolerable",
    "highly-improbable": "tolerable",
  },
  S3: {
    frequent: "intolerable",
    probable: "undesirable",
    occasional: "undesirable",
    remote: "tolerable",
    improbable: "tolerable",
    "highly-improbable": "negligible",
  },
  S4: {
    frequent: "undesirable",
    probable: "tolerable",
    occasional: "tolerable",
    remote: "tolerable",
    improbable: "negligible",
    "highly-improbable": "negligible",
  },
  S5: {
    frequent: "tolerable",
    probable: "tolerable",
    occasional: "negligible",
    remote: "negligible",
    improbable: "negligible",
    "highly-improbable": "negligible",
  },
};

export function en50126FrequencyDef(value: En50126Frequency): En50126FrequencyDef {
  return EN50126_FREQUENCIES.find(entry => entry.value === value) ?? EN50126_FREQUENCIES[EN50126_FREQUENCIES.length - 1];
}

export function en50126SeverityDef(value: En50126Severity): En50126SeverityDef {
  return EN50126_SEVERITIES.find(entry => entry.value === value) ?? EN50126_SEVERITIES[EN50126_SEVERITIES.length - 1];
}

export function en50126RiskLevelDef(value: En50126RiskLevel): En50126RiskLevelDef {
  return EN50126_RISK_LEVELS.find(entry => entry.value === value) ?? EN50126_RISK_LEVELS[EN50126_RISK_LEVELS.length - 1];
}

/** Resolve the EN 50126 risk tier for one severity/frequency pair. */
export function en50126RiskLevel(severity: En50126Severity, frequency: En50126Frequency): En50126RiskLevel {
  return EN50126_RISK_MATRIX[severity]?.[frequency] ?? "intolerable";
}

export function en50126RiskRank(level: En50126RiskLevel): number {
  return en50126RiskLevelDef(level).rank;
}

/** Tolerable and negligible are acceptable without further mandatory reduction. */
export function en50126IsAcceptable(level: En50126RiskLevel): boolean {
  return level === "tolerable" || level === "negligible";
}

/** Classify a per-hour frequency into the EN 50126 qualitative category. */
export function en50126FrequencyFromRate(ratePerHour: number): En50126Frequency {
  if (!Number.isFinite(ratePerHour) || ratePerHour < 0) return "highly-improbable";
  if (ratePerHour >= 1e-3) return "frequent";
  if (ratePerHour >= 1e-4) return "probable";
  if (ratePerHour >= 1e-5) return "occasional";
  if (ratePerHour >= 1e-6) return "remote";
  if (ratePerHour >= 1e-7) return "improbable";
  return "highly-improbable";
}

export function en50126WorstRisk(levels: En50126RiskLevel[]): En50126RiskLevel | null {
  let worst: En50126RiskLevel | null = null;
  for (const level of levels) {
    if (worst === null || en50126RiskRank(level) > en50126RiskRank(worst)) worst = level;
  }
  return worst;
}

/** Convenience for the UI: severity rank, 0 = S1 (worst). */
export function en50126SeverityRank(value: En50126Severity): number {
  return EN50126_SEVERITY_ORDER.indexOf(value);
}
