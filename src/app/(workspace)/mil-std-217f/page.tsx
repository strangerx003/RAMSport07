"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Mil217fWorkbench from "@/components/mil217f/Mil217fWorkbench";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "parameter", label: "Parameter", width: 34 },
  { key: "value", label: "Value", width: 26 },
  { key: "detail", label: "Basis / formula", width: 40 },
];
const explanation = [
  { topic: "Part stress analysis", description: "Failure rate of each part from its base rate and the handbook ? factors for temperature, stress, quality and environment.", formula: "?p = ?b ? ?T ? ?S ? ?Q ? ?E" },
  { topic: "Parts count analysis", description: "Early-life estimate using the generic part rate and quality/environment factors only.", formula: "?p = ?g ? ?Q ? ?E" },
  { topic: "Temperature factor", description: "Arrhenius acceleration from the reference temperature of 25 ?C to the junction temperature.", formula: "?T = exp[?Ea/k ? (1/Tj ? 1/298.15)]" },
  { topic: "Total failure rate", description: "Sum of the quantity-weighted part failure rates, reported in failures per hour.", formula: "? = ? n? ? ?p? ? 10??" },
  { topic: "MTBF", description: "Reciprocal of the total failure rate for a constant-rate series system.", formula: "MTBF = 1 / ?" },
  { topic: "FIT", description: "Failures in time, the number of failures expected per 10? component-hours.", formula: "FIT = ? ? 10?" },
];

export default function Mil217f() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("mil217f");
  return <AppShell title="RAM Prediction" document={document} documentName={document?.name ?? "Untitled MIL-217F"} eyebrow="MIL-HDBK-217F" actions={<ExportDialog title="MIL-HDBK-217F RAM Prediction" subtitle={document ? `${document.name} ? Electronic-component failure-rate prediction` : "Electronic-component failure-rate prediction"} columns={columns} rows={rows} captureSelector=".mil217f-workbench .mil217f-summary" explanation={explanation}/>}><Mil217fWorkbench documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}
