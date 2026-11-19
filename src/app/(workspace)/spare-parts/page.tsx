"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import SparesWorkbench from "@/components/spares/spares-workbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "tag", label: "Tag", width: 24 },
  { key: "description", label: "Description", width: 30 },
  { key: "lambda", label: "? (1/h)", width: 16 },
  { key: "mttr", label: "MTTR (h)", width: 16 },
  { key: "recommendedSpares", label: "Recommended spares", width: 24 },
  { key: "cycleServiceLevel", label: "Cycle SL", width: 14 },
];

const explanation = [
  { topic: "IEC 61703 availability model", description: "MTBF, MTTR and availability calculations for repairable items. Failure rate ? in failures per operating hour.", formula: "A(t) = MTBF / (MTBF + MTTR)" },
  { topic: "Poisson demand provisioning", description: "Recommended spares sized to reach the target cycle service level over the protection period. Uses Poisson or normal approximation depending on demand size.", formula: "P(X ? S) ? SL  where  X ~ Poisson(??Q?E)  and  S = recommendedSpares" },
  { topic: "Pipeline stock", description: "Spares held in the supply pipeline (lead time + repair turnaround) to cover demand during procurement and repair.", formula: "Pipeline = ? ? Q ? (leadTimeDays ? 24 + repairTurnaroundDays ? 24)" },
  { topic: "Weighted service level", description: "Average cycle service level across all items, weighted by annual failure count. Higher weight on safety-critical items.", formula: "?(annualFailures_i ? cycleServiceLevel_i) / ? annualFailures_i" },
];

export default function SpareParts() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("spares");
  return <AppShell title="Spare Parts Analysis" document={document} documentName={document?.name ?? "Untitled Spare Parts"} eyebrow="EN 50126-3 / IEC 60300-3-3" actions={<ExportDialog title="Spares Report" subtitle={document ? `${document.name} ? Service-level Spares` : "Service-level Spares"} columns={columns} rows={rows} captureSelector=".spares-workbench .spares-summary" explanation={explanation}/>}><SparesWorkbench documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}