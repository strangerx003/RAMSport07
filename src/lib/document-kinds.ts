/**
 * RAMSport document types.
 *
 * A project is a plain folder in the server workspace; the user creates the
 * files they need inside it, exactly as in a desktop file manager. Every file
 * type below is a JSON document that one of the RAMS workbenches can open.
 */

export type DocumentKind = "rbd" | "fta" | "data" | "weibull" | "mil217f" | "fmeca" | "lccpm" | "lcccm" | "spares";

export type DocumentKindDef = {
  kind: DocumentKind;
  /** Full name shown in dialogs and previews. */
  label: string;
  /** Compact name for toolbar kickers. */
  shortLabel: string;
  /** File extension, including the leading dot. */
  extension: string;
  description: string;
};

export const DOCUMENT_KINDS: DocumentKindDef[] = [
  {
    kind: "data",
    label: "Data Register",
    shortLabel: "Data Register",
    extension: ".data",
    description: "Component baseline that every other module imports from.",
  },
  {
    kind: "rbd",
    label: "Reliability Block Diagram",
    shortLabel: "RBD",
    extension: ".rbd",
    description: "Blocks, connections and system availability.",
  },
  {
    kind: "fta",
    label: "Fault Tree Analysis",
    shortLabel: "FTA",
    extension: ".fta",
    description: "Top event, gates and cut sets.",
  },
  {
    kind: "weibull",
    label: "Weibull Analysis",
    shortLabel: "Weibull",
    extension: ".wbl",
    description: "Life data, plotting positions and B-lives (IEC 61649).",
  },
  {
    kind: "mil217f",
    label: "MIL-HDBK-217F Prediction",
    shortLabel: "MIL-217F",
    extension: ".217f",
    description: "Parts-stress or parts-count failure-rate prediction.",
  },
  {
    kind: "fmeca",
    label: "FMEA / FMECA Worksheet",
    shortLabel: "FMECA",
    extension: ".fmeca",
    description: "Failure modes, effects and EN 50126 risk assessment.",
  },
  {
    kind: "lccpm",
    label: "Life Cycle Cost ? Preventive Maintenance",
    shortLabel: "LCC-PM",
    extension: ".lccpm",
    description: "Preventive-maintenance tasks and whole-life cost (IEC 60300-3-3).",
  },
  {
    kind: "lcccm",
    label: "Life Cycle Cost ? Corrective Maintenance",
    shortLabel: "LCC-CM",
    extension: ".lcccm",
    description: "Corrective repair demand and whole-life cost (IEC 60300-3-3).",
  },
  {
    kind: "spares",
    label: "Spare Parts Analysis",
    shortLabel: "Spares",
    extension: ".spares",
    description: "Service-level spares, pipeline stock and spares LCC (EN 50126-3).",
  },
];

export function documentKindDef(kind: DocumentKind): DocumentKindDef {
  return DOCUMENT_KINDS.find(entry => entry.kind === kind) ?? DOCUMENT_KINDS[0];
}

export function documentKindForExtension(extension: string): DocumentKind | null {
  const needle = extension.replace(/^\./, "").toLowerCase();
  return DOCUMENT_KINDS.find(entry => entry.extension.slice(1) === needle)?.kind ?? null;
}

/**
 * Normalise a user-supplied file name for a document type: strips any known
 * RAMSport extension, then appends the extension of the chosen type.
 */
export function withDocumentExtension(value: string, kind: DocumentKind) {
  const definition = documentKindDef(kind);
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();
  let base = cleaned;
  for (const entry of DOCUMENT_KINDS) {
    if (lower.endsWith(entry.extension)) {
      base = cleaned.slice(0, -entry.extension.length).trim();
      break;
    }
  }
  return base ? `${base}${definition.extension}` : "";
}
