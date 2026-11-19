"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import DiagramEditor from "@/components/rbd/DiagramEditor";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { DiagramReportRow } from "@/data/workspace";

const columns = [
  { key: "reference", label: "Block ID", width: 16 },
  { key: "component", label: "Reliability block", width: 32 },
  { key: "type", label: "Configuration", width: 18 },
  { key: "failureRate", label: "? (1/h)", width: 16 },
  { key: "mtbf", label: "MTBF (h)", width: 15 },
  { key: "mttr", label: "MTTR (h)", width: 14 },
  { key: "availability", label: "Availability", width: 15 },
];
const explanation = [
  { topic: "Series", description: "Every block in the success path must operate. System repair time is failure-rate weighted.", formula: "?s = sum(?i); MTTR_s = sum(?i * MTTR_i) / ?s; MTBF_s = 1 / ?s" },
  { topic: "K-out-of-N", description: "At least K of N channels must operate. Parallel redundancy such as 1oo2 is evaluated by this method.", formula: "?s = n! * ?i^(n-r+1) * T_i^(n-r) / ((r-1)! * (n-r+1)!); MTTR_s = 1 / ((n-r+1) * mu)" },
  { topic: "Open", description: "No complete connection exists between the input and output sides.", formula: "A = 0" },
];

export default function RBD() {
  const [rows, setRows] = useState<DiagramReportRow[]>([]);
  const document = useDocumentContext("rbd");
  return <AppShell title="Reliability Block Diagram" document={document} documentName={document?.name ?? "Untitled RBD"} eyebrow="IEC 61078 ANALYSIS" actions={<ExportDialog title="Reliability Block Diagram Report" subtitle={document ? `${document.name} ? IEC 61078 system availability analysis` : "IEC 61078 system availability analysis"} columns={columns} rows={rows} captureSelector=".rbd-workbench .workbench-canvas" explanation={explanation}/>}><DiagramEditor mode="rbd" documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}

