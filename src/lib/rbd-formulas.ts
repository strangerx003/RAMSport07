/**
 * RBD Formulas - separated formulas for RBD calculations
 * Can be used independently in other projects
 */

import { componentAvailability } from "@/engine/reliability";

export type FormulaInput = {
  lambda?: number;
  mttr?: number;
  failureRate?: number;
};

export type EquivalentMetrics = {
  availability: number;
  failureRate: number;
  mtbf: number;
  mttr: number;
};

export function positive(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

export function factorial(value: number): number {
  let result = 1;
  for (let number = 2; number <= value; number += 1) {
    result *= number;
  }
  return result;
}

/**
 * Series equations (from approved formula sheet):
 * ?s = ??i
 * MTTRs = ?(?i ? MTTRi) / ?s
 * MTBFs = 1 / ?s
 * A_s = 1 / (1 + ?s ? MTTRs)
 */
export function seriesFormulas(components: Array<FormulaInput & { failureRate?: number; mttr?: number }>): EquivalentMetrics {
  const failureRate = components.reduce((total, component) => total + positive(component.failureRate ?? component.lambda), 0);
  const weightedRepair = components.reduce(
    (total, component) => total + positive(component.failureRate ?? component.lambda) * Math.max(0, component.mttr ?? 0),
    0,
  );
  const mttr =
    failureRate > 0
      ? weightedRepair / failureRate
      : components.reduce((total, component) => total + Math.max(0, component.mttr ?? 0), 0) /
        Math.max(1, components.length);
  const mtbf = failureRate > 0 ? 1 / failureRate : Number.POSITIVE_INFINITY;
  const availability = componentAvailability({ lambda: failureRate, mttr });
  return { availability, failureRate, mtbf, mttr };
}

/**
 * K-out-of-N (r-out-of-n) equations (from attached-sheet):
 * ?s = n! / ((r?1)!(n-r+1)!) ? ?i^(n-r+1) ? Ti^(n-r)
 * MTTRs = 1 / ((n-r+1)?)
 * where T = 1/?
 * Heterogeneous channels approximated using geometric mean for ? and mean repair rate.
 */
export function kOutOfNFormulas(
  channels: Array<FormulaInput & { failureRate?: number; mttr?: number }>,
  k: number,
): EquivalentMetrics {
  const n = channels.length;
  const required = Math.max(1, Math.min(Math.trunc(k), n));
  const exponent = n - required + 1;
  const rates = channels
    .map((channel) => positive(channel.failureRate ?? channel.lambda))
    .filter((rate) => rate > 0);
  const lambdaI = rates.length === n ? Math.exp(rates.reduce((sum, rate) => sum + Math.log(rate), 0) / n) : 0;
  const repairRates = channels
    .map((channel) => (positive(channel.mttr) > 0 ? 1 / positive(channel.mttr) : 0))
    .filter((rate) => rate > 0);
  const mu = repairRates.length ? repairRates.reduce((sum, rate) => sum + rate, 0) / repairRates.length : 0;
  const repairTime = mu > 0 ? 1 / mu : 0;
  const coefficient = factorial(n) / (factorial(required - 1) * factorial(n - required + 1));
  const failureRate = lambdaI > 0 ? coefficient * lambdaI ** exponent * repairTime ** (exponent - 1) : 0;
  const mttr = mu > 0 ? 1 / (exponent * mu) : 0;
  const mtbf = failureRate > 0 ? 1 / failureRate : Number.POSITIVE_INFINITY;
  const availability = componentAvailability({ lambda: failureRate, mttr });
  return { availability, failureRate, mtbf, mttr };
}

export function singleBlockFormulas(component: FormulaInput & { failureRate?: number; mttr?: number }) {
  const failureRate = positive(component.failureRate ?? component.lambda);
  const mttr = Math.max(0, component.mttr ?? 0);
  const availability = componentAvailability({ lambda: failureRate, mttr });
  const mtbf = failureRate > 0 ? 1 / failureRate : Number.POSITIVE_INFINITY;
  return { availability, failureRate, mtbf, mttr };
}

export const RBD_FORMULAS = {
  series: {
    name: "Series",
    formula: "?s = ??i; MTTRs = ?(?i ? MTTRi) / ?s; MTBFs = 1 / ?s",
    description: "All components must function for system success",
  },
  kOutOfN: {
    name: "K-out-of-N",
    formula: "?s = n! / ((r?1)!(n-r+1)!) ? ?i^(n-r+1) ? Ti^(n-r); MTTRs = 1 / ((n-r+1)?)",
    description: "At least k out of n components must function",
  },
  single: {
    name: "Single block",
    formula: "MTBF = 1 / ?",
    description: "Single component/system block",
  },
} as const;
