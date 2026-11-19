"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import FTAEditor from "@/components/fta/FTAEditor";
import ExportDialog from "@/components/reporting/ExportDialog";
import { useDocumentContext } from "@/lib/document-context";
import type { ExportRow } from "@/components/reporting/ExportDialog";

const columns = [
  { key: "eventId", label: "Event ID", width: 17 },
  { key: "event", label: "Event", width: 29 },
  { key: "role", label: "Role", width: 17 },
  { key: "logic", label: "Logic / relationship", width: 25 },
  { key: "lambda", label: "? (1/h)", width: 15 },
];
const explanation = [
  { topic: "Basic event", description: "Lowest-level event quantified from its failure rate and mission time.", formula: "Q(t) = 1 - exp(-?t)" },
  { topic: "AND gate", description: "The output occurs only when every independent input occurs.", formula: "Q = product(Qi)" },
  { topic: "OR gate", description: "The output occurs when one or more independent inputs occur.", formula: "Q = 1 - product(1 - Qi)" },
  { topic: "XOR gate", description: "The output occurs when exactly one input occurs.", formula: "Q = sum[Qi product(1-Qj)]" },
  { topic: "NOT gate", description: "The output is the logical complement of its single input.", formula: "Q = 1 - Q1" },
  { topic: "Transfer reference", description: "A matching T-number continues the same branch on another A4 page without changing its logic.", formula: "Reference only" },
];

export default function FTA() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const document = useDocumentContext("fta");
  return <AppShell title="Fault Tree Analysis" document={document} documentName={document?.name ?? "Untitled FTA"} eyebrow="IEC 61025 ANALYSIS" actions={<ExportDialog title="Fault Tree Analysis Report" subtitle={document ? `${document.name} ? IEC 61025 qualitative and quantitative analysis` : "IEC 61025 qualitative and quantitative analysis"} columns={columns} rows={rows} captureSelector=".fta-workbench .workbench-canvas" explanation={explanation}/>}><FTAEditor documentPath={document?.path} onReportChange={setRows}/></AppShell>;
}

