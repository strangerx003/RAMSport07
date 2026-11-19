"use client";

import { useMemo } from "react";
import { weibullCdf, type WeibullAnalysis } from "@/engine/weibull";

const WIDTH = 940;
const HEIGHT = 490;
const MARGIN = { top: 26, right: 30, bottom: 62, left: 78 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

const Y_TICKS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.632, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99];

function transform(probability: number) {
  return Math.log(-Math.log(1 - probability));
}

function clampProbability(value: number) {
  return Math.min(Math.max(value, 1e-4), 1 - 1e-4);
}

function niceTicks(minimum: number, maximum: number, count = 7): number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !(maximum > minimum)) return [];
  const span = maximum - minimum;
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(multiplier => multiplier * power).find(candidate => candidate >= rough) ?? 10 * power;
  const first = Math.ceil(minimum / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= maximum + step * 1e-6 && ticks.length < 12; value += step) ticks.push(value);
  return ticks;
}

function tickLabel(value: number) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-3) return value.toExponential(0);
  if (magnitude >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

type Props = {
  analysis: WeibullAnalysis;
  /** Times of items removed from test without failure, marked on the fitted line. */
  suspendedTimes?: number[];
};

/**
 * Weibull probability plot: x = ln(t - t0), y = ln[-ln(1 - F(t))].
 * A two-parameter Weibull is a straight line in these coordinates, so the
 * median-rank points and the fitted regression line can be inspected directly.
 */
export default function WeibullPlot({ analysis, suspendedTimes = [] }: Props) {
  const model = useMemo(() => {
    if (!analysis.ok) return null;
    const t0 = analysis.t0 || 0;
    const pointTimes = analysis.plotPoints.map(point => point.time).filter(time => time > t0);
    if (!pointTimes.length) return null;

    const yLow = transform(0.01) - 0.18;
    const yHigh = transform(0.99) + 0.18;
    const slope = analysis.line.slope;
    const intercept = analysis.line.intercept;

    let xMin = Math.log(Math.min(...pointTimes) - t0);
    let xMax = Math.log(Math.max(...pointTimes) - t0);
    if (slope > 0 && Number.isFinite(intercept)) {
      xMin = Math.min(xMin, (yLow - intercept) / slope);
      xMax = Math.max(xMax, (yHigh - intercept) / slope);
    }
    if (!(xMax - xMin > 1e-6)) { xMin -= 0.5; xMax += 0.5; }
    const padding = (xMax - xMin) * 0.035;
    xMin -= padding;
    xMax += padding;

    const x = (value: number) => MARGIN.left + ((value - xMin) / (xMax - xMin)) * PLOT_WIDTH;
    const y = (value: number) => MARGIN.top + ((yHigh - value) / (yHigh - yLow)) * PLOT_HEIGHT;
    const timeX = (time: number) => x(Math.log(Math.max(time - t0, 1e-9)));

    const timeMinimum = t0 + Math.exp(xMin);
    const timeMaximum = t0 + Math.exp(xMax);
    const xTicks = niceTicks(timeMinimum, timeMaximum, 7)
      .filter(time => time > t0 && time <= timeMaximum)
      .map(time => ({ time, x: timeX(time) }));
    const yTicks = Y_TICKS
      .map(probability => ({ probability, value: transform(probability) }))
      .filter(tick => tick.value >= yLow && tick.value <= yHigh)
      .map(tick => ({ ...tick, y: y(tick.value) }));

    const fit = slope > 0 && Number.isFinite(intercept)
      ? {
          x1: x((yLow - intercept) / slope),
          y1: y(yLow),
          x2: x((yHigh - intercept) / slope),
          y2: y(yHigh),
        }
      : null;

    const points = analysis.plotPoints
      .filter(point => point.time > t0)
      .map(point => ({
        ...point,
        x: timeX(point.time),
        y: y(transform(clampProbability(point.medianRank))),
      }));

    const suspensions = suspendedTimes
      .filter(time => Number.isFinite(time) && time > t0)
      .map(time => {
        const probability = weibullCdf(time, analysis.beta, analysis.eta, t0);
        if (!(probability > 0 && probability < 1)) return null;
        return { time, x: timeX(time), y: y(transform(probability)) };
      })
      .filter((mark): mark is { time: number; x: number; y: number } => Boolean(mark));

    const b10 = analysis.bLives.find(entry => entry.label === "B10");
    const b10Mark = b10 && Number.isFinite(b10.value) && b10.value > t0 && b10.value <= timeMaximum
      ? { value: b10.value, x: timeX(b10.value) }
      : null;

    return { t0, xMin, xMax, yLow, yHigh, x, y, timeX, xTicks, yTicks, fit, points, suspensions, b10Mark, timeMinimum, timeMaximum };
  }, [analysis, suspendedTimes]);

  if (!analysis.ok || !model) {
    return <div className="weibull-plot-empty"><strong>No plot yet</strong><p>{analysis.error || "Add failure times to draw the probability plot."}</p></div>;
  }

  const { x, y, xTicks, yTicks, fit, points, suspensions, b10Mark, t0 } = model;

  return (
    <svg className="weibull-plot" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Weibull probability plot with median-rank points and fitted line">
      <rect className="wbl-plot-bg" x={MARGIN.left} y={MARGIN.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="3"/>

      {yTicks.map(tick => (
        <g key={`y-${tick.probability}`}>
          <line className="wbl-grid" x1={MARGIN.left} x2={MARGIN.left + PLOT_WIDTH} y1={tick.y} y2={tick.y}/>
          <text className="wbl-tick-label" x={MARGIN.left - 10} y={tick.y + 3.5} textAnchor="end">
            {(tick.probability * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
          </text>
        </g>
      ))}

      {xTicks.map(tick => (
        <g key={`x-${tick.time}`}>
          <line className="wbl-grid" x1={tick.x} x2={tick.x} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}/>
          <text className="wbl-tick-label" x={tick.x} y={MARGIN.top + PLOT_HEIGHT + 18} textAnchor="middle">{tickLabel(tick.time)}</text>
        </g>
      ))}

      <line className="wbl-axis" x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}/>
      <line className="wbl-axis" x1={MARGIN.left} x2={MARGIN.left + PLOT_WIDTH} y1={MARGIN.top + PLOT_HEIGHT} y2={MARGIN.top + PLOT_HEIGHT}/>

      <text className="wbl-axis-title" x={MARGIN.left + PLOT_WIDTH / 2} y={HEIGHT - 14} textAnchor="middle">
        Time / cycles / life measure{t0 > 0 ? ` (t ? t?, t? = ${tickLabel(t0)})` : ""}
      </text>
      <text className="wbl-axis-title" x={18} y={MARGIN.top + PLOT_HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 18 ${MARGIN.top + PLOT_HEIGHT / 2})`}>
        Cumulative failure probability F(t)
      </text>

      {b10Mark && (
        <g>
          <line className="wbl-b10" x1={b10Mark.x} x2={b10Mark.x} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}/>
          <text className="wbl-b10-label" x={b10Mark.x + 5} y={MARGIN.top + 12}>B10</text>
        </g>
      )}

      {fit && <line className="wbl-fit" x1={fit.x1} y1={fit.y1} x2={fit.x2} y2={fit.y2}/>}

      {points.map(point => (
        <g key={`point-${point.order}`}>
          {point.lowerTime !== null && point.upperTime !== null && point.lowerTime > t0 && point.upperTime > t0 && (
            <g className="wbl-whisker">
              <line x1={x(Math.log(point.lowerTime - t0))} x2={x(Math.log(point.upperTime - t0))} y1={point.y} y2={point.y}/>
              <line x1={x(Math.log(point.lowerTime - t0))} x2={x(Math.log(point.lowerTime - t0))} y1={point.y - 4} y2={point.y + 4}/>
              <line x1={x(Math.log(point.upperTime - t0))} x2={x(Math.log(point.upperTime - t0))} y1={point.y - 4} y2={point.y + 4}/>
            </g>
          )}
          <circle className="wbl-point" cx={point.x} cy={point.y} r="4.4">
            <title>{`t = ${tickLabel(point.time)} ? F = ${(point.medianRank * 100).toFixed(1)}%`}</title>
          </circle>
        </g>
      ))}

      {suspensions.map(mark => (
        <g className="wbl-suspended" key={`suspended-${mark.time}`} transform={`translate(${mark.x} ${mark.y})`}>
          <path d="M-4 -4 L4 4 M4 -4 L-4 4">
            <title>{`Suspended at t = ${tickLabel(mark.time)}`}</title>
          </path>
        </g>
      ))}

      <g className="wbl-legend" transform={`translate(${MARGIN.left + 12} ${MARGIN.top + 14})`}>
        <circle cx="0" cy="0" r="4"/>
        <text x="10" y="4">Failure (median rank)</text>
        <line x1="0" x2="18" y1="18" y2="18"/>
        <text x="26" y="22">Fitted Weibull</text>
        <g transform="translate(138 18)"><path d="M-4 -4 L4 4 M4 -4 L-4 4"/></g>
        <text x="148" y="22">Suspended</text>
        <g transform="translate(232 18)"><line x1="-9" x2="9" y1="0" y2="0"/><line x1="-9" x2="-9" y1="-3" y2="3"/><line x1="9" x2="9" y1="-3" y2="3"/></g>
        <text x="246" y="22">90% plotting bounds</text>
      </g>

      <text className="wbl-caption" x={WIDTH - MARGIN.right} y={MARGIN.top + 14} textAnchor="end">
        {`? = ${analysis.beta.toFixed(3)}  ?  ? = ${analysis.eta.toFixed(2)}${analysis.t0 ? `  ?  t? = ${analysis.t0.toFixed(2)}` : ""}`}
      </text>
    </svg>
  );
}
