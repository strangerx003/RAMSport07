"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import LccPmWorkbench from "@/components/lcc/lcc-pm-workbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "tag", label: "Tag", width: 24 },
  { key: "description", label: "Description", width: 30 },
  { key: "pmTasks", label: "PM Task", width: 28 },
  { key: "acquisition", label: "Acquisition", width: 16 },
  { key: "npv", label: "NPV", width: 16 },
];

const explanation = [
  { topic: "IEC 60300-3-3 LCC framework", description: "Whole-life cost analysis across acquisition, ownership and retirement stages. Acquisition (stages A.1?A.3) and ownership (stages A.4?A.6).", formula: "LCC = Acquisition + Ownership ? Residual + Disposal" },
  { topic: "Preventive Maintenance task", description: "Scheduled inspection or service event with a defined frequency, labour, material and downtime cost.", formula: "PM event cost = frequency ? (labourHours ? labourRate + materialCost + downtimeHours ? downtimeCostPerHour)" },
  { topic: "Whole-life NPV", description: "Net present value of all recurring costs discounted at the agreed rate, plus acquisition and disposal.", formula: "NPV = ? CF_t / (1 + r)^t  + acquisition + disposal / (1 + r)^horizon" },
];

export default function LccPm() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("lccpm");
  return <AppShell title="LCC ? Preventive Maintenance" document={document} documentName={document?.name ?? "Untitled LCC-PM"} eyebrow="IEC 60300-3-3 LCC-PM" actions={<ExportDialog title="LCC-PM Report" subtitle={document ? `${document.name} ? Preventive Maintenance LCC` : "Preventive Maintenance LCC"} columns={columns} rows={rows} captureSelector=".lcc-pm-workbench .lcc-summary" explanation={explanation}/>}><LccPmWorkbench documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}