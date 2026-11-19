/**
 * Weibull life-data analysis ? IEC 61649:2008 (2nd edition).
 *
 * Implements the standard's two- and three-parameter Weibull distribution,
 * median-rank plotting positions (Benard, Eq. 6), adjusted ranks for suspended
 * items (Eq. 7), median rank regression (Annex E), maximum likelihood for
 * singly censored samples (Eqs. 17-18), derived B-lives/MTTF (Eqs. 19-20),
 * WeiBayes with a known shape (Eq. 48) and the Beta-binomial plotting bounds
 * (Eqs. 39-40).
 *
 * Confidence intervals for the parameters are approximate. For MLE they use
 * Fisher's information matrix (Clause 10.4); for MRR they use the regression
 * standard errors. The standard itself notes that several interval equations
 * (Eqs. 25-26, 32-33, 36-37, 42-47) are approximate, so the UI labels them as
 * such.
 */

export type WeibullMethod = "mrr" | "mle" | "weibayes";
export type WeibullRegression = "x-on-y" | "y-on-x";

export type WeibullDataPoint = {
  id: string;
  /** Time, cycles, distance or any other life measure. */
  time: number;
  /** Number of identical items at this time (grouped data). */
  quantity: number;
  /** True when the item was removed from test without a relevant failure. */
  suspended: boolean;
};

export type WeibullOptions = {
  method: WeibullMethod;
  /** MRR regression direction: X on Y is the standard default. */
  regression: WeibullRegression;
  threeParameter: boolean;
  /** Shape assumed by WeiBayes. */
  assumedBeta: number;
  /** Two-sided confidence level, e.g. 0.90. */
  confidence: number;
};

export type WeibullObservation = { time: number; suspended: boolean; order: number };

export type WeibullRankPoint = {
  order: number;
  time: number;
  adjustedRank: number;
  medianRank: number;
};

export type WeibullPlotPoint = {
  order: number;
  time: number;
  medianRank: number;
  fittedRank: number;
  lowerTime: number | null;
  upperTime: number | null;
  suspended: boolean;
};

export type WeibullBLife = { p: number; label: string; value: number };

export type WeibullReliabilityPoint = {
  time: number;
  reliability: number;
  hazard: number;
  cumulativeHazard: number;
};

export type WeibullRegime = "infant" | "random" | "wearout";

export type WeibullAnalysis = {
  ok: boolean;
  error?: string;
  method: WeibullMethod;
  regression: WeibullRegression;
  beta: number;
  eta: number;
  t0: number;
  r2: number;
  n: number;
  r: number;
  suspended: number;
  mttf: number;
  bLives: WeibullBLife[];
  plotPoints: WeibullPlotPoint[];
  rankPoints: WeibullRankPoint[];
  line: { slope: number; intercept: number };
  betaCi: [number, number] | null;
  etaCi: [number, number] | null;
  betaCiIncludesOne: boolean;
  reliability: WeibullReliabilityPoint[];
  warnings: string[];
  regime: WeibullRegime;
  regimeLabel: string;
  regimeDescription: string;
  /** Number of failures used as the effective denominator for WeiBayes. */
  effectiveFailures: number;
};

export const DEFAULT_WEIBULL_OPTIONS: WeibullOptions = {
  method: "mrr",
  regression: "x-on-y",
  threeParameter: false,
  assumedBeta: 2,
  confidence: 0.9,
};

export const WEIBULL_B_LIVES: { p: number; label: string }[] = [
  { p: 0.01, label: "B1" },
  { p: 0.05, label: "B5" },
  { p: 0.1, label: "B10" },
  { p: 0.5, label: "B50" },
  { p: 0.632, label: "B63.2" },
  { p: 0.9, label: "B90" },
];

const EULER_GAMMA = 0.5772156649015329;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/* -------------------------------------------------------------------------- */
/* Numerical helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Lanczos approximation of the Gamma function (Annex D.1 uses ?(1 + 1/?)). */
export function gammaFn(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value < 0.5) {
    // Reflection formula keeps the approximation accurate below 0.5.
    return Math.PI / (Math.sin(Math.PI * value) * gammaFn(1 - value));
  }
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const z = value - 1;
  let series = coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) series += coefficients[index] / (z + index);
  const t = z + 7.5;
  return SQRT_2PI * Math.pow(t, z + 0.5) * Math.exp(-t) * series;
}

function lnGamma(value: number): number {
  return Math.log(gammaFn(value));
}

/** Inverse standard-normal CDF (Acklam's rational approximation). */
export function normalQuantile(probability: number): number {
  const p = Math.min(Math.max(probability, 1e-12), 1 - 1e-12);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Wilson-Hilferty approximation of the chi-square p-fractile (Annex D.2). */
export function chiSquareQuantile(probability: number, degrees: number): number {
  if (degrees <= 0) return Number.NaN;
  const z = normalQuantile(probability);
  const term = 1 - 2 / (9 * degrees) + z * Math.sqrt(2 / (9 * degrees));
  return degrees * Math.pow(Math.max(term, 1e-9), 3);
}

function continuedFractionBeta(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * continuedFractionBeta(a, b, x)) / a;
  return 1 - (front * continuedFractionBeta(b, a, 1 - x)) / b;
}

/** Quantile of the Beta(a, b) distribution ? exact median-rank tables (Annex C). */
export function betaQuantile(probability: number, a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return Number.NaN;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const middle = (low + high) / 2;
    if (incompleteBeta(middle, a, b) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* -------------------------------------------------------------------------- */
/* Distribution functions (Clause 5)                                           */
/* -------------------------------------------------------------------------- */

export function weibullCdf(time: number, beta: number, eta: number, t0 = 0): number {
  if (time <= t0) return 0;
  return 1 - Math.exp(-Math.pow((time - t0) / eta, beta));
}

export function weibullReliability(time: number, beta: number, eta: number, t0 = 0): number {
  if (time <= t0) return 1;
  return Math.exp(-Math.pow((time - t0) / eta, beta));
}

export function weibullPdf(time: number, beta: number, eta: number, t0 = 0): number {
  if (time <= t0) return 0;
  const z = (time - t0) / eta;
  return (beta / eta) * Math.pow(z, beta - 1) * Math.exp(-Math.pow(z, beta));
}

/** Instantaneous failure rate / hazard, Eq. 3. */
export function weibullHazard(time: number, beta: number, eta: number, t0 = 0): number {
  if (time <= t0) return 0;
  return (beta / eta) * Math.pow((time - t0) / eta, beta - 1);
}

export function weibullCumulativeHazard(time: number, beta: number, eta: number, t0 = 0): number {
  if (time <= t0) return 0;
  return Math.pow((time - t0) / eta, beta);
}

/** B_p life / L percentile, Eq. 20. */
export function weibullBLife(p: number, beta: number, eta: number, t0 = 0): number {
  return t0 + eta * Math.pow(-Math.log(1 - p), 1 / beta);
}

/** Mean time to failure, Eq. 19. */
export function weibullMttf(beta: number, eta: number, t0 = 0): number {
  return t0 + eta * gammaFn(1 + 1 / beta);
}

/* -------------------------------------------------------------------------- */
/* Ranking (Clause 7.2)                                                        */
/* -------------------------------------------------------------------------- */

export function expandObservations(points: WeibullDataPoint[]): WeibullObservation[] {
  const observations: Omit<WeibullObservation, "order">[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.time) || point.time < 0) continue;
    const quantity = Math.max(1, Math.min(2000, Math.round(point.quantity || 1)));
    for (let index = 0; index < quantity; index += 1) {
      observations.push({ time: point.time, suspended: Boolean(point.suspended) });
    }
  }
  observations.sort((first, second) => {
    if (first.time !== second.time) return first.time - second.time;
    // At equal times, failures are ranked before suspensions (7.2.1 NOTE).
    if (first.suspended !== second.suspended) return first.suspended ? 1 : -1;
    return 0;
  });
  return observations.map((observation, index) => ({ ...observation, order: index + 1 }));
}

/** Benard's median-rank approximation, Eq. 6. */
export function benardRank(rank: number, sampleSize: number): number {
  return (rank - 0.3) / (sampleSize + 0.4);
}

/**
 * Adjusted ranks for multiple suspended items, Eq. 7.
 * Suspensions are ranked with the failures but are not plotted.
 */
export function adjustedRanks(observations: WeibullObservation[]): WeibullRankPoint[] {
  const sampleSize = observations.length;
  let previousAdjusted = 0;
  const result: WeibullRankPoint[] = [];
  for (const observation of observations) {
    if (observation.suspended) continue;
    const reverseRank = sampleSize + 1 - observation.order;
    const adjustedRank = (reverseRank * previousAdjusted + (sampleSize + 1)) / (reverseRank + 1);
    previousAdjusted = adjustedRank;
    result.push({
      order: observation.order,
      time: observation.time,
      adjustedRank,
      medianRank: benardRank(adjustedRank, sampleSize),
    });
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Regression (Annex E)                                                        */
/* -------------------------------------------------------------------------- */

type Regression = {
  slope: number;
  intercept: number;
  r2: number;
  sxx: number;
  syy: number;
  sxy: number;
  meanX: number;
  meanY: number;
  count: number;
};

function regress(xs: number[], ys: number[]): Regression {
  const count = xs.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const slope = sxx ? sxy / sxx : Number.NaN;
  const intercept = meanY - slope * meanX;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2, sxx, syy, sxy, meanX, meanY, count };
}

type Fit = {
  beta: number;
  eta: number;
  r2: number;
  line: { slope: number; intercept: number };
  regression: Regression | null;
};

function transformRankPoints(ranks: WeibullRankPoint[], t0: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const used: WeibullRankPoint[] = [];
  for (const rank of ranks) {
    const shifted = rank.time - t0;
    if (!(shifted > 0)) continue;
    const median = Math.min(Math.max(rank.medianRank, 1e-9), 1 - 1e-9);
    xs.push(Math.log(shifted));
    ys.push(Math.log(-Math.log(1 - median)));
    used.push(rank);
  }
  return { xs, ys, used };
}

function fitMrr(ranks: WeibullRankPoint[], regression: WeibullRegression, t0: number): Fit | null {
  const { xs, ys } = transformRankPoints(ranks, t0);
  if (xs.length < 2) return null;
  if (regression === "x-on-y") {
    // Eq. E.1: ln t = (1/?)?ln[?ln(1?F)] + ln ?
    const model = regress(ys, xs);
    if (!(model.slope > 0)) return null;
    const beta = 1 / model.slope;
    const eta = Math.exp(model.intercept);
    return { beta, eta, r2: model.r2, line: { slope: beta, intercept: -beta * Math.log(eta) }, regression: model };
  }
  // Eq. E.2: ln[?ln(1?F)] = ??ln t ? ??ln ?
  const model = regress(xs, ys);
  if (!(model.slope > 0)) return null;
  const beta = model.slope;
  const eta = Math.exp(-model.intercept / beta);
  return { beta, eta, r2: model.r2, line: { slope: beta, intercept: model.intercept }, regression: model };
}

/** Solve the MLE shape equation (Eq. 17) with a bracketing bisection. */
function solveMleShape(failures: number[], suspended: number, stopTime: number): number | null {
  const r = failures.length;
  if (!r || !(stopTime > 0)) return null;
  const logTimes = failures.map(time => Math.log(time));
  const sumLog = logTimes.reduce((total, value) => total + value, 0);
  const stopLog = Math.log(stopTime);
  // Scale every life by T so that u = t/T <= 1 and u^? cannot overflow.
  const scaled = failures.map(time => time / stopTime);

  const equation = (beta: number) => {
    let sumPowered = 0;
    let sumPoweredLog = 0;
    for (let index = 0; index < scaled.length; index += 1) {
      const powered = Math.pow(scaled[index], beta);
      sumPowered += powered;
      sumPoweredLog += powered * logTimes[index];
    }
    const left = sumPoweredLog + suspended * stopLog;
    const right = (sumPowered + suspended) * (1 / beta + sumLog / r);
    return left - right;
  };

  let previousBeta = 1e-4;
  let previousValue = equation(previousBeta);
  let lower: number | null = null;
  let upper: number | null = null;
  const steps = 900;
  for (let step = 1; step <= steps; step += 1) {
    const beta = 1e-4 * Math.pow(200 / 1e-4, step / steps);
    const value = equation(beta);
    if (Number.isFinite(value) && Number.isFinite(previousValue) && value === 0) return beta;
    if (Number.isFinite(value) && Number.isFinite(previousValue) && value * previousValue < 0) {
      lower = previousBeta;
      upper = beta;
      break;
    }
    previousBeta = beta;
    previousValue = value;
  }
  if (lower === null || upper === null) return null;
  let lowEdge: number = lower;
  let highEdge: number = upper;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle: number = (lowEdge + highEdge) / 2;
    const value = equation(middle);
    if (!Number.isFinite(value)) return middle;
    if (equation(lowEdge) * value <= 0) highEdge = middle;
    else lowEdge = middle;
  }
  return (lowEdge + highEdge) / 2;
}

function fitMle(observations: WeibullObservation[], t0: number): Fit | null {
  const shifted = observations.map(observation => ({ ...observation, time: observation.time - t0 })).filter(observation => observation.time > 0);
  const failures = shifted.filter(observation => !observation.suspended).map(observation => observation.time);
  const suspended = shifted.length - failures.length;
  if (!failures.length) return null;
  const stopTime = Math.max(...shifted.map(observation => observation.time));
  const beta = solveMleShape(failures, suspended, stopTime);
  if (!beta || !Number.isFinite(beta) || beta <= 0) return null;

  // Eq. 18, scaled by T so the power sum stays finite.
  let sumPowered = 0;
  for (const time of failures) sumPowered += Math.pow(time / stopTime, beta);
  if (suspended) sumPowered += suspended;
  const eta = stopTime * Math.pow(sumPowered / failures.length, 1 / beta);
  if (!Number.isFinite(eta) || eta <= 0) return null;

  return { beta, eta, r2: 0, line: { slope: beta, intercept: -beta * Math.log(eta) }, regression: null };
}

/** WeiBayes with a known shape parameter, Eq. 48. */
function fitWeiBayes(observations: WeibullObservation[], beta: number, t0: number, confidence: number): { fit: Fit; effectiveFailures: number } | null {
  const shifted = observations.map(observation => ({ ...observation, time: observation.time - t0 })).filter(observation => observation.time > 0);
  const failures = shifted.filter(observation => !observation.suspended).length;
  if (!shifted.length || !(beta > 0)) return null;
  // Zero-failure WeiBayes uses a fictitious denominator (Clause 12.3).
  const effectiveFailures = failures > 0 ? failures : confidenceDenominator(confidence);
  const stopTime = Math.max(...shifted.map(observation => observation.time));
  let sumPowered = 0;
  for (const observation of shifted) sumPowered += Math.pow(observation.time / stopTime, beta);
  const eta = stopTime * Math.pow(sumPowered / effectiveFailures, 1 / beta);
  if (!Number.isFinite(eta) || eta <= 0) return null;
  return {
    fit: { beta, eta, r2: 0, line: { slope: beta, intercept: -beta * Math.log(eta) }, regression: null },
    effectiveFailures,
  };
}

/** Fictitious failure denominator for zero-failure WeiBayes, Clause 12.3. */
export function confidenceDenominator(confidence: number): number {
  if (confidence >= 0.99) return 4.6;
  if (confidence >= 0.95) return 3.0;
  if (confidence >= 0.9) return 2.3;
  if (confidence >= 0.632) return 1.0;
  return 0.693;
}

/** Choose t0 by maximising the linearity of the MRR plot (Clause 8.5/Annex H). */
export function estimateT0(points: WeibullDataPoint[], regression: WeibullRegression): number {
  const observations = expandObservations(points);
  const ranks = adjustedRanks(observations);
  if (ranks.length < 3) return 0;
  const minimum = Math.min(...ranks.map(rank => rank.time));
  if (!(minimum > 0)) return 0;
  const evaluate = (candidate: number) => {
    const fit = fitMrr(ranks, regression, candidate);
    return fit && Number.isFinite(fit.r2) ? fit.r2 : -Infinity;
  };
  let bestT0 = 0;
  let bestR2 = evaluate(0);
  const upper = minimum * 0.98;
  const steps = 180;
  for (let step = 1; step <= steps; step += 1) {
    const candidate = (upper * step) / steps;
    const r2 = evaluate(candidate);
    if (r2 > bestR2) { bestR2 = r2; bestT0 = candidate; }
  }
  // Refine around the best grid point.
  const width = upper / steps;
  let low = Math.max(0, bestT0 - width);
  let high = Math.min(upper, bestT0 + width);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (evaluate(left) < evaluate(right)) low = left;
    else high = right;
  }
  const refined = (low + high) / 2;
  return evaluate(refined) >= bestR2 ? refined : bestT0;
}

/* -------------------------------------------------------------------------- */
/* Approximate parameter intervals                                             */
/* -------------------------------------------------------------------------- */

function fisherInterval(failures: number[], suspended: number, stopTime: number, beta: number, eta: number, confidence: number): { betaCi: [number, number]; etaCi: [number, number] } | null {
  const mu = Math.log(eta);
  const logTimes = failures.map(time => Math.log(time));
  const stopLog = Math.log(stopTime);
  const logLikelihood = (shape: number, location: number) => {
    let value = 0;
    for (const logTime of logTimes) {
      const powered = Math.exp(shape * (logTime - location));
      value += Math.log(shape) - shape * location + (shape - 1) * logTime - powered;
    }
    if (suspended) value -= suspended * Math.exp(shape * (stopLog - location));
    return value;
  };
  const h = 1e-4;
  const base = logLikelihood(beta, mu);
  const fbb = (logLikelihood(beta + h, mu) - 2 * base + logLikelihood(beta - h, mu)) / (h * h);
  const fmm = (logLikelihood(beta, mu + h) - 2 * base + logLikelihood(beta, mu - h)) / (h * h);
  const fbm = (logLikelihood(beta + h, mu + h) - logLikelihood(beta + h, mu - h) - logLikelihood(beta - h, mu + h) + logLikelihood(beta - h, mu - h)) / (4 * h * h);
  const i11 = -fbb;
  const i22 = -fmm;
  const i12 = -fbm;
  const determinant = i11 * i22 - i12 * i12;
  if (!(determinant > 0) || !Number.isFinite(determinant)) return null;
  const varianceBeta = i22 / determinant;
  const varianceMu = i11 / determinant;
  if (!(varianceBeta > 0) || !(varianceMu > 0)) return null;
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const betaLow = Math.max(1e-6, beta - z * Math.sqrt(varianceBeta));
  const betaHigh = beta + z * Math.sqrt(varianceBeta);
  const etaLow = Math.exp(mu - z * Math.sqrt(varianceMu));
  const etaHigh = Math.exp(mu + z * Math.sqrt(varianceMu));
  return { betaCi: [betaLow, betaHigh], etaCi: [etaLow, etaHigh] };
}

function regressionInterval(fit: Fit, regression: WeibullRegression, confidence: number): { betaCi: [number, number]; etaCi: [number, number] } | null {
  const model = fit.regression;
  if (!model || model.count < 3) return null;
  const residual = model.syy - model.slope * model.sxy;
  const variance = residual / Math.max(1, model.count - 2);
  if (!(variance > 0) || !Number.isFinite(variance)) return null;
  const z = normalQuantile(1 - (1 - confidence) / 2);
  if (regression === "x-on-y") {
    // Regressed ln t on Y; slope = 1/?, intercept = ln ?.
    const standardErrorSlope = Math.sqrt(variance / model.sxx);
    const standardErrorIntercept = Math.sqrt(variance * (1 / model.count + (model.meanX * model.meanX) / model.sxx));
    const beta = fit.beta;
    const deltaBeta = standardErrorSlope * beta * beta;
    const logEta = Math.log(fit.eta);
    return {
      betaCi: [Math.max(1e-6, beta - z * deltaBeta), beta + z * deltaBeta],
      etaCi: [Math.exp(logEta - z * standardErrorIntercept), Math.exp(logEta + z * standardErrorIntercept)],
    };
  }
  const standardErrorSlope = Math.sqrt(variance / model.sxx);
  const standardErrorIntercept = Math.sqrt(variance * (1 / model.count + (model.meanX * model.meanX) / model.sxx));
  const beta = fit.beta;
  const logEta = -model.intercept / beta;
  const deltaLogEta = Math.sqrt((standardErrorIntercept / beta) ** 2 + ((model.intercept * standardErrorSlope) / (beta * beta)) ** 2);
  return {
    betaCi: [Math.max(1e-6, beta - z * standardErrorSlope), beta + z * standardErrorSlope],
    etaCi: [Math.exp(logEta - z * deltaLogEta), Math.exp(logEta + z * deltaLogEta)],
  };
}

/* -------------------------------------------------------------------------- */
/* Main analysis                                                               */
/* -------------------------------------------------------------------------- */

function describeRegime(beta: number, betaCi: [number, number] | null): { regime: WeibullRegime; label: string; description: string } {
  const includesOne = Boolean(betaCi && betaCi[0] <= 1 && betaCi[1] >= 1);
  const suffix = includesOne
    ? " The parameter interval includes ? = 1, so a constant failure rate cannot be excluded."
    : "";
  if (beta < 0.95) {
    return {
      regime: "infant",
      label: "Infant mortality (? < 1)",
      description: "The hazard falls with age. Look for production, assembly, burn-in or screening weaknesses; preventive replacement is usually inappropriate because surviving items improve." + suffix,
    };
  }
  if (beta <= 1.05) {
    return {
      regime: "random",
      label: "Random failures (? ? 1)",
      description: "The hazard is approximately constant and the Weibull reduces to the exponential distribution. Failures are not age-related, so scheduled replacement does not reduce the rate." + suffix,
    };
  }
  return {
    regime: "wearout",
    label: "Wear-out (? > 1)",
    description: "The hazard increases with age. Wear, fatigue, corrosion or damage accumulation is likely; a three-parameter fit can estimate the failure-free life t?." + suffix,
  };
}

export function analyzeWeibull(points: WeibullDataPoint[], options: WeibullOptions, missionTimes: number[] = []): WeibullAnalysis {
  const empty = (error: string): WeibullAnalysis => ({
    ok: false, error, method: options.method, regression: options.regression,
    beta: Number.NaN, eta: Number.NaN, t0: 0, r2: 0, n: 0, r: 0, suspended: 0, mttf: Number.NaN,
    bLives: [], plotPoints: [], rankPoints: [], line: { slope: Number.NaN, intercept: Number.NaN },
    betaCi: null, etaCi: null, betaCiIncludesOne: false, reliability: [],
    warnings: [], regime: "random", regimeLabel: "", regimeDescription: "", effectiveFailures: 0,
  });

  const observations = expandObservations(points);
  if (!observations.length) return empty("Enter at least one failure time to analyse.");
  const failures = observations.filter(observation => !observation.suspended);
  const isWeiBayes = options.method === "weibayes";
  if (!failures.length && !isWeiBayes) return empty("At least one failure is required. Choose WeiBayes when ? is known and the sample has zero failures.");
  const ranks = adjustedRanks(observations);
  if (ranks.length < 2 && !isWeiBayes) return empty("At least two failures are required to estimate both ? and ?. Use WeiBayes if ? is known.");

  const t0 = options.threeParameter ? estimateT0(points, options.regression) : 0;
  const warnings: string[] = [];
  let fit: Fit | null = null;
  let effectiveFailures = failures.length;

  if (options.method === "weibayes") {
    const result = fitWeiBayes(observations, options.assumedBeta, t0, options.confidence);
    if (!result) return empty("The WeiBayes shape must be a positive number.");
    fit = result.fit;
    effectiveFailures = result.effectiveFailures;
  } else if (options.method === "mle") {
    fit = fitMle(observations, t0);
    if (!fit) {
      warnings.push("The MLE shape equation did not converge; the median-rank regression result is shown instead.");
      fit = fitMrr(ranks, options.regression, t0);
    }
  } else {
    fit = fitMrr(ranks, options.regression, t0);
  }

  if (!fit || !Number.isFinite(fit.beta) || !Number.isFinite(fit.eta) || fit.beta <= 0 || fit.eta <= 0) {
    return empty("The Weibull parameters could not be estimated. Check for non-positive times, a single distinct failure time, or a regression direction that produces a negative slope.");
  }

  // Descriptive r? of the median-rank points (Eq. 9).
  const { xs, ys } = transformRankPoints(ranks, t0);
  let r2 = fit.r2;
  if (!r2 && xs.length >= 2) {
    const descriptive = regress(xs, ys);
    r2 = descriptive.r2;
  }

  const beta = fit.beta;
  const eta = fit.eta;

  // Parameter intervals.
  let betaCi: [number, number] | null = null;
  let etaCi: [number, number] | null = null;
  if (options.method === "mle") {
    const shiftedFailures = failures.map(observation => observation.time - t0).filter(time => time > 0);
    const stopTime = Math.max(...observations.map(observation => observation.time - t0).filter(time => time > 0));
    const interval = fisherInterval(shiftedFailures, observations.length - failures.length, stopTime, beta, eta, options.confidence);
    if (interval) { betaCi = interval.betaCi; etaCi = interval.etaCi; }
  } else if (options.method === "mrr") {
    const interval = regressionInterval(fit, options.regression, options.confidence);
    if (interval) { betaCi = interval.betaCi; etaCi = interval.etaCi; }
  } else if (effectiveFailures >= 1) {
    // One-sided lower bound of the WeiBayes line, Eq. 49.
    const chi = chiSquareQuantile(1 - options.confidence, 2 * effectiveFailures + 2);
    const lower = eta * Math.pow(chi / (2 * effectiveFailures), 1 / beta);
    if (Number.isFinite(lower) && lower > 0) etaCi = [lower, eta];
  }

  const bLives = WEIBULL_B_LIVES.map(entry => ({ ...entry, value: weibullBLife(entry.p, beta, eta, t0) }));
  const mttf = weibullMttf(beta, eta, t0);

  const plotPoints: WeibullPlotPoint[] = ranks.map(rank => {
    const time = rank.time;
    const fittedRank = weibullCdf(time, beta, eta, t0);
    let lowerTime: number | null = null;
    let upperTime: number | null = null;
    if (observations.length >= 2 && Number.isFinite(rank.adjustedRank)) {
      const a = rank.adjustedRank;
      const b = observations.length - rank.adjustedRank + 1;
      const fLow = betaQuantile(0.05, a, b);
      const fHigh = betaQuantile(0.95, a, b);
      if (Number.isFinite(fLow) && fLow > 0 && fLow < 1) lowerTime = t0 + eta * Math.pow(-Math.log(1 - fLow), 1 / beta);
      if (Number.isFinite(fHigh) && fHigh > 0 && fHigh < 1) upperTime = t0 + eta * Math.pow(-Math.log(1 - fHigh), 1 / beta);
    }
    return { order: rank.order, time, medianRank: rank.medianRank, fittedRank, lowerTime, upperTime, suspended: false };
  });

  const reliability = missionTimes
    .filter(time => Number.isFinite(time) && time >= 0)
    .sort((first, second) => first - second)
    .map(time => ({
      time,
      reliability: weibullReliability(time, beta, eta, t0),
      hazard: weibullHazard(time, beta, eta, t0),
      cumulativeHazard: weibullCumulativeHazard(time, beta, eta, t0),
    }));

  const r = failures.length;
  const n = observations.length;
  const suspended = n - r;

  if (options.threeParameter && t0 > 0) {
    const earliest = Math.min(...observations.map(observation => observation.time));
    if (t0 >= earliest * 0.95) warnings.push("t? is close to the earliest observed time; the three-parameter fit may be over-fitting the first point. Confirm the location parameter against a physical failure-free threshold.");
  }
  if (options.method === "weibayes" && r === 0) {
    warnings.push(`Zero failures: ? uses the fictitious failure count ${effectiveFailures.toFixed(1)} for ${(options.confidence * 100).toFixed(1)} % confidence (Clause 12.3). The result is a lower-bound estimate, not an observed life.`);
  }
  if (r < 2) warnings.push("Fewer than two failures: parameter uncertainty is too large to confirm the Weibull model.");
  if (options.method === "mle" && r < 10) warnings.push("IEC 61649 Clause 9 limits the MLE procedure to at least 10 relevant failures.");
  if (options.method === "mle" && suspended > 0) warnings.push("Clause 9 MLE assumes a single censoring time T. Verify that the suspensions share the test-stop time.");
  if (options.threeParameter && r < 21) warnings.push("Clause 8.5 recommends at least 21 failures for a three-parameter Weibull (8-10 only with strong prior knowledge).");
  if (options.threeParameter && t0 > 0) warnings.push("A non-zero t? needs a physical reason why failure cannot occur before it; the three-parameter model always fits at least as well as the two-parameter one.");
  if (options.method === "mrr" && options.regression === "x-on-y" && n <= 20) warnings.push("Clause 11.3 prefers X-on-Y median-rank regression for 20 or fewer data points.");
  if (r2 > 0 && r2 < 0.9) warnings.push("r? is below the 90.3 % guide value quoted in Annex B. Inspect the plot for curvature, outliers or mixed failure modes.");
  if (suspended > n * 0.5 && options.method === "mle") warnings.push("More than half of the items are suspended; the MLE interval approximation may be optimistic.");

  const regime = describeRegime(beta, betaCi);

  return {
    ok: true,
    method: options.method,
    regression: options.regression,
    beta: round(beta),
    eta: round(eta),
    t0: round(t0),
    r2: round(r2),
    n, r, suspended,
    mttf: round(mttf),
    bLives: bLives.map(entry => ({ ...entry, value: round(entry.value) })),
    plotPoints: plotPoints.map(point => ({
      ...point,
      medianRank: round(point.medianRank),
      fittedRank: round(point.fittedRank),
      lowerTime: point.lowerTime === null ? null : round(point.lowerTime),
      upperTime: point.upperTime === null ? null : round(point.upperTime),
    })),
    rankPoints: ranks.map(rank => ({ ...rank, adjustedRank: round(rank.adjustedRank), medianRank: round(rank.medianRank) })),
    line: { slope: round(fit.line.slope), intercept: round(fit.line.intercept) },
    betaCi: betaCi ? [round(betaCi[0]), round(betaCi[1])] : null,
    etaCi: etaCi ? [round(etaCi[0]), round(etaCi[1])] : null,
    betaCiIncludesOne: Boolean(betaCi && betaCi[0] <= 1 && betaCi[1] >= 1),
    reliability: reliability.map(point => ({
      time: point.time,
      reliability: round(point.reliability),
      hazard: round(point.hazard),
      cumulativeHazard: round(point.cumulativeHazard),
    })),
    warnings,
    regime: regime.regime,
    regimeLabel: regime.label,
    regimeDescription: regime.description,
    effectiveFailures,
  };
}

/**
 * Material expected-life model used by the LRU table.
 *
 * The parameters are the design-life values in the source workbook: a shape
 * factor ? that describes the wear-out mode and a characteristic life ? equal
 * to the expected/design life of the component in years. The evaluation point
 * is the analysis horizon (10 years by default), so the figures answer
 * "what is the failure rate and reliability of this LRU after t years?".
 *
 *   ?(t) = (?/?) ? (t/?)^(??1)      failures per year
 *   R(t) = exp{?(t/?)^?}            probability of survival to t
 *   FPMH = ?(t) / 8760 ? 10^6       failures per million hours
 *   MTBF = 1 / ?(t)                 years
 */
export type WeibullMaterial = {
  key: string;
  /** Material label shown in the table and the library. */
  material: string;
  beta: number;
  eta: number;
  failureMode: string;
  lifeRange: string;
  reason: string;
};

export type WeibullLru = {
  id: string;
  component: string;
  materialKey: string;
  /** Characteristic life in years. Editable per LRU. */
  eta: number;
  /** Shape factor. Editable per LRU. */
  beta: number;
  /** Planned replacement age in years (maintenance policy, not a model output). */
  replaceAt: number;
};

export type WeibullMaterialLife = {
  /** Failure rate at the analysis horizon, per year. */
  lambda: number;
  /** Failures per million hours at the analysis horizon. */
  fpmh: number;
  /** Survival probability at the analysis horizon, in percent. */
  reliability: number;
  /** Mean time between failures at the analysis horizon, in years. */
  mtbfYears: number;
  /** Survival probability at the planned replacement age, in percent. */
  reliabilityAtReplace: number;
};

/** ?/? design values by material, as published in the source workbook. */
export const WEIBULL_MATERIAL_LIBRARY: WeibullMaterial[] = [
  { key: "polycarbonate", material: "POLYCARBONATE", beta: 3, eta: 16.5, failureMode: "Wear-out / Aging", lifeRange: "15?18 yrs", reason: "Indoor, low UV exposure" },
  { key: "aluminium", material: "ALUMINIUM", beta: 2, eta: 22.5, failureMode: "Wear-out / Aging", lifeRange: "20?25 yrs", reason: "Very low corrosion indoors" },
  { key: "stainless", material: "STAINLESS STEEL (SS) PARTS", beta: 2.5, eta: 22.5, failureMode: "Wear-out / Aging", lifeRange: "20?25 yrs", reason: "Minimal environmental degradation" },
  { key: "galvanized", material: "GALVANIZED SPRING STEEL", beta: 2.5, eta: 20, failureMode: "Wear-out / Aging", lifeRange: "18?22 yrs", reason: "Fatigue/wear possible over long term" },
  { key: "polyamide", material: "POLYAMIDE (PA66) PARTS", beta: 2.8, eta: 12.5, failureMode: "Wear-out / Aging", lifeRange: "10?15 yrs", reason: "Thermal ageing over time" },
  { key: "fr4", material: "FR4 PCB", beta: 2.2, eta: 13.5, failureMode: "Wear-out / Aging", lifeRange: "12?15 yrs", reason: "Thermal/electrical ageing" },
];

/** Evaluate one LRU at the given life horizon (years). */
export function evaluateMaterialLife(eta: number, beta: number, horizonYears: number, replaceAt: number): WeibullMaterialLife {
  const safeEta = Number.isFinite(eta) && eta > 0 ? eta : Number.NaN;
  const safeBeta = Number.isFinite(beta) && beta > 0 ? beta : Number.NaN;
  const t = Number.isFinite(horizonYears) && horizonYears > 0 ? horizonYears : 0;
  if (!Number.isFinite(safeEta) || !Number.isFinite(safeBeta)) {
    return { lambda: Number.NaN, fpmh: Number.NaN, reliability: Number.NaN, mtbfYears: Number.NaN, reliabilityAtReplace: Number.NaN };
  }
  const lambda = (safeBeta / safeEta) * Math.pow(t / safeEta, safeBeta - 1);
  const replace = Number.isFinite(replaceAt) && replaceAt > 0 ? replaceAt : 0;
  return {
    lambda,
    fpmh: lambda / 8760 * 1e6,
    reliability: Math.exp(-Math.pow(t / safeEta, safeBeta)) * 100,
    mtbfYears: lambda > 0 ? 1 / lambda : Number.POSITIVE_INFINITY,
    reliabilityAtReplace: replace > 0 ? Math.exp(-Math.pow(replace / safeEta, safeBeta)) * 100 : Number.NaN,
  };
}

/** Starter LRU list: the indoor railway application in the source workbook. */
export function weibullMaterialExample(): WeibullLru[] {
  const rows: [string, string, number, number, number][] = [
    ["END CAP", "aluminium", 22.5, 2, 17.4],
    ["MAIN DIFFUSER", "polycarbonate", 16.5, 3, 12.3],
    ["DRIVER HOUSING", "aluminium", 22.5, 2, 17.4],
    ["DRIVER END CAP", "aluminium", 22.5, 2, 17.4],
    ["WAGO CONNECTOR 721-102/721-602", "polyamide", 12.5, 2.8, 8.3],
    ["WAGO CONNECTOR 721-103/721-603", "polyamide", 12.5, 2.8, 8.3],
    ["CONNECTOR 261-102", "polyamide", 12.5, 2.8, 8.3],
    ["DRIVER PCB", "fr4", 13.5, 2.2, 6.6],
    ["SHIELD CLAMP", "galvanized", 20, 2.5, 14.9],
    ["EARTHING SCREW (M4)", "stainless", 22.5, 2.5, 17.4],
    ["PAN HEAD SCREW M5X35mm", "stainless", 22.5, 2.5, 17.4],
    ["SPRING WASHER M5", "stainless", 20, 2.5, 14.9],
    ["PAN HEAD SCREW M4X8mm", "stainless", 22.5, 2.5, 17.4],
  ];
  return rows.map(([component, materialKey, eta, beta, replaceAt], index) => ({
    id: `lru-${index + 1}`,
    component,
    materialKey,
    eta,
    beta,
    replaceAt,
  }));
}

export function materialByKey(key: string) {
  return WEIBULL_MATERIAL_LIBRARY.find(entry => entry.key === key);
}


export function weibullExample(kind: "annexB" | "annexE" | "weibayes"): WeibullDataPoint[] {
  let serial = 0;
  const make = (time: number, quantity = 1, suspended = false): WeibullDataPoint => ({
    id: `${kind}-${serial++}`,
    time, quantity, suspended,
  });
  if (kind === "annexE") {
    return [12, 20, 34, 65, 91, 134, 178, 246, 378, 512].map(time => make(time));
  }
  if (kind === "weibayes") {
    return [make(1600), make(2900), make(3100)];
  }
  return [
    ...[5, 10, 17, 32, 32, 33, 34, 36, 54, 55, 55, 58, 58, 61, 64, 65, 65, 66, 67, 68].map(time => make(time)),
    make(68, 20, true),
  ];
}

export { EULER_GAMMA };
