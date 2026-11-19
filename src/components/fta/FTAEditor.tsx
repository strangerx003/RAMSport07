"use client";

import { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { canvasGridMetrics, DEFAULT_CANVAS_ZOOM, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, zoomCanvasAtPointer } from "@/engine/canvas-zoom";
import { basicEventProbability, evaluateGate, gateFormula, type FtaGateType } from "@/engine/fta";
import { componentAvailability, meanTimeBetweenFailures } from "@/engine/reliability";
import { routeRbdConnection } from "@/engine/rbd-routing";
import { Icons } from "@/lib/icons";
import { Spinner } from "@/components/ui/spinner";
import { Asset, DiagramEdge, DiagramNode, DiagramState, REGISTER_UPDATED_EVENT, isDiagramState, readAssets, readDiagram, saveDiagram, starterAssets } from "@/data/workspace";
import { loadDocument, queueDocumentSave, saveDocument } from "@/services/documents/client";
import { loadProjectRegister } from "@/services/documents/project-register";
import { useAppDialog } from "@/components/ui/app-dialog";
import { ModuleKpis } from "@/components/layout/header-kpis";
import type { ExportRow } from "@/components/reporting/ExportDialog";
import SaveDialog from "@/components/documents/SaveDialog";

type PortSide = "top" | "bottom";
type GateType = FtaGateType;
type EventType = "event top" | "event intermediate" | "event basic";
type Analysis = { probability: number; formula: string; topEvent: string; failureRate: number; mtbf: number; mttr: number; availability: number; cutSets: string[][] } | null;

const EMPTY: DiagramState = { nodes: [], edges: [] };
const EVENT_WIDTH = 196;
const EVENT_HEIGHT = 108;
const GATE_WIDTH = 54;
const GATE_HEIGHT = 60;

function isGate(node?: DiagramNode) { return Boolean(node?.type.startsWith("gate ")); }
function gateLabel(type: string) { return type.replace("gate ", "").toUpperCase(); }

function GateGraphic({ type, id }: { type: string; id: string }) {
  const kind = type.replace("gate ", "");
  return <span className="fta-gate-graphic"><svg viewBox="0 0 64 54" aria-label={`${gateLabel(type)} gate`}>
    <g transform="translate(0 54) scale(1 -1)">
      {kind === "and" && <path d="M10 7h44v17c0 15-10 24-22 24S10 39 10 24V7Z"/>}
      {kind === "or" && <><path d="M10 7c12 6 32 6 44 0-2 19-9 34-22 41C19 41 12 26 10 7Z"/><path className="gate-detail" d="M10 7c13 9 31 9 44 0"/></>}
      {kind === "xor" && <><path d="M10 10c12 5 32 5 44 0-2 18-9 31-22 38C19 41 12 28 10 10Z"/><path className="gate-detail" d="M9 5c13 7 33 7 46 0"/></>}
      {kind === "not" && <><path d="M14 7h36L32 43 14 7Z"/><circle cx="32" cy="48" r="4"/></>}
    </g>
  </svg><b>{id}</b><small>{gateLabel(type)}</small></span>;
}

function reportRows(nodes: DiagramNode[], edges: DiagramEdge[], assets: Asset[]): ExportRow[] {
  return [...nodes].sort((first, second) => first.y - second.y || first.x - second.x).map(node => {
    const asset = assets.find(item => item.id === node.assetId);
    const lambda = asset?.lambda ?? node.failureRate ?? 0;
    const parent = nodes.find(item => edges.some(edge => edge.from === node.id && edge.to === item.id));
    const isLogicGate = isGate(node);
    const role = node.type === "event top" ? "Top event" : node.type === "event intermediate" ? "Intermediate event" : node.type === "event basic" ? "Basic event" : "Logic gate";
    const eventId = isLogicGate ? `G-${node.id}` : (asset?.tag ?? node.title ?? `E-${node.id}`);
    return {
      eventId,
      event: asset?.description ?? node.title ?? node.subtitle ?? role,
      role,
      logic: isLogicGate ? `${gateLabel(node.type)} logic` : parent && isGate(parent) ? `Input to ${gateLabel(parent.type)} (${`G-${parent.id}`})` : role === "Top event" ? "Tree output" : "Linked event",
      lambda: !isLogicGate && lambda ? lambda.toExponential(3) : "?",
    };
  });
}

export default function FTAEditor({ documentPath, onReportChange }: { documentPath?: string; onReportChange?: (rows: ExportRow[]) => void }) {
  const dialog = useAppDialog();
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [assets, setAssets] = useState<Asset[]>(starterAssets);
  const [registerPath, setRegisterPath] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const hydratedPath = useRef<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<string | null>(documentPath ?? null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis>(null);
  const [calculating, setCalculating] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [paneOpen, setPaneOpen] = useState(true);
  const [explanationVisible, setExplanationVisible] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [portDrag, setPortDrag] = useState<{ from: number; start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [pendingGate, setPendingGate] = useState<{ from: number; to: number; demote?: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: number; x: number; y: number } | null>(null);
  const undoStack = useRef<DiagramState[]>([]);
  const redoStack = useRef<DiagramState[]>([]);
  const latest = useRef<DiagramState>(EMPTY);

  useEffect(() => {
    setSaveTarget(documentPath ?? null);
  }, [documentPath]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await readDiagram("fta", EMPTY, documentPath);
      if (!active) return;
      latest.current = saved;
      setNodes(saved.nodes);
      setEdges(saved.edges);
      setSelected(saved.nodes[0]?.id ?? 0);

      // The component library always originates from the project Data Register.
      const [snapshotAssets, projectRegister] = await Promise.all([
        readAssets(documentPath),
        loadProjectRegister(documentPath).catch(() => null),
      ]);
      if (!active) return;
      setAssets(projectRegister?.assets ?? snapshotAssets);
      setRegisterPath(projectRegister?.registerPath ?? null);

      if (!documentPath) {
        hydratedPath.current = "";
        setHydrated(true);
        // Resume the file this account saved into last from the server.
        const response = await fetch("/api/save-locations?kind=fta", { cache: "no-store" }).catch(() => null);
        const payload = response?.ok ? await response.json() as { locations?: { fta?: string | null } } : null;
        const remembered = payload?.locations?.fta;
        if (!active || typeof remembered !== "string" || !remembered) return;
        const remote = await loadDocument(remembered);
        if (!active || !isDiagramState(remote)) return;
        latest.current = remote;
        setNodes(remote.nodes);
        setEdges(remote.edges);
        setSelected(remote.nodes[0]?.id ?? 0);
        hydratedPath.current = remembered;
        setSaveTarget(remembered);
        const register = await loadProjectRegister(remembered);
        if (!active) return;
        setAssets(register.assets);
        setRegisterPath(register.registerPath);
      } else {
        hydratedPath.current = null;
        setHydrated(false);
        const remote = await loadDocument(documentPath);
        if (!active) return;
        if (isDiagramState(remote) && (remote.nodes.length || remote.edges.length)) {
          latest.current = remote;
          setNodes(remote.nodes);
          setEdges(remote.edges);
          setSelected(remote.nodes[0]?.id ?? 0);
        }
        hydratedPath.current = documentPath;
        setHydrated(true);
      }
    })();
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<Asset[]>).detail;
      if (Array.isArray(detail)) { setAssets(detail); return; }
      void loadProjectRegister(documentPath).then(result => { setAssets(result.assets); setRegisterPath(result.registerPath); }).catch(() => undefined);
    };
    window.addEventListener(REGISTER_UPDATED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(REGISTER_UPDATED_EVENT, refresh); };
  }, [documentPath]);

  useEffect(() => {
    latest.current = { nodes, edges };
    if (hydrated && (!saveTarget || hydratedPath.current === saveTarget)) {
      void saveDiagram("fta", { nodes, edges }, saveTarget ?? undefined);
      if (saveTarget) queueDocumentSave(saveTarget, { nodes, edges });
      onReportChange?.(reportRows(nodes, edges, assets));
    }
  }, [nodes, edges, assets, hydrated, saveTarget, onReportChange]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveNow(); }
      if (event.key === "Delete" && !["INPUT", "SELECT", "TEXTAREA"].includes(tag)) selectedEdge !== null ? removeSelectedEdge() : selected && removeSelected();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const filteredAssets = useMemo(() => assets.filter(asset => `${asset.tag} ${asset.description} ${asset.system}`.toLowerCase().includes(search.toLowerCase())), [assets, search]);

  async function saveNow() {
    if (!saveTarget) { setSaveOpen(true); return; }
    setSaving(true);
    await saveDocument(saveTarget, { nodes, edges }, true);
    setSaving(false);
  }

  function handleSaved(path: string) {
    hydratedPath.current = path;
    setSaveTarget(path);
    const params = new URLSearchParams(window.location.search);
    params.set("project", path.split("/")[0] || "");
    params.set("file", path);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function clearTree() {
    if (nodes.length && !(await dialog.confirm({
      title: "Clear the complete fault tree?",
      message: "Every event, gate and connection on the canvas will be removed. The saved file is updated on the next save.",
      confirmLabel: "Clear fault tree",
      tone: "danger",
    }))) return;
    remember(); setNodes([]); setEdges([]); setSelected(0); invalidateAnalysis();
  }

  const saveFolder = saveTarget ? saveTarget.split("/").slice(0, -1).join("/") : "";
  const saveName = saveTarget?.split("/").pop() || "Untitled FTA";

  function remember() {
    undoStack.current.push(structuredClone(latest.current));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  }
  function restore(state: DiagramState) { setNodes(state.nodes); setEdges(state.edges); setSelected(0); setSelectedEdge(null); setAnalysis(null); setResultVisible(false); }
  function undo() { const state = undoStack.current.pop(); if (!state) return; redoStack.current.push(structuredClone(latest.current)); restore(state); }
  function redo() { const state = redoStack.current.pop(); if (!state) return; undoStack.current.push(structuredClone(latest.current)); restore(state); }
  function invalidateAnalysis() { setAnalysis(null); setResultVisible(false); }

  function nodeSize(node: DiagramNode) { return isGate(node) ? { width: GATE_WIDTH, height: GATE_HEIGHT } : { width: EVENT_WIDTH, height: EVENT_HEIGHT }; }
  function point(node: DiagramNode, side: PortSide) {
    const size = nodeSize(node);
    return { x: node.x + size.width / 2, y: side === "top" ? node.y : node.y + size.height };
  }
  function nextPosition() {
    const index = nodes.filter(node => !isGate(node)).length;
    // The top event owns the first slot at the root; causes are placed in rows
    // underneath it so the tree reads downwards instead of lying flat.
    if (index === 0) return { x: 340, y: 50 };
    const slot = index - 1;
    return { x: 300 + (slot % 2) * 260, y: 330 + Math.floor(slot / 2) * 175 };
  }
  function addAsset(asset: Asset, position?: { x: number; y: number }) {
    remember();
    const id = Math.max(0, ...nodes.map(node => node.id)) + 1;
    // The first event of a new tree is the top event; everything added after it
    // is a basic event until the analyst places it under a gate.
    const type: EventType = nodes.some(node => !isGate(node)) ? "event basic" : "event top";
    setNodes(current => [...current, { id, ...(position ?? nextPosition()), type, title: asset.tag, subtitle: asset.description, assetId: asset.id }]);
    setSelected(id); setSelectedEdge(null);
    invalidateAnalysis();
  }
  function drop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragOver(false);
    try {
      const { id } = JSON.parse(event.dataTransfer.getData("application/x-ramsport")) as { id?: string };
      const asset = assets.find(item => item.id === id);
      const rect = event.currentTarget.getBoundingClientRect();
      if (asset) addAsset(asset, { x: Math.max(12, ((event.clientX - rect.left) - pan.x) * 100 / zoom - EVENT_WIDTH / 2), y: Math.max(12, ((event.clientY - rect.top) - pan.y) * 100 / zoom - EVENT_HEIGHT / 2) });
      else setNotice("That item is not available in the Data Register.");
    } catch { setNotice("The dropped item could not be added. Drag a component from the Data Register and try again."); }
  }

  function dragNode(event: ReactPointerEvent, node: DiagramNode) {
    if ((event.target as HTMLElement).closest(".port")) return;
    event.preventDefault(); remember(); setSelected(node.id); setSelectedEdge(null); setContextMenu(null); invalidateAnalysis();
    const start = { x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y };
    const move = (pointer: PointerEvent) => setNodes(current => current.map(item => item.id === node.id ? { ...item, x: Math.max(12, start.nodeX + (pointer.clientX - start.x) * 100 / zoom), y: Math.max(12, start.nodeY + (pointer.clientY - start.y) * 100 / zoom) } : item));
    const up = () => {
      setNodes(current => {
        const moved = current.find(item => item.id === node.id);
        if (!moved) return current;
        const movedSize = nodeSize(moved);
        const overlap = current.find(item => {
          if (item.id === moved.id) return false;
          const size = nodeSize(item);
          return moved.x < item.x + size.width + 18 && moved.x + movedSize.width + 18 > item.x
            && moved.y < item.y + size.height + 18 && moved.y + movedSize.height + 18 > item.y;
        });
        if (!overlap) return current;
        setNotice(`"${moved.title}" was moved clear of "${overlap.title}" so symbols and connectors remain readable.`);
        const overlapSize = nodeSize(overlap);
        return current.map(item => item.id === moved.id ? { ...item, x: overlap.x + overlapSize.width + 36 } : item);
      });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function startPortDrag(event: ReactPointerEvent, node: DiagramNode, side: PortSide) {
    event.preventDefault(); event.stopPropagation(); setSelected(node.id);
    const rect = (event.currentTarget.closest(".workbench-canvas-wrap") as HTMLElement)?.getBoundingClientRect();
    const cursor = (x: number, y: number) => ({ x: ((x - (rect?.left ?? 0)) - pan.x) * 100 / zoom, y: ((y - (rect?.top ?? 0)) - pan.y) * 100 / zoom });
    setPortDrag({ from: node.id, start: point(node, side), current: cursor(event.clientX, event.clientY) });
    const move = (pointer: PointerEvent) => setPortDrag(current => current ? { ...current, current: cursor(pointer.clientX, pointer.clientY) } : null);
    const up = (pointer: PointerEvent) => {
      const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-port-node]");
      const targetId = Number(target?.dataset.portNode);
      const targetSide = target?.dataset.portSide as PortSide | undefined;
      if (targetId && targetSide && targetId !== node.id) connect(node.id, side, targetId, targetSide);
      else setNotice("Connection not created. Release the line on the top dot of a cause or the bottom dot of the gate above it.");
      setPortDrag(null);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function addEdge(from: number, to: number) {
    if (edges.some(edge => edge.from === from && edge.to === to)) { setNotice("These items are already connected."); return; }
    remember(); setEdges(current => [...current, { from, to, style: "elbow" }]); setNotice(""); invalidateAnalysis();
  }
  function parentOf(id: number) { return edges.find(edge => edge.from === id)?.to; }
  function isAncestor(candidate: number, nodeId: number) {
    // Walk from `nodeId` up through parents; if we meet `candidate` the new
    // connection would close a loop and is not a tree.
    const seen = new Set<number>();
    let current: number | undefined = nodeId;
    while (current !== undefined && !seen.has(current)) {
      if (current === candidate) return true;
      seen.add(current);
      current = parentOf(current);
    }
    return false;
  }
  /**
   * Connect two nodes the way IEC 61025 defines a fault tree: the child leaves
   * from its top dot and enters the bottom dot of its parent. Direction comes
   * from the two ports, never from which block happens to be higher on screen.
   * A node has at most one parent; an event has at most one input gate; a basic
   * event has no inputs; the top event has no parent; and no connection may
   * close a loop.
   */
  function connect(firstId: number, firstSide: PortSide, secondId: number, secondSide: PortSide) {
    const first = nodes.find(node => node.id === firstId), second = nodes.find(node => node.id === secondId);
    if (!first || !second) { setNotice("Connection not created because one of the selected items is no longer available."); return; }
    let child: DiagramNode, parent: DiagramNode;
    if (firstSide === "top" && secondSide === "bottom") { child = first; parent = second; }
    else if (firstSide === "bottom" && secondSide === "top") { child = second; parent = first; }
    else {
      setNotice("Connect the top dot of a cause to the bottom dot of the gate or event above it.");
      return;
    }
    if (parent.type === "event basic") { setNotice(`"${parent.title}" is a basic event and cannot have inputs. Convert it to an intermediate event or add a gate above it.`); return; }
    if (parentOf(child.id) !== undefined) { setNotice(`"${child.title}" already has a parent. In a fault tree every event or gate has exactly one parent; remove the existing connection first.`); return; }
    if (isAncestor(child.id, parent.id)) { setNotice("Connection not created: it would close a loop in the fault tree."); return; }
    if (edges.some(edge => edge.from === child.id && edge.to === parent.id)) { setNotice("These items are already connected."); return; }
    if (!isGate(parent)) {
      if (edges.some(edge => edge.to === parent.id)) { setNotice(`"${parent.title}" already has the gate that produces it. An event has exactly one gate beneath it.`); return; }
      if (!isGate(child)) { setPendingGate({ from: child.id, to: parent.id, demote: child.type === "event top" }); return; }
    }
    // A top event is only the top because nothing produces it yet. Once it is
    // connected beneath another node it becomes an intermediate event and the
    // node above it becomes the tree's top event.
    const demotingTop = child.type === "event top";
    if (demotingTop) {
      remember();
      setNodes(current => current.map(node => node.id === child.id ? { ...node, type: "event intermediate" } : node));
    }
    addEdge(child.id, parent.id);
    if (demotingTop) setNotice(`"${child.title}" now sits beneath "${parent.title}", so "${parent.title}" becomes the top event.`);
  }

  function connectTopLevelItems() {
    const roots = nodes.filter(node => !edges.some(edge => edge.from === node.id));
    const top = roots.find(node => node.type === "event top") ?? roots.find(node => !isGate(node));
    const causes = roots.filter(node => node.id !== top?.id);
    if (!top || !causes.length || isGate(top)) return;
    remember();
    const id = Math.max(0, ...nodes.map(node => node.id)) + 1;
    const gate: DiagramNode = {
      id,
      x: top.x + (EVENT_WIDTH - GATE_WIDTH) / 2,
      y: top.y + EVENT_HEIGHT + 72,
      type: "gate or",
      title: "OR",
      subtitle: "Logic gate",
    };
    setNodes(current => [
      ...current.map(node => node.id !== top.id && node.type === "event top" ? { ...node, type: "event basic" as EventType } : node),
      gate,
    ]);
    setEdges(current => [
      ...current,
      ...causes.map(cause => ({ from: cause.id, to: id, style: "elbow" as const })),
      { from: id, to: top.id, style: "elbow" as const },
    ]);
    setSelected(id);
    setNotice(`${causes.length} top-level item${causes.length === 1 ? " was" : "s were"} connected beneath a new OR gate. Change the gate type if the causal logic requires it.`);
    invalidateAnalysis();
  }
  function confirmGate(type: GateType) {
    if (!pendingGate) return;
    const source = nodes.find(node => node.id === pendingGate.from), target = nodes.find(node => node.id === pendingGate.to);
    if (!source || !target) { setPendingGate(null); setNotice("The gate could not be created because the selected events are no longer available."); return; }
    remember();
    const id = Math.max(0, ...nodes.map(node => node.id)) + 1;
    // The gate sits on the branch between the parent (the event it produces)
    // and the child cause, never on top of either block.
    const upper = source.y < target.y ? source : target;
    const lower = source.y < target.y ? target : source;
    const gate: DiagramNode = {
      id,
      x: (source.x + target.x) / 2 + (EVENT_WIDTH - GATE_WIDTH) / 2,
      y: (upper.y + (isGate(upper) ? GATE_HEIGHT : EVENT_HEIGHT) + lower.y) / 2 - GATE_HEIGHT / 2,
      type, title: gateLabel(type), subtitle: "Logic gate",
    };
    setNodes(current => [...current, gate]);
    setEdges(current => [...current, { from: source.id, to: id, style: "elbow" }, { from: id, to: target.id, style: "elbow" }]);
    if (pendingGate.demote) setNodes(current => current.map(node => node.id === source.id ? { ...node, type: "event intermediate" } : node));
    setSelected(id); setPendingGate(null); setNotice(pendingGate.demote ? `"${source.title}" now sits beneath "${target.title}", so "${target.title}" becomes the top event.` : ""); invalidateAnalysis();
  }
  function changeGate(nodeId: number, type: GateType) { remember(); setNodes(current => current.map(node => node.id === nodeId ? { ...node, type, title: gateLabel(type) } : node)); setContextMenu(null); invalidateAnalysis(); }
  function changeEvent(nodeId: number, type: EventType) {
    remember();
    setNodes(current => current.map(node => {
      if (type === "event top" && node.type === "event top" && node.id !== nodeId) return { ...node, type: "event intermediate" };
      return node.id === nodeId ? { ...node, type } : node;
    }));
    // A top event is the root, so making an event the top event detaches it
    // from any parent it had before.
    if (type === "event top") setEdges(current => current.filter(edge => edge.from !== nodeId));
    setContextMenu(null); invalidateAnalysis();
  }
  function removeSelected() { if (!selected) return; remember(); setNodes(current => current.filter(node => node.id !== selected)); setEdges(current => current.filter(edge => edge.from !== selected && edge.to !== selected)); setSelected(0); invalidateAnalysis(); }
  function removeSelectedEdge() { if (selectedEdge === null) return; remember(); setEdges(current => current.filter((_, index) => index !== selectedEdge)); setSelectedEdge(null); invalidateAnalysis(); }

  function edgeHandle(edge: DiagramEdge) {
    if (edge.waypoint) return edge.waypoint;
    const source = nodes.find(node => node.id === edge.from), target = nodes.find(node => node.id === edge.to);
    if (!source || !target) return { x: 0, y: 0 };
    const start = point(source, "top"), end = point(target, "bottom");
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  function dragEdgeHandle(event: ReactPointerEvent, index: number) {
    event.preventDefault(); event.stopPropagation(); remember(); setSelectedEdge(index); setSelected(0); invalidateAnalysis();
    const wrap = (event.currentTarget.closest(".workbench-canvas-wrap") as HTMLElement)?.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const waypoint = { x: ((pointer.clientX - (wrap?.left ?? 0)) - pan.x) * 100 / zoom, y: ((pointer.clientY - (wrap?.top ?? 0)) - pan.y) * 100 / zoom };
      setEdges(current => current.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, waypoint } : edge));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panMode || (event.target as HTMLElement).closest(".workbench-node,.edge-handle")) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    const move = (pointer: PointerEvent) => setPan({ x: start.panX + pointer.clientX - start.x, y: start.panY + pointer.clientY - start.y });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function wheelZoom(event: ReactWheelEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".workbench-status")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const result = zoomCanvasAtPointer(zoom, pan, { x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY);
    setZoom(result.zoom); setPan(result.pan);
  }

  function edgePath(edge: DiagramEdge) {
    return edgePoints(edge).map((item, index) => `${index ? "L" : "M"}${item.x} ${item.y}`).join(" ");
  }

  function edgePoints(edge: DiagramEdge) {
    return routeRbdConnection(nodes, { ...edge, fromSide: "top", toSide: "bottom" }).points;
  }

  function edgeArrow(edge: DiagramEdge) {
    const points = edgePoints(edge);
    if (!Array.isArray(points) || points.length < 2) return null;
    const candidates = points.slice(1).map((second, index) => ({ first: points[index], second, index, length: Math.abs(second.x - points[index].x) + Math.abs(second.y - points[index].y) })).filter(segment => segment.length >= 24 && segment.index > 0 && segment.index < points.length - 2);
    const segments = candidates.length ? candidates : points.slice(1).map((second, index) => ({ first: points[index], second, index, length: Math.abs(second.x - points[index].x) + Math.abs(second.y - points[index].y) })).filter(segment => segment.length >= 24);
    const segment = segments.sort((first, second) => second.length - first.length)[0];
    if (!segment) return null;
    return { x: (segment.first.x + segment.second.x) / 2, y: (segment.first.y + segment.second.y) / 2, angle: Math.atan2(segment.second.y - segment.first.y, segment.second.x - segment.first.x) * 180 / Math.PI };
  }

  function evaluate(id: number, visiting = new Set<number>()): number {
    if (visiting.has(id)) return 0;
    const node = nodes.find(item => item.id === id); if (!node) return 0;
    const inputs = edges.filter(edge => edge.to === id).map(edge => evaluate(edge.from, new Set(visiting).add(id)));
    if (isGate(node)) return evaluateGate(node.type, inputs);
    if (inputs.length) return inputs.length === 1 ? inputs[0] : evaluateGate("gate or", inputs);
    const asset = node.assetId ? assets.find(item => item.id === node.assetId) : undefined;
    return basicEventProbability(asset?.lambda ?? node.failureRate ?? 0, asset?.mission ?? node.mission ?? 1);
  }

  function minimalCutSets(id: number, visiting = new Set<number>()): string[][] {
    if (visiting.has(id)) return [];
    const node = nodes.find(item => item.id === id); if (!node) return [];
    const inputIds = edges.filter(edge => edge.to === id).map(edge => edge.from);
    if (!inputIds.length) return isGate(node) ? [] : [[node.title]];
    const inputs = inputIds.map(input => minimalCutSets(input, new Set(visiting).add(id))).filter(sets => sets.length);
    if (!inputs.length) return isGate(node) ? [] : [[node.title]];
    const combined = isGate(node) && node.type === "gate and"
      ? inputs.reduce<string[][]>((products, sets) => products.flatMap(product => sets.map(set => [...new Set([...product, ...set])])), [[]])
      : inputs.flat();
    const unique = [...new Map(combined.map(set => [set.slice().sort().join("|"), set.slice().sort()])).values()];
    return unique.filter(set => !unique.some(other => other.length < set.length && other.every(event => set.includes(event))));
  }

  /**
   * IEC 61025 structure checks. A fault tree has exactly one top event, every
   * other event and gate has exactly one parent, a basic event is a leaf, every
   * event has at most one gate beneath it, and no branch may loop back.
   */
  function checkTree(): { top: DiagramNode | null; errors: string[]; promote: boolean } {
    const eventNodes = nodes.filter(node => !isGate(node));
    if (!eventNodes.length) return { top: null, errors: ["Add at least one event before calculating the fault tree."], promote: false };
    const names = (list: DiagramNode[]) => list.map(node => `"${node.title}"`).join(", ");
    const multipleParents = nodes.filter(node => edges.filter(edge => edge.from === node.id).length > 1);
    if (multipleParents.length) {
      return { top: null, errors: [`${names(multipleParents)} has more than one parent. A fault-tree node has exactly one parent.`], promote: false };
    }
    const roots = nodes.filter(node => !edges.some(edge => edge.from === node.id));
    if (roots.length === 0) return { top: null, errors: ["The tree has no top event: every item has a parent, which means the branches loop back on themselves."], promote: false };
    if (roots.length > 1) {
      return { top: null, errors: [`${roots.length} unconnected top-level items (${names(roots)}). A fault tree has exactly one top event ? connect the others beneath a gate.`], promote: false };
    }
    const top = roots[0];
    if (isGate(top)) return { top, errors: [`The root of the tree is the ${gateLabel(top.type)} gate "${top.title}", not an event. A fault tree is rooted at a single top event.`], promote: false };
    const errors: string[] = [];
    const basicWithInputs = eventNodes.filter(node => node.type === "event basic" && edges.some(edge => edge.to === node.id));
    if (basicWithInputs.length) errors.push(`${names(basicWithInputs)} is a basic event and cannot have inputs; convert it to an intermediate event or insert a gate.`);
    const intermediateWithoutInput = eventNodes.filter(node => node.type === "event intermediate" && !edges.some(edge => edge.to === node.id));
    if (intermediateWithoutInput.length) errors.push(`${names(intermediateWithoutInput)} is an intermediate event but has no gate beneath it.`);
    const emptyGates = nodes.filter(node => isGate(node) && !edges.some(edge => edge.to === node.id));
    if (emptyGates.length) errors.push(`${names(emptyGates)} has no inputs; connect at least one cause to the gate.`);
    const seen = new Set<number>();
    const queue = [top.id];
    while (queue.length) {
      const id = queue.shift() as number;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.filter(edge => edge.to === id).forEach(edge => queue.push(edge.from));
    }
    const unreachable = nodes.filter(node => !seen.has(node.id));
    if (unreachable.length) errors.push(`${names(unreachable)} is not connected to the top event.`);
    return { top, errors, promote: top.type !== "event top" };
  }

  function runAnalysis() {
    const check = checkTree();
    if (!check.top || check.errors.length) {
      setAnalysis(null); setResultVisible(false);
      setNotice(check.errors.join(" "));
      return;
    }
    const eventNodes = nodes.filter(node => !isGate(node));
    const top = check.top;
    setCalculating(true);
    window.setTimeout(() => {
    if (check.promote) setNodes(current => current.map(node => node.id === top.id ? { ...node, type: "event top" } : node));
    const topInput = edges.find(edge => edge.to === top.id);
    const topLogic = nodes.find(node => node.id === topInput?.from && isGate(node));
    const probability = evaluate(top.id);
    const quantified = eventNodes.map(node => {
      const asset = node.assetId ? assets.find(item => item.id === node.assetId) : undefined;
      return { lambda: asset?.lambda ?? node.failureRate ?? 0, mttr: asset?.mttr ?? node.mttr ?? 0, mission: asset?.mission ?? node.mission ?? 1 };
    });
    const mission = Math.max(1, ...quantified.map(item => item.mission));
    const failureRate = probability >= 1 ? Number.POSITIVE_INFINITY : -Math.log(Math.max(1 - probability, Number.EPSILON)) / mission;
    const lambdaTotal = quantified.reduce((sum, item) => sum + item.lambda, 0);
    const mttr = lambdaTotal ? quantified.reduce((sum, item) => sum + item.lambda * item.mttr, 0) / lambdaTotal : 0;
    const availability = Number.isFinite(failureRate) ? componentAvailability({ lambda: failureRate, mttr }) : 0;
    setSelected(top.id);
    setAnalysis({ probability, formula: gateFormula(topLogic?.type), topEvent: top.title, failureRate, mtbf: failureRate ? 1 / failureRate : Number.POSITIVE_INFINITY, mttr, availability, cutSets: minimalCutSets(top.id) });
    setResultVisible(true);
    setPaneOpen(true);
    setNotice("");
    setCalculating(false);
    }, 220);
  }

  const grid = canvasGridMetrics(zoom, pan);
  const gridStyle = { "--grid-small": `${grid.small}px`, "--grid-large": `${grid.large}px`, "--grid-x": `${grid.x}px`, "--grid-y": `${grid.y}px` } as CSSProperties;
  const topLevelItems = nodes.filter(node => !edges.some(edge => edge.from === node.id));
  return <section className="workbench fta-workbench fta-standard" onClick={() => setContextMenu(null)}>
    {analysis && <ModuleKpis
      ariaLabel="Fault tree quantification results"
      metrics={[
        { symbol: "Q(t)", name: "Top event probability", value: analysis.probability.toExponential(4), primary: true },
        { symbol: "?", name: "Equivalent failure rate", value: Number.isFinite(analysis.failureRate) ? analysis.failureRate.toExponential(4) : "?", unit: "1/h" },
        { symbol: "MTBF", name: "Mean time between failures", value: Number.isFinite(analysis.mtbf) ? Math.round(analysis.mtbf).toLocaleString() : "?", unit: "h" },
        { symbol: "A", name: "Steady-state availability", value: `${(analysis.availability * 100).toFixed(6)}%` },
        { symbol: "MCS", name: "Minimal cut sets", value: String(analysis.cutSets.length) },
      ]}
      action={<button type="button" className="header-kpis-action" onClick={() => setExplanationVisible(true)}>Explanation</button>}
    />}
    <header className="workbench-toolbar">
      <button className={`wb-action history-action ${panMode ? "active" : ""}`} onClick={() => setPanMode(value => !value)} title="Pan the diagram"><Icons.pan/>Pan</button>
      <button className="wb-action history-action save-action" onClick={() => void saveNow()} disabled={saving} title={saveTarget ? `Save to ${saveTarget}` : "Save ? choose a workspace location"}><Icons.save/>{saving ? "Saving?" : "Save"}</button>
      <button className="wb-action history-action" onClick={undo} title="Undo (Ctrl+Z)"><Icons.undo/>Undo</button>
      <button className="wb-action history-action" onClick={redo} title="Redo (Ctrl+Y)"><Icons.redo/>Redo</button>
      <span className="wb-separator"/>
      <button className="wb-action run" onClick={runAnalysis} disabled={calculating}>{calculating ? <Spinner/> : <Icons.play/>}{calculating ? "Calculating?" : "Calculate"}</button>
      <button className="wb-action clear" onClick={() => void clearTree()}>Clear</button>
    </header>
    <div className="workbench-body">
      <aside className="component-library">
        <div className="library-heading"><strong>Data Register</strong><button onClick={() => { void loadProjectRegister(documentPath).then(result => { setAssets(result.assets); setRegisterPath(result.registerPath); }); }} title="Refresh from Data Register">&#8635;</button></div>
        <label className="library-search"><Icons.search/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find component"/></label>
        <div className="library-scroll">{filteredAssets.map(asset => <button className="library-card" key={asset.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-ramsport", JSON.stringify({ id: asset.id })); }} onClick={() => addAsset(asset)}>
          <strong>{asset.description}</strong><span className="lambda">?: {asset.lambda.toExponential(2)} /h</span><span className="mtbf">MTBF: {asset.lambda ? Math.round(meanTimeBetweenFailures(asset.lambda)).toLocaleString() : "-"} h</span><span className="mttr">MTTR: {asset.mttr} h</span><small>{asset.tag}</small>
        </button>)}</div>
      </aside>
      <div className={`workbench-canvas-wrap ${dragOver ? "drop-ready" : ""} ${panMode ? "pan-active" : ""}`} style={gridStyle} onPointerDown={startPan} onWheel={wheelZoom} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }} onDrop={drop}>
        {notice && <div className="workbench-notice" role="alert"><span>{notice}</span>{topLevelItems.length > 1 && <button type="button" className="notice-action" onClick={connectTopLevelItems}>Connect top-level items</button>}<button onClick={() => setNotice("")} aria-label="Dismiss message">?</button></div>}
        <div className="workbench-canvas" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom / 100})`, transformOrigin: "top left" }}>
          <svg className="connections">{edges.map((edge, index) => {
            const arrow = edgeArrow(edge);
            return <g key={`${edge.from}-${edge.to}-${index}`}><path data-export-edge="true" data-export-from={edge.from} data-export-to={edge.to} className={`diagram-edge ${selectedEdge === index ? "selected" : ""}`} d={edgePath(edge)} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setSelectedEdge(index); setSelected(0); }}/>{arrow && <polygon className="flow-arrow" points="-6,-4 6,0 -6,4" transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}/>}</g>;
          })}{portDrag && <path className="connection-preview" d={`M${portDrag.start.x} ${portDrag.start.y} L${portDrag.current.x} ${portDrag.current.y}`}/>}</svg>
          {edges.map((edge, index) => selectedEdge === index ? <button key={`handle-${index}`} className="edge-handle" style={{ left: edgeHandle(edge).x, top: edgeHandle(edge).y }} onPointerDown={event => dragEdgeHandle(event, index)} title="Drag to adjust connector bend"/> : null)}
          {nodes.map(node => {
            const asset = node.assetId ? assets.find(item => item.id === node.assetId) : undefined;
            const gate = isGate(node);
            const gateId = gate ? `G${nodes.filter(isGate).findIndex(item => item.id === node.id) + 1}` : "";
            return <div data-export-node="true" data-export-id={node.id} data-export-type={node.type} key={node.id} className={`workbench-node ${gate ? "logic-gate-node" : "fta-event-node"} ${node.type.replaceAll(" ", "-")} editing ${selected === node.id ? "selected" : ""}`} style={{ left: node.x, top: node.y }} onPointerDown={event => dragNode(event, node)} onClick={event => { event.stopPropagation(); setSelected(node.id); setSelectedEdge(null); if (!analysis) setPaneOpen(true); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setSelected(node.id); setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY }); }}>
              {(["top", "bottom"] as PortSide[]).map(side => <span key={side} className={`port ${side}`} data-port-node={node.id} data-port-side={side} onPointerDown={event => startPortDrag(event, node, side)} title={side === "top" ? "Output ? drag to the bottom dot of the parent gate or event" : "Input ? drag to the top dot of a cause"}/>)}
              {gate ? <GateGraphic type={node.type} id={gateId}/> : <><strong className="part-number">{asset?.tag ?? node.title}</strong><div className="block-values"><span><b>?</b>{(asset?.lambda ?? node.failureRate ?? 0).toExponential(2)} /h</span><span><b>MTBF</b>{asset?.lambda ? Math.round(meanTimeBetweenFailures(asset.lambda)).toLocaleString() : "-"} h</span><span><b>Mission</b>{asset?.mission ?? node.mission ?? 0} h</span></div><small className="component-name">{asset?.description ?? node.subtitle}</small></>}
            </div>;
          })}
        </div>
        <footer className="workbench-status"><span>{nodes.filter(node => !isGate(node)).length} events</span><span>{nodes.filter(isGate).length} gates</span><span>{edges.length} connections</span><span className="autosave-state">{saving ? "Saving?" : saveTarget ? `Saved to ${saveName}` : "Not saved yet"}</span><div className="zoom-control"><button onClick={() => setZoom(Math.max(MIN_CANVAS_ZOOM, zoom - 10))}>-</button><input type="range" min={MIN_CANVAS_ZOOM} max={MAX_CANVAS_ZOOM} step="10" value={zoom} onChange={event => setZoom(Number(event.target.value))}/><button onClick={() => setZoom(Math.min(MAX_CANVAS_ZOOM, zoom + 10))}>+</button><b>{zoom}%</b></div></footer>
      </div>
    </div>
    {explanationVisible && analysis && <div className="gate-dialog-backdrop" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) setExplanationVisible(false); }}><section className="gate-dialog explanation-dialog"><span>IEC 61025 PROVISIONAL ANALYSIS</span><h2>{analysis.topEvent}</h2><div className="explanation-blocks">{nodes.filter(node => !isGate(node)).map(node => <article key={node.id}><b>{node.title}</b><small>{node.subtitle}</small></article>)}</div><p>The connected events are reduced gate by gate toward the single top event. Boolean reduction identifies these minimal cut sets: <strong>{analysis.cutSets.length ? analysis.cutSets.map(set => `{${set.join(", ")}}`).join(", ") : "none resolved"}</strong>.</p><p>The final operation applies <code>{analysis.formula}</code>, producing Q(t) = {analysis.probability.toExponential(4)} and equivalent ? = {Number.isFinite(analysis.failureRate) ? analysis.failureRate.toExponential(4) : "?"}/h. Static gates are evaluated here; dynamic PAND, SEQ and SPARE logic requires a Markov or simulation method.</p><button className="group-create" onClick={() => setExplanationVisible(false)}>Close</button></section></div>}
    {pendingGate && <div className="gate-dialog-backdrop" role="dialog" aria-modal="true"><section className="gate-dialog"><span>FAULT-TREE LOGIC</span><h2>Select the causal relationship</h2><p>The selected standard gate is inserted between these two events. Connect further causes to the bottom dot of that gate; they become additional inputs of the same gate.</p><div><button onClick={() => confirmGate("gate and")}>AND</button><button onClick={() => confirmGate("gate or")}>OR</button><button onClick={() => confirmGate("gate xor")}>XOR</button><button onClick={() => confirmGate("gate not")}>NOT</button></div><button className="gate-cancel" onClick={() => setPendingGate(null)}>Cancel</button></section></div>}
    {contextMenu && (() => { const node = nodes.find(item => item.id === contextMenu.nodeId); return node ? <div className="gate-change-menu fta-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()}>{isGate(node) ? <><strong>Change logic gate</strong>{(["gate and", "gate or", "gate xor", "gate not"] as GateType[]).map(type => <button key={type} onClick={() => changeGate(node.id, type)}><span className={`mini-gate ${type.replace("gate ", "")}`}/>{gateLabel(type)}</button>)}</> : <><strong>Set event type</strong>{(["event top", "event intermediate", "event basic"] as EventType[]).map(type => <button key={type} onClick={() => changeEvent(node.id, type)}>{type.replace("event ", "").replace(/^./, value => value.toUpperCase())} event</button>)}</>}<button className="context-delete" onClick={removeSelected}>Delete selected</button></div> : null; })()}
    <SaveDialog open={saveOpen} kind="fta" defaultFolder={saveFolder} defaultName={saveName} data={{ nodes, edges }} onClose={() => setSaveOpen(false)} onSaved={handleSaved}/>
  </section>;
}


