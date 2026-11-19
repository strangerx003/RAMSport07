"use client";

import { useEffect, useState } from "react";
import { documentKindForExtension, type DocumentKind } from "./document-kinds";

export type { DocumentKind };

export type DocumentContext = {
  kind: DocumentKind;
  /** Project folder name, the first path segment. */
  project: string;
  /** Folder segments between the project and the file. */
  folder: string;
  /** Full path relative to the account project root. */
  path: string;
  /** File name shown in the breadcrumb and workspace header. */
  name: string;
};

const KIND_BY_TYPE: Record<string, DocumentKind> = { rbd: "rbd", fta: "fta", data: "data", weibull: "weibull", mil217f: "mil217f", fmeca: "fmeca", lccpm: "lccpm", lcccm: "lcccm", spares: "spares" };

export function documentKindForPath(filePath: string): DocumentKind | null {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return documentKindForExtension(extension);
}

export function documentKindForType(type: string): DocumentKind | null {
  return KIND_BY_TYPE[type] ?? null;
}

export function documentRoute(kind: DocumentKind) {
  if (kind === "data") return "/data-register";
  if (kind === "mil217f") return "/mil-std-217f";
  if (kind === "lccpm") return "/lcc-pm";
  if (kind === "lcccm") return "/lcc-cm";
  if (kind === "spares") return "/spare-parts";
  return `/${kind}`;
}

export function documentHref(path: string): string {
  const kind = documentKindForPath(path);
  if (!kind) return "";
  const project = path.split("/")[0] || "";
  const params = new URLSearchParams({ project, file: path });
  return `${documentRoute(kind)}?${params.toString()}`;
}

export function folderHref(folderPath: string) {
  if (!folderPath) return "/dashboard";
  return `/dashboard?${new URLSearchParams({ folder: folderPath }).toString()}`;
}

export function parseDocumentContext(search: string): DocumentContext | null {
  const params = new URLSearchParams(search);
  const filePath = (params.get("file") || "").trim();
  const kind = documentKindForPath(filePath);
  if (!filePath || !kind || filePath.length > 400) return null;
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length < 2 || segments.some(segment => segment === "." || segment === "..")) return null;
  const project = (params.get("project") || segments[0]).trim();
  return {
    kind,
    project,
    folder: segments.slice(1, -1).join("/"),
    path: segments.join("/"),
    name: segments.at(-1) ?? "Untitled",
  };
}

/**
 * Reads the open-document context from the address bar. Using `window.location`
 * instead of `useSearchParams` keeps every workspace page statically renderable
 * while still letting the file manager deep-link straight to a project document.
 */
export function useDocumentContext(expected?: DocumentKind): DocumentContext | null {
  const [context, setContext] = useState<DocumentContext | null>(null);
  useEffect(() => {
    const read = () => setContext(parseDocumentContext(window.location.search));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!context) return null;
  if (expected && context.kind !== expected) return null;
  return context;
}
