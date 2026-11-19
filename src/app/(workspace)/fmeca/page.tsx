"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import FmecaWorkbench from "@/components/fmeca/FmecaWorkbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";
import type { FmecaMode } from "@/engine/fmeca";

const columns = [
  { key: "reference", label: "Reference", width: 16 },
  { key: "item", label: "Item", width: 18 },
  { key: "failureMode", label: "Failure mode", width: 18 },
  { key: "cause", label: "Cause", width: 18 },
  { key: "localEffect", label: "Local effect", width: 16 },
  { key: "nextEffect", label: "Next-higher effect", width: 16 },
  { key: "endEffect", label: "End effect", width: 16 },
  { key: "severity", label: "Severity (EN 50126)", width: 16 },
  { key: "frequency", label: "Frequency (EN 50126)", width: 16 },
  { key: "risk", label: "Risk tier", width: 12 },
  { key: "detection", label: "Detection", width: 14 },
  { key: "cm", label: "Cm", width: 8 },
  { key: "cr", label: "Cr", width: 8 },
];
const explanation = [
  { topic: "EN 50126 risk assessment", description: "Every failure mode is assigned an EN 50126 safety severity and frequency class, then read on the four-tier tolerability matrix.", formula: "Risk = f(severity S1?S5, frequency Frequent?Highly improbable)" },
  { topic: "Safety severity", description: "S1 Catastrophic (multiple fatalities), S2 Critical (single fatality), S3 Severe (major injury), S4 Minor (minor injury), S5 Negligible.", formula: "S1 > S2 > S3 > S4 > S5" },
  { topic: "Frequency classes", description: "Frequent, Probable, Occasional, Remote, Improbable and Highly improbable, with indicative per-hour bands.", formula: "?10?? ? 10???10?? ? 10???10?? ? 10???10?? ? 10???10?? ? <10?? /h" },
  { topic: "Risk tiers", description: "Intolerable, Undesirable, Tolerable and Negligible. Intolerable risk cannot be accepted; Undesirable needs reduction or recorded justified acceptance.", formula: "EN 50126-1:2017 Annex C" },
  { topic: "FMEA ? Task 101", description: "Failure mode, cause, local / next-higher / end effect, detection and compensating provision.", formula: "Worksheet columns per MIL-STD-1629A Fig. 101.1" },
  { topic: "Mode criticality Cm", description: "Optional quantitative criticality number for one failure mode.", formula: "Cm = ? ? ? ? ?p ? t" },
  { topic: "Item criticality Cr", description: "Sum of the mode criticality numbers within an EN 50126 severity class.", formula: "Cr = ? Cm" },
  { topic: "Failure-mode ratio ?", description: "Fraction of the item failure rate attributable to the mode; ratios sum to one per item.", formula: "?? = 1" },
  { topic: "Effect probability ?", description: "Conditional probability that the stated end effect occurs given the failure mode.", formula: "0 ? ? ? 1" },
];

export default function Fmeca() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [mode, setMode] = useState<FmecaMode>("fmea");
  const document = useDocumentContext("fmeca");
  // Cm/Cr are criticality numbers; they only exist in the quantitative FMECA view.
  const exportColumns = mode === "fmeca" ? columns : columns.filter(column => column.key !== "cm" && column.key !== "cr");
  return <AppShell title="FMEA / FMECA" document={document} documentName={document?.name ?? "Untitled FMECA"} eyebrow="EN 50126 ? MIL-STD-1629A" actions={<ExportDialog title="Railway FMEA / FMECA ? EN 50126 risk assessment" subtitle={document ? `${document.name} ? Failure mode, effects and criticality analysis` : "Failure mode, effects and criticality analysis"} columns={exportColumns} rows={rows} captureSelector=".fmeca-workbench .fmeca-summary" explanation={explanation}/>}><FmecaWorkbench documentPath={document?.path} onReportChange={setRows} onModeChange={setMode}/></AppShell>;
}
