/**
 * RBD Core - Extracted core logic for RBD (blocks, connections, analysis)
 * Can be used independently in other projects
 * This file links to formulas and provides the main RBD functionality
 */

import { componentAvailability } from "@/engine/reliability";
import { kOutOfNFormulas, seriesFormulas, singleBlockFormulas } from "@/lib/rbd-formulas";

// Re-export formulas for convenience
export * from "@/lib/rbd-formulas";
export { componentAvailability, meanTimeBetweenFailures } from "@/engine/reliability";

export type RbdComponent = {
  id: number;
  x: number;
  availability: number;
  failureRate?: number;
  mttr?: number;
};

export type RbdLink = {
  from: number;
  to: number;
};

export type RbdAnalysis = {
  availability: number;
  unavailability: number;
  configuration: "Single block" | "Series" | "K-out-of-N" | "Open";
  paths: number;
  exact: boolean;
  note: string;
  formula: string;
  koon?: { k: number; n: number };
  failureRate: number;
  mtbf: number;
  mttr: number;
};

type EquivalentMetrics = {
  availability: number;
  failureRate: number;
  mtbf: number;
  mttr: number;
};

function positive(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

export function seriesEquivalentMetrics(components: RbdComponent[]): EquivalentMetrics {
  return seriesFormulas(components);
}

export function kOutOfNEquivalentMetrics(channels: RbdComponent[], k: number): EquivalentMetrics {
  return kOutOfNFormulas(channels, k);
}

function adjacency(components: RbdComponent[], links: RbdLink[]) {
  const graph = new Map<number, number[]>(components.map((component) => [component.id, []]));
  for (const link of links) {
    if (!graph.has(link.from) || !graph.has(link.to) || link.from === link.to) continue;
    graph.get(link.from)!.push(link.to);
    graph.get(link.to)!.push(link.from);
  }
  return graph;
}

function listPaths(graph: Map<number, number[]>, start: number, end: number, limit = 100) {
  const paths: number[][] = [];
  const walk = (current: number, path: number[], visited: Set<number>) => {
    if (paths.length >= limit) return;
    if (current === end) {
      paths.push(path);
      return;
    }
    for (const next of graph.get(current) ?? [])
      if (!visited.has(next)) walk(next, [...path, next], new Set(visited).add(next));
  };
  walk(start, [start], new Set([start]));
  return paths;
}

function openResult(note: string): RbdAnalysis {
  return {
    availability: 0,
    unavailability: 1,
    configuration: "Open",
    paths: 0,
    exact: true,
    note,
    formula: "No formula applied",
    failureRate: 0,
    mtbf: 0,
    mttr: 0,
  };
}

export function analyzeRbd(components: RbdComponent[], links: RbdLink[]): RbdAnalysis {
  if (!components.length) return openResult("No reliability blocks are present.");
  if (components.length === 1) {
    const component = components[0];
    const metrics = singleBlockFormulas(component);
    return {
      ...metrics,
      unavailability: 1 - metrics.availability,
      configuration: "Single block",
      paths: 1,
      exact: true,
      note: "System result equals the selected component values.",
      formula: "MTBF = 1 / ?",
    };
  }

  const ordered = [...components].sort((first, second) => first.x - second.x);
  const start = ordered[0].id,
    end = ordered.at(-1)!.id;
  const graph = adjacency(components, links);
  const paths = listPaths(graph, start, end);
  if (!paths.length) return openResult("No complete path exists between the left-most and right-most blocks.");

  if (paths.length === 1) {
    const metrics = seriesFormulas(components);
    return {
      ...metrics,
      unavailability: 1 - metrics.availability,
      configuration: "Series",
      paths: 1,
      exact: true,
      note: "Applied the series equations from the approved formula sheet.",
      formula: "?s = ??i; MTTRs = ?(?i ? MTTRi) / ?s; MTBFs = 1 / ?s",
    };
  }

  // Shared blocks occur in series with the redundant branch set. Each remaining
  // complete branch is reduced to a series-equivalent channel before 1ooN.
  const commonIds = paths.reduce(
    (common, path) => new Set([...common].filter((id) => path.includes(id))),
    new Set(paths[0]),
  );
  const componentById = new Map(components.map((component) => [component.id, component]));
  const branchKeys = [
    ...new Set(
      paths
        .map((path) => path.filter((id) => !commonIds.has(id)).sort((a, b) => a - b).join(","))
        .filter(Boolean),
    ),
  ];
  const branchChannels = branchKeys.map((key, index) => {
    const branch = key
      .split(",")
      .map(Number)
      .map((id) => componentById.get(id))
      .filter((component): component is RbdComponent => Boolean(component));
    const metrics = seriesFormulas(branch);
    return { id: -(index + 1), x: index, ...metrics };
  });
  if (branchChannels.length < 2) return openResult("The redundant branches could not be resolved into independent K-out-of-N channels.");

  const k = 1,
    n = branchChannels.length;
  const koon = kOutOfNFormulas(branchChannels, k);
  const common = [...commonIds].map((id) => componentById.get(id)).filter((component): component is RbdComponent => Boolean(component));
  const combined = common.length ? seriesFormulas([...common, { id: -1000, x: 0, ...koon }]) : koon;
  return {
    ...combined,
    unavailability: 1 - combined.availability,
    configuration: "K-out-of-N",
    koon: { k, n },
    paths: n,
    exact: true,
    note: `Applied ${k}oo${n} using the K-out-of-N equation from the approved formula sheet${common.length ? ", with shared blocks combined in series" : ""}.`,
    formula: "?s = n! / ((r?1)!(n-r+1)!) ? ?i^(n-r+1) ? Ti^(n-r); MTTRs = 1 / ((n-r+1)?)",
  };
}

// Blocks and connections utilities
export function createRbdBlock(id: number, x: number, y: number, options: Partial<RbdComponent> = {}) {
  return {
    id,
    x,
    y,
    availability: options.availability ?? 0,
    failureRate: options.failureRate,
    mttr: options.mttr,
  };
}

export function createRbdLink(from: number, to: number): RbdLink {
  return { from, to };
}

export function getBlockById(blocks: RbdComponent[], id: number) {
  return blocks.find((b) => b.id === id);
}

export function validateConnection(blocks: RbdComponent[], from: number, to: number) {
  if (from === to) return false;
  if (!getBlockById(blocks, from) || !getBlockById(blocks, to)) return false;
  return true;
}
