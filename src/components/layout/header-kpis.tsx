"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type HeaderKpi = {
  /** Symbol shown before the equals sign, e.g. "?" or "MTBF". */
  symbol: string;
  /** Short plain-language name of the figure, e.g. "Failure rate". */
  name: string;
  /** Formatted numeric result. */
  value: string;
  /** Unit shown after the value, e.g. "1/h" or "h". */
  unit?: string;
  primary?: boolean;
};

type ModuleKpisProps = {
  metrics: HeaderKpi[];
  /** Optional control rendered at the end of the strip. */
  action?: ReactNode;
  ariaLabel: string;
};

/**
 * Headline results live in the application header band, next to the module
 * title, instead of being pushed into the module itself. That keeps the module
 * toolbar fixed at the top of the panel: calculating never moves the controls
 * down and never opens a gap above them.
 *
 * Each figure is written as a symbol, an equals sign, the value and its unit
 * (`? = 6.0000e-6 /h`, `MTBF = 166,667 h`), so the result is readable at a
 * glance without any engine or standard caption.
 *
 * The strip is portalled into `#page-kpis`, which AppShell renders inside
 * `.page-header`. Nothing renders when the slot is absent (print, embedding).
 */
export function ModuleKpis({ metrics, action, ariaLabel }: ModuleKpisProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("page-kpis"));
  }, []);

  if (!host) return null;

  return createPortal(
    <div className="header-kpis" role="status" aria-label={ariaLabel}>
      {metrics.map(metric => (
        <div key={metric.symbol + metric.name} className={`header-kpi${metric.primary ? " primary" : ""}`}>
          <span className="header-kpi-name">{metric.name}</span>
          <strong>
            <em>{metric.symbol}</em>
            <b>=</b>
            <i>{metric.value}</i>
            {metric.unit && <small>{metric.unit}</small>}
          </strong>
        </div>
      ))}
      {action}
    </div>,
    host,
  );
}
