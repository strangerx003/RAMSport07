/**
 * RBD Workspace - Blocks, connections and workspace utilities extracted
 * For use in current project and can be imported separately
 */

export type Asset = {
  id: string;
  tag: string;
  description: string;
  system: string;
  qty: number;
  lambda: number;
  mttr: number;
  mission: number;
  criticality: string;
  status: string;
};

export type DiagramNode = {
  id: number;
  x: number;
  y: number;
  type: string;
  title: string;
  subtitle: string;
  assetId?: string;
  groupId?: string;
  failureRate?: number;
  mttr?: number;
  mission?: number;
};

export type RbdGroup = {
  id: string;
  tag: string;
  name: string;
  failureRate: number;
  mtbf: number;
  mttr: number;
  availability: number;
  configuration: string;
  paths: number;
  memberCount: number;
  createdAt: string;
  formulaVersion: "rbd-sheet-v1";
  members?: DiagramNode[];
  internalEdges?: DiagramEdge[];
};

export type DiagramEdge = {
  from: number;
  to: number;
  style: "straight" | "elbow";
  waypoint?: { x: number; y: number };
  fromSide?: "left" | "right" | "top" | "bottom";
  toSide?: "left" | "right" | "top" | "bottom";
};

export type DiagramState = { nodes: DiagramNode[]; edges: DiagramEdge[] };
export type DiagramReportRow = {
  reference: string;
  component: string;
  type: string;
  failureRate: string;
  mtbf: string;
  mttr: string;
  availability: string;
};

export function createBlock(id: number, x: number, y: number, data: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id,
    x,
    y,
    type: data.type || "block",
    title: data.title || "",
    subtitle: data.subtitle || "",
    assetId: data.assetId,
    groupId: data.groupId,
    failureRate: data.failureRate,
    mttr: data.mttr,
    mission: data.mission,
  };
}

export function createConnection(from: number, to: number, style: "straight" | "elbow" = "elbow"): DiagramEdge {
  return { from, to, style };
}

export function isBlock(node: DiagramNode) {
  return node.type === "block" || (!node.type.startsWith("gate") && node.type !== "event basic" && node.type !== "event");
}

export function isGate(node: DiagramNode) {
  return node.type.startsWith("gate ");
}

export function getNodeById(nodes: DiagramNode[], id: number) {
  return nodes.find((n) => n.id === id);
}

export function getConnectedNodes(nodes: DiagramNode[], edges: DiagramEdge[], nodeId: number) {
  const connected: number[] = [];
  for (const edge of edges) {
    if (edge.from === nodeId) connected.push(edge.to);
    if (edge.to === nodeId) connected.push(edge.from);
  }
  return connected;
}

export function removeNode(nodes: DiagramNode[], edges: DiagramEdge[], nodeId: number) {
  return {
    nodes: nodes.filter((n) => n.id !== nodeId),
    edges: edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function removeConnection(edges: DiagramEdge[], from: number, to: number) {
  return edges.filter((e) => !(e.from === from && e.to === to) && !(e.from === to && e.to === from));
}
