"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import LccCmWorkbench from "@/components/lcc/lcc-cm-workbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "tag", label: "Tag", width: 24 },
  { key: "description", label: "Description", width: 30 },
  { key: "cm", label: "CM Profile", width: 28 },
  { key: "acquisition", label: "Acquisition", width: 16 },
  { key: "npv", label: "NPV", width: 16 },
];

const explanation = [
  { topic: "IEC 60300-3-3 LCC framework", description: "Whole-life cost analysis across acquisition, ownership and retirement stages. Acquisition (stages A.1?A.3) and ownership (stages A.4?A.6).", formula: "LCC = Acquisition + Ownership ? Residual + Disposal" },
  { topic: "Corrective Maintenance task", description: "Unscheduled repair event triggered by failure, with labour, parts, downtime and logistic delay costs.", formula: "CM event cost = (labourHours ? labourRate) + partsCostPerRepair + downtimeHours ? downtimeCostPerHour + logisticDelayHours ? calloutCost" },
  { topic: "Whole-life NPV", description: "Net present value of all recurring costs discounted at the agreed rate, plus acquisition and disposal.", formula: "NPV = ? CF_t / (1 + r)^t  + acquisition + disposal / (1 + r)^horizon" },
];

export default function LccCm() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("lcccm");
  return <AppShell title="LCC ? Corrective Maintenance" document={document} documentName={document?.name ?? "Untitled LCC-CM"} eyebrow="IEC 60300-3-3 LCC-CM" actions={<ExportDialog title="LCC-CM Report" subtitle={document ? `${document.name} ? Corrective Maintenance LCC` : "Corrective Maintenance LCC"} columns={columns} rows={rows} captureSelector=".lcc-cm-workbench .lcc-summary" explanation={explanation}/>}><LccCmWorkbench documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}