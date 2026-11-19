"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import WeibullWorkbench from "@/components/weibull/WeibullWorkbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "parameter", label: "Parameter", width: 34 },
  { key: "value", label: "Value", width: 24 },
  { key: "detail", label: "Basis / interval", width: 42 },
];
const explanation = [
  { topic: "Probability of failure", description: "Two-parameter Weibull cumulative distribution for life t measured from the location parameter t?.", formula: "F(t) = 1 - exp{-[(t - t0)/?]^?}" },
  { topic: "Reliability", description: "Probability that the item survives the mission time t.", formula: "R(t) = exp{-[(t - t0)/?]^?}" },
  { topic: "Hazard rate", description: "Instantaneous failure rate; ? < 1 decreases, ? = 1 is constant and ? > 1 increases with time.", formula: "h(t) = (?/?)?[(t - t0)/?]^(?-1)" },
  { topic: "Median ranks", description: "Benard plotting positions used for the probability-plot points; adjusted ranks handle suspensions.", formula: "F_i = (i - 0.3)/(n + 0.4)" },
  { topic: "Median-rank regression", description: "Least-squares line through the median-rank points. X-on-Y minimises horizontal deviations, Y-on-X vertical deviations.", formula: "ln[-ln(1 - F)] = ??ln(t - t0) - ??ln(?)" },
  { topic: "Maximum likelihood", description: "Shape parameter solves the likelihood equation for singly censored samples with at least ten relevant failures.", formula: "1/? + mean(ln t_i) - sum(t_i^? ln t_i)/sum(t_i^?) = 0" },
  { topic: "WeiBayes", description: "Scale parameter from a known shape parameter and a prior-equivalent failure count, including zero-failure samples.", formula: "? = [sum(t_i^?)/r_equiv]^(1/?)" },
  { topic: "B-lives", description: "Time at which the stated percentage of the population is expected to have failed.", formula: "t(F) = t0 + ??[-ln(1 - F)]^(1/?)" },
  { topic: "Mean time to failure", description: "Expected life from the fitted distribution using the gamma function.", formula: "MTTF = t0 + ???(1 + 1/?)" },
];

export default function Weibull() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("weibull");
  return <AppShell title="Weibull Analysis" document={document} documentName={document?.name ?? "Untitled Weibull"} eyebrow="IEC 61649 ANALYSIS" actions={<ExportDialog title="Weibull Analysis Report" subtitle={document ? `${document.name} ? IEC 61649 life-data analysis` : "IEC 61649 life-data analysis"} columns={columns} rows={rows} captureSelector=".weibull-workbench .weibull-plot-panel" explanation={explanation}/>}><WeibullWorkbench documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}
