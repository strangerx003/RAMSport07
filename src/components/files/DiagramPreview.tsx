"use client";

import type { DiagramEdge, DiagramNode, DiagramState } from "@/data/workspace";
import { routeRbdConnection } from "@/engine/rbd-routing";

type DiagramPreviewProps = {
  /** Which workbench the file belongs to ? it decides how connectors are drawn. */
  kind: "rbd" | "fta";
  state: DiagramState;
};

const BLOCK_WIDTH = 196;
const BLOCK_HEIGHT = 108;
const GATE_WIDTH = 54;
const GATE_HEIGHT = 60;
const GATE_DRAW_HEIGHT = 48;
const PADDING = 26;

/** Gate outlines, copied from the fault-tree canvas so both views agree. */
const GATE_SHAPES: Record<string, { path: string; detail?: string; circle?: boolean }> = {
  and: { path: "M10 7h44v17c0 15-10 24-22 24S10 39 10 24V7Z" },
  or: { path: "M10 7c12 6 32 6 44 0-2 19-9 34-22 41C19 41 12 26 10 7Z", detail: "M10 7c13 9 31 9 44 0" },
  xor: { path: "M10 10c12 5 32 5 44 0-2 18-9 31-22 38C19 41 12 28 10 10Z", detail: "M9 5c13 7 33 7 46 0" },
  not: { path: "M14 7h36L32 43 14 7Z", circle: true },
};

function isGate(node: DiagramNode) {
  return node.type.startsWith("gate ");
}

function gateLabel(node: DiagramNode) {
  return node.type.replace("gate ", "").toUpperCase();
}

function nodeSize(node: DiagramNode) {
  return isGate(node) ? { width: GATE_WIDTH, height: GATE_HEIGHT } : { width: BLOCK_WIDTH, height: BLOCK_HEIGHT };
}

function clip(text: string, max: number) {
  const value = text ?? "";
  return value.length > max ? `${value.slice(0, max - 1)}?` : value;
}

/** Connectors use the same geometry as the editors, without any editing. */
function edgePath(edge: DiagramEdge, nodes: DiagramNode[], kind: DiagramPreviewProps["kind"]) {
  const from = nodes.find(node => node.id === edge.from);
  const to = nodes.find(node => node.id === edge.to);
  if (!from || !to) return "";
  if (kind === "rbd") return routeRbdConnection(nodes, edge).path;
  const fromSize = nodeSize(from), toSize = nodeSize(to);
  const start = { x: from.x + fromSize.width / 2, y: from.y };
  const end = { x: to.x + toSize.width / 2, y: to.y + toSize.height };
  if (Math.abs(start.x - end.x) < 8) return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  const middleY = (start.y + end.y) / 2;
  return `M${start.x} ${start.y} V${middleY} H${end.x} V${end.y}`;
}

function metricLine(node: DiagramNode) {
  const parts: string[] = [];
  if (node.failureRate) parts.push(`? ${node.failureRate.toExponential(2)} /h`);
  if (node.mission) parts.push(`Mission ${node.mission} h`);
  return parts.join("  ?  ");
}

/**
 * Read-only rendering of a saved RBD or FTA document, used by the file-manager
 * preview pane. It draws the same blocks, gates and connectors as the editors
 * but never handles pointers ? the preview is for reading, editing happens in
 * the workbench itself.
 */
export default function DiagramPreview({ kind, state }: DiagramPreviewProps) {
  const { nodes, edges } = state;
  if (!nodes.length) return <p className="file-preview-note">This diagram has no blocks yet. Open the file to start drawing.</p>;

  const bounds = nodes.reduce((box, node) => {
    const size = nodeSize(node);
    return {
      left: Math.min(box.left, node.x),
      top: Math.min(box.top, node.y),
      right: Math.max(box.right, node.x + size.width),
      bottom: Math.max(box.bottom, node.y + size.height),
    };
  }, { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });

  const viewBox = `${bounds.left - PADDING} ${bounds.top - PADDING} ${bounds.right - bounds.left + PADDING * 2} ${bounds.bottom - bounds.top + PADDING * 2}`;

  return (
    <svg
      className="diagram-preview"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${kind === "fta" ? "Fault tree" : "Reliability block diagram"} with ${nodes.length} block${nodes.length === 1 ? "" : "s"} and ${edges.length} connection${edges.length === 1 ? "" : "s"}`}
    >
      <defs>
        <marker id="diagram-preview-arrow" viewBox="0 0 8 8" refX="6.4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path className="diagram-preview-arrowhead" d="M0 0 8 4 0 8Z"/>
        </marker>
      </defs>
      <g>
        {edges.map((edge, index) => {
          const path = edgePath(edge, nodes, kind);
          return path ? <path key={`${edge.from}-${edge.to}-${index}`} className="diagram-preview-edge" d={path} markerEnd="url(#diagram-preview-arrow)"/> : null;
        })}
      </g>
      <g>
        {nodes.map(node => {
          const size = nodeSize(node);
          if (isGate(node)) {
            const kindName = node.type.replace("gate ", "");
            const shape = GATE_SHAPES[kindName] ?? GATE_SHAPES.and;
            const scaleX = GATE_WIDTH / 64;
            const scaleY = GATE_DRAW_HEIGHT / 54;
            return (
              <g key={node.id} className="diagram-preview-gate" transform={`translate(${node.x} ${node.y})`}>
                <rect className="diagram-preview-gate-bg" width={GATE_WIDTH} height={GATE_HEIGHT} rx="7"/>
                <g transform={`scale(${scaleX} ${scaleY})`}>
                  <g transform="translate(0 54) scale(1 -1)">
                    <path className="diagram-preview-gate-shape" d={shape.path}/>
                    {shape.detail && <path className="diagram-preview-gate-detail" d={shape.detail}/>}
                    {shape.circle && <circle className="diagram-preview-gate-shape" cx="32" cy="48" r="4"/>}
                  </g>
                </g>
                <text className="diagram-preview-gate-label" x={GATE_WIDTH / 2} y={GATE_HEIGHT - 5} textAnchor="middle">{gateLabel(node)}</text>
              </g>
            );
          }
          const metric = metricLine(node);
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              <rect className="diagram-preview-block" width={size.width} height={size.height} rx="9"/>
              <text className="diagram-preview-title" x="13" y="27">{clip(node.title, 24)}</text>
              <text className="diagram-preview-subtitle" x="13" y="47">{clip(node.subtitle, 27)}</text>
              {metric && <text className="diagram-preview-metric" x="13" y={size.height - 18}>{clip(metric, 30)}</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
