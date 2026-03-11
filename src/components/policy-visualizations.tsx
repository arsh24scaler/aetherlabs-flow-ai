"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════════════════════════════
   SHARED TYPES
═══════════════════════════════════════════════════════════════════ */
export interface PolicyNode {
    id: string;
    label: string;
    type: "root" | "section" | "clause" | "exclusion" | "rider" | "condition";
    risk?: "none" | "warning" | "critical";
    summary?: string;
    text?: string;
}

export interface PolicyEdge {
    from: string;
    to: string;
    kind?: "dependency" | "exclusion" | "reference" | "hierarchy";
}

export interface HeatCell {
    section: string;
    severity: "low" | "medium" | "high" | "critical";
    count: number;
    clauses: { name: string; summary: string; ref: string }[];
}

export interface VisualizationData {
    sections: Array<{
        id: string;
        label: string;
        risk: "none" | "warning" | "critical";
        clauses: Array<{
            id: string;
            label: string;
            summary: string;
            risk: "low" | "medium" | "high";
            ref: string;
        }>;
    }>;
    relationships: Array<{
        from: string;
        to: string;
        type: "dependency" | "exclusion" | "reference" | "override";
    }>;
}

/* ═══════════════════════════════════════════════════════════════════
   usePanZoom — native event listeners, passive:false wheel, ref-only gesture state

   Why native (not React synthetic)?
   - React 17+ makes wheel events passive by default → can't preventDefault
   - setPointerCapture on currentTarget is unreliable in synthetic handlers
     because currentTarget is nullified before async setState flushes
   
   Why no state mid-gesture?
   - Keeps all intermediate values in a ref → zero re-renders during drag/pinch
   - Only calls setPz once per animation frame (batched by React 18)

   Tap detection on touch:
   - onMouseEnter never fires on touch → hoveredRef is always null on mobile
   - Instead we do DOM hit-testing via `data-nodeid` attribute on pointer-down
═══════════════════════════════════════════════════════════════════ */
interface PanZoom { zoom: number; pan: { x: number; y: number } }

function usePanZoom(
    containerRef: React.RefObject<HTMLElement | null>,
    onTap: (nodeId: string | null) => void,
    hoveredNodeRef: React.MutableRefObject<string | null>,
    opts?: { min?: number; max?: number }
) {
    const MIN = opts?.min ?? 0.15;
    const MAX = opts?.max ?? 5;

    const [pz, setPz] = useState<PanZoom>({ zoom: 1, pan: { x: 0, y: 0 } });
    const pzRef = useRef<PanZoom>({ zoom: 1, pan: { x: 0, y: 0 } });

    const onTapRef = useRef(onTap);
    onTapRef.current = onTap;
    const hoveredRef2 = useRef(hoveredNodeRef);
    hoveredRef2.current = hoveredNodeRef;

    // All mutable gesture tracking — zero re-renders
    const g = useRef({
        pointers: new Map<number, { x: number; y: number }>(),
        panStart: { x: 0, y: 0 },
        ptrStart: { x: 0, y: 0 },
        pinchDist: 0,
        pinchMid: { x: 0, y: 0 },
        moved: false,
        pinched: false,
        tapTime: 0,
        touchNodeId: null as string | null,
    });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        function commit(next: PanZoom) {
            pzRef.current = next;
            setPz(next);
        }

        function onPointerDown(e: PointerEvent) {
            if (el) {
                try { el.setPointerCapture(e.pointerId); } catch {}
            }
            g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (g.current.pointers.size === 1) {
                g.current.panStart = { ...pzRef.current.pan };
                g.current.ptrStart = { x: e.clientX, y: e.clientY };
                g.current.moved = false;
                g.current.pinched = false;
                g.current.tapTime = Date.now();

                // Hit-test: walk up DOM from touch target to find data-nodeid
                let node: Element | null = e.target as Element;
                let found: string | null = null;
                while (node && node !== el) {
                    const nid = node.getAttribute?.("data-nodeid");
                    if (nid) { found = nid; break; }
                    node = node.parentElement;
                }
                g.current.touchNodeId = found;
            } else if (g.current.pointers.size === 2) {
                g.current.pinched = true;
                const pts = Array.from(g.current.pointers.values());
                g.current.pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                g.current.pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                g.current.panStart = { ...pzRef.current.pan };
            }
        }

        function onPointerMove(e: PointerEvent) {
            if (!g.current.pointers.has(e.pointerId)) return;
            g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (g.current.pointers.size === 1) {
                const dx = e.clientX - g.current.ptrStart.x;
                const dy = e.clientY - g.current.ptrStart.y;
                if (!g.current.moved && Math.hypot(dx, dy) > 6) g.current.moved = true;
                if (g.current.moved) {
                    commit({ ...pzRef.current, pan: { x: g.current.panStart.x + dx, y: g.current.panStart.y + dy } });
                }
            } else if (g.current.pointers.size === 2) {
                const pts = Array.from(g.current.pointers.values());
                const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                const ratio = g.current.pinchDist > 0 ? dist / g.current.pinchDist : 1;
                const pdx = mid.x - g.current.pinchMid.x;
                const pdy = mid.y - g.current.pinchMid.y;
                commit({
                    zoom: Math.max(MIN, Math.min(MAX, pzRef.current.zoom * ratio)),
                    pan: { x: pzRef.current.pan.x + pdx, y: pzRef.current.pan.y + pdy },
                });
                g.current.pinchDist = dist;
                g.current.pinchMid = mid;
            }
        }

        function onPointerUp(e: PointerEvent) {
            if (el) {
                try { el.releasePointerCapture(e.pointerId); } catch {}
            }
            g.current.pointers.delete(e.pointerId);

            if (g.current.pointers.size === 0) {
                if (!g.current.moved && !g.current.pinched && Date.now() - g.current.tapTime < 500) {
                    // Touch tap: use hit-tested id; Mouse click: use hovered ref
                    const id = g.current.touchNodeId ?? hoveredRef2.current.current;
                    onTapRef.current(id);
                }
                g.current.touchNodeId = null;
            } else if (g.current.pointers.size === 1) {
                const rem = Array.from(g.current.pointers.values())[0];
                g.current.ptrStart = { x: rem.x, y: rem.y };
                g.current.panStart = { ...pzRef.current.pan };
                g.current.moved = false;
            }
        }

        function onPointerCancel(e: PointerEvent) {
            if (el) {
                try { el.releasePointerCapture(e.pointerId); } catch {}
            }
            g.current.pointers.delete(e.pointerId);
            if (g.current.pointers.size === 0) g.current.touchNodeId = null;
        }

        // passive: false → allows preventDefault so browser doesn't scroll/zoom the page
        function onWheel(e: WheelEvent) {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
                const factor = 1 - e.deltaY * 0.005;
                commit({ ...pzRef.current, zoom: Math.max(MIN, Math.min(MAX, pzRef.current.zoom * factor)) });
            } else {
                commit({ ...pzRef.current, pan: { x: pzRef.current.pan.x - e.deltaX, y: pzRef.current.pan.y - e.deltaY } });
            }
        }

        function onContextMenu(e: Event) {
            e.preventDefault();
            const reset: PanZoom = { zoom: 1, pan: { x: 0, y: 0 } };
            commit(reset);
        }

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        el.addEventListener("wheel", onWheel, { passive: false });
        el.addEventListener("contextmenu", onContextMenu);

        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("contextmenu", onContextMenu);
        };
    }, [containerRef, MIN, MAX]);

    return pz;
}

/* ═══════════════════════════════════════════════════════════════════
   GRAPH HELPERS
═══════════════════════════════════════════════════════════════════ */
function buildDefaultGraph(riskScore: number, flags: string[]): { nodes: PolicyNode[]; edges: PolicyEdge[] } {
    const nodes: PolicyNode[] = [
        { id: "policy", label: "Policy", type: "root", summary: "Root policy document" },
        { id: "coverage", label: "Coverage", type: "section", summary: "Main coverage provisions" },
        { id: "exclusions", label: "Exclusions", type: "section", risk: "warning", summary: "What is NOT covered" },
        { id: "conditions", label: "Conditions", type: "section", summary: "Policy conditions and requirements" },
        { id: "limits", label: "Limits", type: "section", risk: riskScore >= 60 ? "warning" : "none", summary: "Coverage limit specifications" },
        { id: "riders", label: "Riders", type: "section", summary: "Additional policy riders" },
        { id: "hosp", label: "Hospitalization", type: "clause", summary: "Inpatient hospitalization coverage" },
        { id: "death", label: "Accidental Death", type: "clause", summary: "Accidental death benefit" },
        { id: "flood", label: "Natural Disaster", type: "exclusion", risk: "critical", summary: "Floods and natural disasters excluded" },
        { id: "war", label: "War & Terrorism", type: "exclusion", risk: "critical", summary: "War-related events excluded" },
        { id: "waiting", label: "Waiting Period", type: "condition", risk: "warning", summary: "30-day waiting period applies" },
        { id: "grace", label: "Grace Period", type: "condition", summary: "15-day premium grace period" },
        { id: "sub_limit", label: "Sub-limits", type: "clause", risk: riskScore >= 50 ? "warning" : "none", summary: "Room rent and other sub-limits" },
    ];
    if (flags?.length > 0) {
        flags.slice(0, 3).forEach((flag, i) => {
            nodes.push({ id: `flag_${i}`, label: flag.slice(0, 18), type: "clause", risk: "warning", summary: flag });
        });
    }
    const edges: PolicyEdge[] = [
        { from: "policy", to: "coverage", kind: "hierarchy" },
        { from: "policy", to: "exclusions", kind: "hierarchy" },
        { from: "policy", to: "conditions", kind: "hierarchy" },
        { from: "policy", to: "limits", kind: "hierarchy" },
        { from: "policy", to: "riders", kind: "hierarchy" },
        { from: "coverage", to: "hosp", kind: "hierarchy" },
        { from: "coverage", to: "death", kind: "hierarchy" },
        { from: "exclusions", to: "flood", kind: "hierarchy" },
        { from: "exclusions", to: "war", kind: "hierarchy" },
        { from: "conditions", to: "waiting", kind: "hierarchy" },
        { from: "conditions", to: "grace", kind: "hierarchy" },
        { from: "limits", to: "sub_limit", kind: "hierarchy" },
        { from: "waiting", to: "hosp", kind: "dependency" },
        { from: "flood", to: "coverage", kind: "exclusion" },
    ];
    if (flags?.length > 0) {
        flags.slice(0, 3).forEach((_, i) => {
            edges.push({ from: "conditions", to: `flag_${i}`, kind: "hierarchy" });
        });
    }
    return { nodes, edges };
}

type NodeType = PolicyNode["type"];
type RiskType = PolicyNode["risk"];

function nodeColor(type: NodeType, risk: RiskType, accent: string): string {
    if (risk === "critical") return "#ef4444";
    if (risk === "warning") return "#f59e0b";
    if (type === "root") return accent;
    if (type === "section") return "#6366f1";
    if (type === "exclusion") return "#dc2626";
    if (type === "rider") return "#8b5cf6";
    if (type === "condition") return "#f59e0b";
    return "#3f3f46";
}

function nodeGlow(type: NodeType, risk: RiskType, accent: string): string {
    if (risk === "critical") return "rgba(239,68,68,0.4)";
    if (risk === "warning") return "rgba(245,158,11,0.3)";
    if (type === "root") {
        const rv = parseInt(accent.slice(1, 3), 16);
        const gv = parseInt(accent.slice(3, 5), 16);
        const bv = parseInt(accent.slice(5, 7), 16);
        return `rgba(${rv},${gv},${bv},0.35)`;
    }
    if (type === "section") return "rgba(99,102,241,0.25)";
    return "rgba(63,63,70,0.2)";
}

function edgeColor(kind: PolicyEdge["kind"]): string {
    if (kind === "exclusion") return "rgba(239,68,68,0.4)";
    if (kind === "dependency") return "rgba(34,197,94,0.4)";
    if (kind === "reference") return "rgba(59,130,246,0.4)";
    return "rgba(255,255,255,0.06)";
}

/* ═══════════════════════════════════════════════════════════════════
   1. POLICY NETWORK GRAPH
═══════════════════════════════════════════════════════════════════ */
export function PolicyNetworkGraph({ riskScore = 50, flags = [], data, theme = "consumer" }: {
    riskScore?: number; flags?: string[]; data?: VisualizationData; theme?: "consumer" | "pro";
}) {
    const accentColor = theme === "pro" ? "#3b82f6" : "#c8ff00";
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 800, h: 520 });
    const [hovered, setHovered] = useState<string | null>(null);
    const [selected, setSelected] = useState<PolicyNode | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const hoveredRef = useRef<string | null>(null);
    hoveredRef.current = hovered;

    const { nodes: initNodes, edges } = useMemo(() => {
        if (data?.sections) {
            const nodes: PolicyNode[] = [{ id: "policy", label: "Policy", type: "root", summary: "Root policy document" }];
            const edges: PolicyEdge[] = [];
            data.sections.forEach(sec => {
                nodes.push({ id: sec.id, label: sec.label, type: "section", risk: sec.risk, summary: sec.label });
                edges.push({ from: "policy", to: sec.id, kind: "hierarchy" });
                sec.clauses.forEach(cl => {
                    nodes.push({ id: cl.id, label: cl.label, type: "clause", risk: cl.risk === "high" ? "critical" : cl.risk === "medium" ? "warning" : "none", summary: cl.summary });
                    edges.push({ from: sec.id, to: cl.id, kind: "hierarchy" });
                });
            });
            (data.relationships || []).forEach(rel => { edges.push({ from: rel.from, to: rel.to, kind: rel.type === "exclusion" ? "exclusion" : "dependency" }); });
            return { nodes, edges };
        }
        return buildDefaultGraph(riskScore, flags);
    }, [data, riskScore, flags]);

    const handleTap = useCallback((nodeId: string | null) => {
        if (!nodeId) return;
        const n = initNodes.find(nd => nd.id === nodeId);
        if (!n) return;
        if (n.type === "section") {
            setExpandedSections(prev => { const next = new Set(prev); next.has(n.id) ? next.delete(n.id) : next.add(n.id); return next; });
        } else if (n.type !== "root") {
            setSelected(prev => prev?.id === n.id ? null : n);
        }
    }, [initNodes]);

    const { zoom, pan } = usePanZoom(containerRef, handleTap, hoveredRef);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            setDims({ w: r.width, h: Math.max(r.height, 400) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const rootNode = initNodes.find(n => n.type === "root") || initNodes[0];
    const sections = initNodes.filter(n => n.type === "section");
    const sectionChildren: Record<string, PolicyNode[]> = {};
    sections.forEach(s => {
        const childIds = edges.filter(e => e.from === s.id && e.kind === "hierarchy").map(e => e.to);
        sectionChildren[s.id] = initNodes.filter(n => childIds.includes(n.id));
    });

    const cx = dims.w / 2, cy = dims.h / 2;
    const rSec = Math.min(dims.w, dims.h) * 0.28;
    const rClause = Math.min(dims.w, dims.h) * 0.46;

    type NodePos = PolicyNode & { x: number; y: number };
    const positions: Record<string, NodePos> = {};
    if (rootNode) positions[rootNode.id] = { ...rootNode, x: cx, y: cy };
    sections.forEach((sec, i) => {
        const angle = (i / sections.length) * Math.PI * 2 - Math.PI / 2;
        positions[sec.id] = { ...sec, x: cx + Math.cos(angle) * rSec, y: cy + Math.sin(angle) * rSec };
        if (expandedSections.has(sec.id)) {
            const children = sectionChildren[sec.id] || [];
            if (children.length > 0) {
                const arc = Math.min(Math.PI / 2, ((Math.PI * 2) / sections.length) * 0.85);
                const start = angle - arc / 2;
                const step = children.length > 1 ? arc / (children.length - 1) : 0;
                children.forEach((child, ci) => {
                    const cA = children.length === 1 ? angle : start + ci * step;
                    positions[child.id] = { ...child, x: cx + Math.cos(cA) * rClause, y: cy + Math.sin(cA) * rClause };
                });
            }
        }
    });

    const activeNodes = Object.values(positions);
    const activeIds = new Set(activeNodes.map(n => n.id));
    const activeEdges = edges.filter(e => activeIds.has(e.from) && activeIds.has(e.to));

    const hlNodes = new Set<string>();
    const hlEdges = new Set<string>();
    if (hovered) {
        let cur = hovered; hlNodes.add(cur);
        while (cur !== rootNode?.id) {
            const pe = edges.find(e => e.to === cur && e.kind === "hierarchy");
            if (pe && activeIds.has(pe.from)) { hlEdges.add(`${pe.from}-${pe.to}`); cur = pe.from; hlNodes.add(cur); }
            else break;
        }
    } else if (selected) hlNodes.add(selected.id);

    const isMobile = dims.w < 640;

    return (
        <div className="relative w-full h-full min-h-[350px] flex overflow-hidden select-none">
            <div ref={containerRef} className="flex-1 relative overflow-hidden"
                style={{ cursor: "grab", touchAction: "none", userSelect: "none" }}>
                <svg width={dims.w} height={dims.h} style={{ touchAction: "none", display: "block" }}>
                    <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                        <defs>
                            {activeNodes.map(n => (
                                <radialGradient key={n.id} id={`ng-${n.id}`} cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor={nodeGlow(n.type, n.risk, accentColor)} stopOpacity="0.8" />
                                    <stop offset="100%" stopColor={nodeGlow(n.type, n.risk, accentColor)} stopOpacity="0" />
                                </radialGradient>
                            ))}
                        </defs>

                        {activeEdges.map((e, i) => {
                            const s = positions[e.from], t = positions[e.to];
                            if (!s || !t) return null;
                            const hi = hlEdges.has(`${e.from}-${e.to}`) || (hovered === e.from && e.kind !== "hierarchy") || (hovered === e.to && e.kind !== "hierarchy");
                            const base = edgeColor(e.kind);
                            const stroke = hi ? base.replace("0.06", "0.6").replace("0.4", "0.8") : base;
                            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={stroke}
                                strokeWidth={hi ? 1.5 : (e.kind === "hierarchy" && s.type === "root" ? 1.0 : 0.6)}
                                strokeDasharray={e.kind === "dependency" ? "4,3" : e.kind === "exclusion" ? "2,2" : undefined}
                                style={{ transition: "stroke 0.2s, stroke-width 0.2s" }} />;
                        })}

                        {activeNodes.map(n => {
                            const rBase = n.type === "root" ? 22 : n.type === "section" ? 14 : 9;
                            const r = isMobile ? rBase * 0.9 : rBase;
                            const isHov = hovered === n.id, isSel = selected?.id === n.id, isPath = hlNodes.has(n.id);
                            const expanded = expandedSections.has(n.id);
                            const col = nodeColor(n.type, n.risk, accentColor);
                            const hitR = Math.max(r * 2.2, 24);
                            return (
                                <g key={n.id} data-nodeid={n.id}
                                    style={{ cursor: n.type === "root" ? "default" : "pointer" }}
                                    onMouseEnter={() => setHovered(n.id)}
                                    onMouseLeave={() => setHovered(null)}>
                                    {/* Large transparent hit area — essential for mobile tapping */}
                                    <circle cx={n.x} cy={n.y} r={hitR} fill="transparent" />
                                    <circle cx={n.x} cy={n.y} r={r * 3} fill={`url(#ng-${n.id})`}
                                        opacity={isHov || isSel || isPath ? 0.9 : 0.4}
                                        style={{ pointerEvents: "none", transition: "opacity 0.25s" }} />
                                    <circle cx={n.x} cy={n.y} r={r} fill="#0e0e0e" stroke={col}
                                        strokeWidth={isHov || isSel || isPath ? 2 : 1}
                                        filter={isHov || isSel || isPath ? `drop-shadow(0 0 8px ${col})` : undefined}
                                        style={{ pointerEvents: "none", transition: "stroke-width 0.2s" }} />
                                    {n.type === "section" && (
                                        <circle cx={n.x} cy={n.y} r={r - 3} fill="none" stroke={col} strokeWidth={1}
                                            strokeDasharray={expanded ? "" : "2,2"} opacity={0.5}
                                            style={{ pointerEvents: "none" }} />
                                    )}
                                    {n.risk && n.risk !== "none" && (
                                        <circle cx={n.x + r * 0.7} cy={n.y - r * 0.7} r={4}
                                            fill={n.risk === "critical" ? "#ef4444" : "#f59e0b"}
                                            stroke="#0e0e0e" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                                    )}
                                    <text x={n.x} y={n.y + r + (n.type === "root" ? 13 : 11)}
                                        textAnchor="middle" dominantBaseline="middle"
                                        style={{ fontSize: n.type === "root" ? (isMobile ? 9 : 11) : (isMobile ? 7 : 9), fill: isHov || isSel || isPath ? "#fff" : (n.type === "root" ? accentColor : "#e4e4e7"), fontFamily: "monospace", fontWeight: 600, letterSpacing: 0.3, userSelect: "none", pointerEvents: "none", transition: "fill 0.2s" }}>
                                        {n.label.length > (isMobile ? 12 : 15) ? n.label.slice(0, isMobile ? 11 : 14) + "…" : n.label}
                                    </text>
                                    {n.type === "section" && isHov && !expanded && (
                                        <text x={n.x} y={n.y - r - 10} textAnchor="middle" dominantBaseline="middle"
                                            style={{ fontSize: 8, fill: col, fontFamily: "monospace", pointerEvents: "none" }}>+ EXPAND</text>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                <div className="absolute bottom-4 left-4 pointer-events-none bg-black/70 px-2.5 py-2 rounded-xl border border-white/10 shadow-xl flex flex-col gap-1">
                    <span className="text-[8px] font-mono text-zinc-300 uppercase"><span className="text-white font-bold">Drag</span> to pan</span>
                    <span className="text-[8px] font-mono text-zinc-300 uppercase hidden sm:block"><span className="text-white font-bold">Ctrl+Scroll</span> to zoom</span>
                    <span className="text-[8px] font-mono text-zinc-300 uppercase sm:hidden"><span className="text-white font-bold">Pinch</span> to zoom</span>
                    <span className="text-[8px] font-mono text-zinc-300 uppercase hidden sm:block"><span className="text-white font-bold">Right-click</span> to reset</span>
                </div>
                <div className="absolute top-4 left-4 pointer-events-none bg-black/70 px-2.5 py-2 rounded-xl border border-white/10 shadow-xl flex flex-col gap-1.5">
                    {[{ col: accentColor, label: "Root" }, { col: "#6366f1", label: "Section" }, { col: "#f59e0b", label: "Warning" }, { col: "#ef4444", label: "Critical" }].map(l => (
                        <div key={l.label} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: l.col, boxShadow: `0 0 5px ${l.col}` }} />
                            <span className="text-[8px] font-mono text-white/90 font-bold uppercase tracking-widest">{l.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <AnimatePresence>
                {selected && selected.type !== "root" && (() => {
                    const col = nodeColor(selected.type, selected.risk, accentColor);
                    return isMobile ? (
                        <motion.div key="mp" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute inset-x-0 bottom-0 z-50 bg-[#0a0a0a]/97 border-t-2 rounded-t-3xl flex flex-col shadow-2xl overflow-hidden"
                            style={{ maxHeight: "50%", borderTopColor: `${accentColor}44` }}>
                            <DetailPanel selected={selected} col={col} onClose={() => setSelected(null)} />
                        </motion.div>
                    ) : (
                        <motion.div key="dp" initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="relative z-50 bg-[#0a0a0a]/97 border-l-2 flex flex-col shadow-2xl overflow-hidden shrink-0"
                            style={{ borderLeftColor: `${accentColor}33` }}>
                            <DetailPanel selected={selected} col={col} onClose={() => setSelected(null)} />
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
}

function DetailPanel({ selected, col, onClose }: { selected: PolicyNode; col: string; onClose: () => void }) {
    return (
        <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05] shrink-0">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: col }}>{selected.type} Detail</span>
                <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors bg-white/[0.05] p-1.5 rounded-lg"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Label</span>
                    <p className="text-[12px] font-mono font-bold text-zinc-100 mt-1 leading-snug">{selected.label}</p>
                </div>
                {selected.risk && selected.risk !== "none" && (
                    <div>
                        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Risk</span>
                        <div className={`mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] border ${selected.risk === "critical" ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}`}>
                            <AlertTriangle size={10} />
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest">{selected.risk}</span>
                        </div>
                    </div>
                )}
                <div>
                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">AI Summary</span>
                    <p className="text-[11px] font-mono text-zinc-400 mt-1.5 leading-relaxed bg-white/[0.02] p-2 rounded border border-white/[0.02]">{selected.summary || "No summary available."}</p>
                </div>
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   2. CLAUSE RELATIONSHIP MAP
═══════════════════════════════════════════════════════════════════ */
interface ClauseNode { id: string; label: string; risk: "low" | "medium" | "high"; text?: string; implications?: string; }
interface ClauseLink { from: string; to: string; type: "dependency" | "exclusion" | "reference" | "override"; }

function buildDefaultClauses(): { nodes: ClauseNode[]; links: ClauseLink[] } {
    const nodes: ClauseNode[] = [
        { id: "c1", label: "Clause 1 – Definitions", risk: "low", text: "Defines key terms used across all policy sections.", implications: "Sets the interpretation framework." },
        { id: "c2", label: "Clause 2 – Coverage Scope", risk: "low", text: "Outlines the primary coverage provided.", implications: "Core benefit determination." },
        { id: "c3", label: "Clause 3 – Exclusions", risk: "high", text: "Lists events and circumstances not covered.", implications: "Critical — may invalidate claims." },
        { id: "c4", label: "Clause 4 – Waiting Period", risk: "medium", text: "30-day waiting period for non-accidental claims.", implications: "Delays first eligibility." },
        { id: "c5", label: "Clause 5 – Claims Process", risk: "low", text: "Procedure for filing and processing claims.", implications: "Compliance required for payout." },
        { id: "c6", label: "Clause 6 – Sub-limits", risk: "high", text: "Room rent capped at 1% of sum insured per day.", implications: "High financial impact on hospitalisation." },
        { id: "c7", label: "Clause 7 – Co-payment", risk: "high", text: "20% co-payment applicable on all claims.", implications: "Reduces effective payout." },
        { id: "c8", label: "Clause 8 – Renewal", risk: "low", text: "Policy renewable annually with 30-day grace period.", implications: "Continuity of coverage." },
        { id: "c9", label: "Clause 9 – Premium", risk: "medium", text: "Premium revision allowed at renewal.", implications: "Cost unpredictability." },
        { id: "c10", label: "Clause 10 – Termination", risk: "medium", text: "Policy terminates on non-payment beyond grace period.", implications: "Coverage gap risk." },
    ];
    const links: ClauseLink[] = [
        { from: "c1", to: "c2", type: "dependency" }, { from: "c1", to: "c3", type: "dependency" },
        { from: "c3", to: "c2", type: "exclusion" }, { from: "c4", to: "c2", type: "exclusion" },
        { from: "c5", to: "c2", type: "reference" }, { from: "c6", to: "c2", type: "override" },
        { from: "c7", to: "c2", type: "override" }, { from: "c9", to: "c8", type: "dependency" },
        { from: "c10", to: "c8", type: "dependency" }, { from: "c1", to: "c5", type: "dependency" },
    ];
    return { nodes, links };
}

function linkColor(type: ClauseLink["type"]): string {
    if (type === "exclusion") return "#ef4444";
    if (type === "override") return "#f59e0b";
    if (type === "dependency") return "#22c55e";
    return "#3b82f6";
}

export function ClauseRelationshipMap({ data, theme = "consumer" }: { data?: VisualizationData; theme?: "consumer" | "pro" }) {
    const accentColor = theme === "pro" ? "#3b82f6" : "#c8ff00";
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 700, h: 480 });
    const [hovered, setHovered] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<ClauseNode | null>(null);
    const hoveredRef = useRef<string | null>(null);
    hoveredRef.current = hovered;

    const { nodes, links } = useMemo(() => {
        if (data?.sections) {
            const nodes: ClauseNode[] = [];
            const links: ClauseLink[] = [];
            data.sections.forEach(sec => {
                nodes.push({ id: sec.id, label: sec.label, risk: sec.risk === "critical" ? "high" : sec.risk === "warning" ? "medium" : "low", text: `Section: ${sec.label}`, implications: `Contains ${sec.clauses.length} clauses.` });
                sec.clauses.forEach(cl => { nodes.push({ id: cl.id, label: cl.label, risk: cl.risk, text: cl.summary, implications: `Risk: ${cl.risk}. Part of ${sec.label}.` }); });
            });
            (data.relationships || []).forEach(rel => { links.push({ from: rel.from, to: rel.to, type: rel.type }); });
            return { nodes, links };
        }
        return buildDefaultClauses();
    }, [data]);

    const handleTap = useCallback((nodeId: string | null) => {
        if (!nodeId) return;
        const n = nodes.find(nd => nd.id === nodeId);
        if (n) setDrawer(prev => prev?.id === n.id ? null : n);
    }, [nodes]);

    const { zoom, pan } = usePanZoom(containerRef, handleTap, hoveredRef);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            setDims({ w: r.width, h: Math.max(r.height, 400) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const isMobile = dims.w < 640;
    const graphW = isMobile ? dims.w : (drawer ? dims.w - 300 : dims.w);
    const cx = graphW / 2, cy = dims.h / 2;
    const radius = Math.min(cx, cy) - (isMobile ? 55 : 70);

    const pos: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        pos[n.id] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });

    const connected = (id: string) => new Set(links.filter(l => l.from === id || l.to === id).flatMap(l => [l.from, l.to]));
    const curved = (x1: number, y1: number, x2: number, y2: number) => {
        const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25, my = (y1 + y2) / 2 + (x1 - x2) * 0.25;
        return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
    };
    const nodeR = isMobile ? 20 : 26;

    return (
        <div className="relative w-full h-full min-h-[400px] flex overflow-hidden select-none">
            <div ref={containerRef} className="flex-1 relative overflow-hidden"
                style={{ cursor: "grab", touchAction: "none", userSelect: "none" }}>
                <svg width={graphW} height={dims.h} style={{ touchAction: "none", display: "block" }}>
                    <defs>
                        {(["dependency", "exclusion", "reference", "override"] as ClauseLink["type"][]).map(t => (
                            <marker key={t} id={`arr-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill={linkColor(t)} fillOpacity="0.7" />
                            </marker>
                        ))}
                    </defs>
                    <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                        {links.map((l, i) => {
                            const s = pos[l.from], t = pos[l.to];
                            if (!s || !t) return null;
                            const hi = hovered ? (l.from === hovered || l.to === hovered) : true;
                            return <path key={i} d={curved(s.x, s.y, t.x, t.y)} fill="none" stroke={linkColor(l.type)}
                                strokeWidth={hi ? 1.5 : 0.5} opacity={hi ? 0.8 : 0.15}
                                strokeDasharray={l.type === "reference" ? "4,3" : undefined}
                                markerEnd={`url(#arr-${l.type})`}
                                style={{ transition: "opacity 0.2s, stroke-width 0.2s" }} />;
                        })}
                        {nodes.map(n => {
                            const p = pos[n.id];
                            if (!p) return null;
                            const conn = hovered ? connected(hovered) : null;
                            const isHov = hovered === n.id;
                            const isDim = !!(hovered && !conn?.has(n.id));
                            const riskCol = n.risk === "high" ? "#ef4444" : n.risk === "medium" ? "#f59e0b" : "#4b5563";
                            const borderCol = drawer?.id === n.id ? accentColor : isHov ? accentColor : riskCol;
                            return (
                                <g key={n.id} data-nodeid={n.id}
                                    style={{ cursor: "pointer", opacity: isDim ? 0.25 : 1, transition: "opacity 0.2s" }}
                                    onMouseEnter={() => setHovered(n.id)}
                                    onMouseLeave={() => setHovered(null)}>
                                    {/* Large transparent hit area */}
                                    <circle cx={p.x} cy={p.y} r={nodeR + 12} fill="transparent" />
                                    <circle cx={p.x} cy={p.y} r={nodeR} fill="#0e0e0e" stroke={borderCol}
                                        strokeWidth={isHov || drawer?.id === n.id ? 1.5 : 0.7}
                                        filter={isHov ? `drop-shadow(0 0 8px ${borderCol})` : undefined}
                                        style={{ transition: "stroke-width 0.2s", pointerEvents: "none" }} />
                                    {n.risk !== "low" && <circle cx={p.x} cy={p.y} r={nodeR + 4} fill="none" stroke={riskCol} strokeWidth={0.3} opacity={0.3} style={{ pointerEvents: "none" }} />}
                                    <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                                        style={{ fontSize: isMobile ? 6 : 7, fill: isHov ? "#fff" : "#f4f4f5", fontFamily: "monospace", fontWeight: 700, userSelect: "none", pointerEvents: "none" }}>
                                        {(() => {
                                            const words = n.label.toUpperCase().split(" ");
                                            const half = Math.ceil(words.length / 2);
                                            const l1 = words.slice(0, half).join(" ").slice(0, 12);
                                            const l2 = words.slice(half).join(" ").slice(0, 12);
                                            return l2 ? <><tspan x={p.x} dy="-0.6em">{l1}</tspan><tspan x={p.x} dy="1.2em">{l2}</tspan></> : <tspan>{l1}</tspan>;
                                        })()}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>

                <div className="absolute bottom-4 left-4 bg-black/85 border border-white/10 rounded-2xl p-3 pointer-events-none">
                    <p className="text-[7px] font-mono font-black text-white uppercase tracking-[0.2em] mb-2 opacity-90">Relationship</p>
                    {[{ col: "#22c55e", label: "Dependency" }, { col: "#ef4444", label: "Exclusion" }, { col: "#f59e0b", label: "Override" }, { col: "#3b82f6", label: "Reference" }].map(l => (
                        <div key={l.label} className="flex items-center gap-2 mb-1">
                            <div className="w-4 h-0.5 shrink-0" style={{ background: l.col }} />
                            <span className="text-[8px] font-mono text-white/90 font-bold uppercase">{l.label}</span>
                        </div>
                    ))}
                </div>
                <div className="absolute top-4 right-4 pointer-events-none bg-black/70 p-2.5 rounded-xl border border-white/10 text-[8px] font-mono text-white/70 uppercase flex flex-col items-end gap-1">
                    <span><span className="text-white font-black">Drag</span> to navigate</span>
                    <span className="hidden sm:block"><span className="text-white font-black">Ctrl+Scroll</span> to zoom</span>
                    <span className="sm:hidden"><span className="text-white font-black">Pinch</span> to zoom</span>
                    <span className="hidden sm:block"><span className="text-white font-black">Right-click</span> to reset</span>
                </div>
            </div>

            <AnimatePresence>
                {drawer && (
                    isMobile ? (
                        <motion.div key="cm" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute inset-x-0 bottom-0 z-50 bg-[#0a0a0a] border-t-2 rounded-t-3xl overflow-hidden flex flex-col shadow-2xl"
                            style={{ maxHeight: "50%", borderTopColor: `${accentColor}44` }}>
                            <ClauseDrawer drawer={drawer} links={links} nodes={nodes} onClose={() => setDrawer(null)} accentColor={accentColor} />
                        </motion.div>
                    ) : (
                        <motion.div key="cd" initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="relative bg-[#0a0a0a] border-l-2 overflow-hidden shrink-0 flex flex-col z-50 shadow-2xl"
                            style={{ borderLeftColor: `${accentColor}33` }}>
                            <ClauseDrawer drawer={drawer} links={links} nodes={nodes} onClose={() => setDrawer(null)} accentColor={accentColor} />
                        </motion.div>
                    )
                )}
            </AnimatePresence>
        </div>
    );
}

function ClauseDrawer({ drawer, links, nodes, onClose, accentColor }: { drawer: ClauseNode; links: ClauseLink[]; nodes: ClauseNode[]; onClose: () => void; accentColor: string }) {
    return (
        <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] shrink-0 bg-black/20">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: accentColor }}>Clause Detail</span>
                <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors bg-white/[0.05] p-1.5 rounded-lg"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div><span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Title</span><p className="text-[13px] font-mono font-semibold text-zinc-200 mt-0.5">{drawer.label}</p></div>
                <div><span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Risk Level</span><p className={`text-[11px] font-mono font-bold mt-0.5 capitalize ${drawer.risk === "high" ? "text-red-400" : drawer.risk === "medium" ? "text-amber-400" : "text-emerald-400"}`}>{drawer.risk}</p></div>
                <div><span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Clause Text</span><p className="text-[11px] font-mono text-zinc-400 mt-1 leading-relaxed border border-white/[0.04] rounded-lg p-3 bg-white/[0.015]">{drawer.text || "—"}</p></div>
                <div><span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Implications</span><p className="text-[11px] font-mono text-zinc-500 mt-1">{drawer.implications || "—"}</p></div>
                <div>
                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Connected From</span>
                    <div className="mt-1 space-y-1">
                        {links.filter(l => l.to === drawer.id).map((l, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-zinc-300">
                                <div className="w-2 h-0.5 shrink-0" style={{ background: linkColor(l.type) }} />
                                {nodes.find(n => n.id === l.from)?.label || l.from}
                            </div>
                        ))}
                        {links.filter(l => l.to === drawer.id).length === 0 && <p className="text-[10px] font-mono text-zinc-400">None</p>}
                    </div>
                </div>
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   3. RISK HEATMAP
═══════════════════════════════════════════════════════════════════ */
const DEFAULT_HEATMAP: HeatCell[] = [
    { section: "Coverage", severity: "low", count: 4, clauses: [{ name: "Hospitalization", summary: "Inpatient covered", ref: "§2.1" }, { name: "Surgery", summary: "Surgical procedures covered", ref: "§2.3" }, { name: "Diagnostics", summary: "Lab and imaging covered", ref: "§2.5" }, { name: "Emergency", summary: "Emergency care covered", ref: "§2.7" }] },
    { section: "Coverage", severity: "medium", count: 2, clauses: [{ name: "Outpatient", summary: "Limited OPD coverage", ref: "§2.8" }, { name: "Dental", summary: "Restricted dental benefit", ref: "§2.9" }] },
    { section: "Coverage", severity: "high", count: 1, clauses: [{ name: "Mental Health", summary: "Sub-limited mental health", ref: "§2.11" }] },
    { section: "Coverage", severity: "critical", count: 0, clauses: [] },
    { section: "Exclusions", severity: "low", count: 0, clauses: [] },
    { section: "Exclusions", severity: "medium", count: 2, clauses: [{ name: "Pre-existing", summary: "4-year waiting for PE conditions", ref: "§3.2" }, { name: "Cosmetic", summary: "Cosmetic surgery excluded", ref: "§3.5" }] },
    { section: "Exclusions", severity: "high", count: 3, clauses: [{ name: "Natural Disaster", summary: "Flood, earthquake excluded", ref: "§3.7" }, { name: "War", summary: "War and terrorism excluded", ref: "§3.8" }, { name: "Self-injury", summary: "Self inflicted injuries excluded", ref: "§3.9" }] },
    { section: "Exclusions", severity: "critical", count: 1, clauses: [{ name: "Pandemic", summary: "Diseases declared pandemic excluded", ref: "§3.12" }] },
    { section: "Conditions", severity: "low", count: 1, clauses: [{ name: "Grace Period", summary: "15-day premium grace", ref: "§4.1" }] },
    { section: "Conditions", severity: "medium", count: 2, clauses: [{ name: "Waiting Period", summary: "30-day initial waiting", ref: "§4.3" }, { name: "Sub-limit", summary: "Room rent at 1% SI", ref: "§4.5" }] },
    { section: "Conditions", severity: "high", count: 1, clauses: [{ name: "Co-payment", summary: "20% copayment compulsory", ref: "§4.7" }] },
    { section: "Conditions", severity: "critical", count: 0, clauses: [] },
    { section: "Claims", severity: "low", count: 2, clauses: [{ name: "Cashless", summary: "Cashless at network hospitals", ref: "§5.1" }, { name: "Reimbursement", summary: "45-day reimbursement window", ref: "§5.3" }] },
    { section: "Claims", severity: "medium", count: 1, clauses: [{ name: "Documentation", summary: "Extensive documents required", ref: "§5.5" }] },
    { section: "Claims", severity: "high", count: 1, clauses: [{ name: "Dispute", summary: "Limited dispute resolution", ref: "§5.8" }] },
    { section: "Claims", severity: "critical", count: 0, clauses: [] },
    { section: "Limits", severity: "low", count: 1, clauses: [{ name: "Aggregate", summary: "Annual aggregate limit applies", ref: "§6.1" }] },
    { section: "Limits", severity: "medium", count: 2, clauses: [{ name: "Disease Limit", summary: "Per-disease sub-limit", ref: "§6.3" }, { name: "Provider Limit", summary: "Network only for full coverage", ref: "§6.5" }] },
    { section: "Limits", severity: "high", count: 2, clauses: [{ name: "ICU Cap", summary: "ICU charges capped at 2% SI", ref: "§6.7" }, { name: "Ambulance", summary: "Ambulance limited to ₹2000", ref: "§6.9" }] },
    { section: "Limits", severity: "critical", count: 0, clauses: [] },
    { section: "Time", severity: "low", count: 1, clauses: [{ name: "Policy Term", summary: "Annual policy year", ref: "§7.1" }] },
    { section: "Time", severity: "medium", count: 1, clauses: [{ name: "Claim Deadline", summary: "Claims within 30 days of discharge", ref: "§7.3" }] },
    { section: "Time", severity: "high", count: 1, clauses: [{ name: "Cooling Off", summary: "15-day free look cancellation only", ref: "§7.5" }] },
    { section: "Time", severity: "critical", count: 0, clauses: [] },
];

const SECTIONS = ["Coverage", "Exclusions", "Conditions", "Claims", "Limits", "Time"];
const SEVERITIES: HeatCell["severity"][] = ["low", "medium", "high", "critical"];

function cellFill(sev: HeatCell["severity"], count: number, accent: string): string {
    if (count === 0) return "rgba(255,255,255,0.02)";
    if (sev === "critical") return `rgba(220,38,38,${Math.min(0.15 + count * 0.2, 0.9)})`;
    if (sev === "high") return `rgba(239,68,68,${Math.min(0.1 + count * 0.12, 0.7)})`;
    if (sev === "medium") return `rgba(245,158,11,${Math.min(0.1 + count * 0.1, 0.6)})`;
    const rv = parseInt(accent.slice(1, 3), 16), gv = parseInt(accent.slice(3, 5), 16), bv = parseInt(accent.slice(5, 7), 16);
    return `rgba(${rv},${gv},${bv},${Math.min(0.06 + count * 0.06, 0.4)})`;
}

function cellStroke(sev: HeatCell["severity"], count: number, accent: string): string {
    if (count === 0) return "rgba(255,255,255,0.03)";
    if (sev === "critical") return "rgba(220,38,38,0.5)";
    if (sev === "high") return "rgba(239,68,68,0.35)";
    if (sev === "medium") return "rgba(245,158,11,0.3)";
    return `${accent}40`;
}

function sevCol(sev: HeatCell["severity"]) {
    return sev === "critical" ? "#dc2626" : sev === "high" ? "#ef4444" : sev === "medium" ? "#f59e0b" : "#3b82f6";
}

export function RiskHeatmap({ data, onJumpToAnalysis, theme = "consumer" }: { data?: VisualizationData; onJumpToAnalysis?: () => void; theme?: "consumer" | "pro" }) {
    const accentColor = theme === "pro" ? "#3b82f6" : "#c8ff00";

    const heatmapData = useMemo(() => {
        if (data?.sections) {
            const cells: HeatCell[] = [];
            data.sections.forEach(sec => {
                SEVERITIES.forEach(sev => {
                    const matched = sec.clauses.filter(cl => cl.risk === (sev === "critical" ? "high" : sev === "low" ? "low" : sev));
                    cells.push({ section: sec.label, severity: sev, count: matched.length, clauses: matched.map(cl => ({ name: cl.label, summary: cl.summary, ref: cl.ref })) });
                });
            });
            return { cells, sections: data.sections.map(s => s.label) };
        }
        return { cells: DEFAULT_HEATMAP, sections: SECTIONS };
    }, [data]);

    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [drawerCell, setDrawerCell] = useState<HeatCell | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerW, setContainerW] = useState(800);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const getCell = (s: string, sev: HeatCell["severity"]) => heatmapData.cells.find(c => c.section === s && c.severity === sev);

    const isMobile = containerW < 640;
    // Increased LW (Label Width) to ensure section labels (like "POLICY INFORMATION") aren't truncated
    const LW = isMobile ? 115 : 170;
    const LH = isMobile ? 32 : 48;
    const CW = isMobile ? 68 : 124;
    const CH = isMobile ? 56 : 80;
    
    const svgW = LW + SEVERITIES.length * CW;
    const svgH = LH + heatmapData.sections.length * CH;
    const scale = containerW < svgW ? containerW / svgW : 1;

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col overflow-hidden relative bg-[#080808]">
            <div className="flex-1 overflow-auto min-h-0">
                <div style={{ width: svgW * scale, height: svgH * scale, minWidth: "100%" }}>
                    <svg width={svgW} height={svgH} style={{ display: "block", transformOrigin: "top left", transform: scale < 1 ? `scale(${scale})` : undefined }}>
                        {SEVERITIES.map((sev, ci) => (
                            <g key={sev}>
                                <rect x={LW + ci * CW + 1} y={0} width={CW - 4} height={LH - 6} fill="rgba(255,255,255,0.03)" rx={6} />
                                <text x={LW + ci * CW + CW / 2} y={LH / 2 - 2} textAnchor="middle" dominantBaseline="middle"
                                    style={{ 
                                        fontSize: isMobile ? 7 : 9, 
                                        fontFamily: "monospace", 
                                        fontWeight: 800, 
                                        fill: sevCol(sev),
                                        letterSpacing: "0.1em"
                                    }}>
                                    {isMobile ? sev.slice(0, 3).toUpperCase() : sev.toUpperCase()}
                                </text>
                            </g>
                        ))}
                        {heatmapData.sections.map((sec, ri) => (
                            <g key={sec}>
                                <rect x={4} y={LH + ri * CH + 3} width={LW - 12} height={CH - 6} fill="rgba(255,255,255,0.03)" rx={6} />
                                <text x={LW - 18} y={LH + ri * CH + CH / 2} textAnchor="end" dominantBaseline="middle"
                                    style={{ 
                                        fontSize: isMobile ? 8 : 10, 
                                        fontFamily: "monospace", 
                                        fontWeight: 800, 
                                        fill: "#f4f4f5",
                                        letterSpacing: "0.02em"
                                    }}>
                                    {sec.toUpperCase().length > (isMobile ? 18 : 24) ? sec.toUpperCase().slice(0, isMobile ? 17 : 23) + "…" : sec.toUpperCase()}
                                </text>
                            </g>
                        ))}
                        {heatmapData.sections.map((sec, ri) => SEVERITIES.map((sev, ci) => {
                            const cell = getCell(sec, sev);
                            if (!cell) return null;
                            const x = LW + ci * CW, y = LH + ri * CH;
                            const key = `${sec}-${sev}`;
                            const isActive = drawerCell?.section === sec && drawerCell?.severity === sev;
                            const isDimmed = hoveredKey !== null && hoveredKey !== key && !isActive;
                            return (
                                <g key={key}
                                    onMouseEnter={() => setHoveredKey(key)}
                                    onMouseLeave={() => setHoveredKey(null)}
                                    onClick={() => cell.count > 0 && setDrawerCell(isActive ? null : cell)}
                                    style={{ cursor: cell.count > 0 ? "pointer" : "default", opacity: isDimmed ? 0.3 : 1, transition: "opacity 0.15s" }}>
                                    <rect x={x + 2} y={y + 2} width={CW - 6} height={CH - 6}
                                        fill={cellFill(sev, cell.count, accentColor)}
                                        stroke={isActive ? accentColor : cellStroke(sev, cell.count, accentColor)}
                                        strokeWidth={isActive ? 2 : 1} rx={10}
                                        filter={isActive ? `drop-shadow(0 0 12px ${accentColor}4d)` : undefined}
                                        style={{ transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                                    {isActive && (
                                        <rect x={x + 4} y={y + 4} width={CW - 10} height={CH - 10}
                                            fill="none" stroke={accentColor} strokeWidth={0.5} strokeDasharray="4,2" rx={8} opacity={0.5} />
                                    )}
                                    {cell.count > 0 ? (
                                        <>
                                            <text x={x + CW / 2} y={y + CH / 2 - (isMobile ? 5 : 7)} textAnchor="middle" dominantBaseline="middle"
                                                style={{ fontSize: isMobile ? 16 : 22, fontFamily: "monospace", fontWeight: 900, fill: sevCol(sev), opacity: 0.9 }}>{cell.count}</text>
                                            <text x={x + CW / 2} y={y + CH / 2 + (isMobile ? 9 : 14)} textAnchor="middle" dominantBaseline="middle"
                                                style={{ fontSize: isMobile ? 6 : 9, fontFamily: "monospace", fill: "#fff", fontWeight: 700 }}>
                                                {cell.count === 1 ? "1 clause" : `${cell.count} clauses`}
                                            </text>
                                        </>
                                    ) : (
                                        <text x={x + CW / 2} y={y + CH / 2} textAnchor="middle" dominantBaseline="middle"
                                            style={{ fontSize: isMobile ? 9 : 11, fontFamily: "monospace", fill: "rgba(255,255,255,0.15)", fontWeight: 700 }}>—</text>
                                    )}
                                </g>
                            );
                        }))}
                    </svg>
                </div>
            </div>

            {!drawerCell && (
                <div className="px-4 py-3 border-t border-white/[0.08] flex items-center gap-4 shrink-0 flex-wrap bg-[#0c0c0c]/80 backdrop-blur-md">
                    <span className="text-[9px] font-mono text-white font-black uppercase tracking-[0.15em] opacity-80">Risk Density</span>
                    <div className="flex items-center gap-1">
                        {["rgba(59,130,246,0.3)", "rgba(245,158,11,0.5)", "rgba(239,68,68,0.7)", "rgba(220,38,38,0.95)"].map((c, i) => (
                            <div key={i} className="w-8 h-2.5 rounded-sm" style={{ background: c }} />
                        ))}
                    </div>
                    <span className="text-[8px] font-mono text-white/90 font-bold">Low → Critical</span>
                    <span className="text-[8px] font-mono text-zinc-500 ml-auto italic hidden sm:block">Tap a cell to drill down</span>
                </div>
            )}

            <AnimatePresence>
                {drawerCell && (
                    <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute bottom-0 left-0 right-0 bg-[#0c0c0c] border-t border-white/[0.06] flex flex-col"
                        style={{ maxHeight: "60%" }}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08] shrink-0 flex-wrap gap-y-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: sevCol(drawerCell.severity), boxShadow: `0 0 10px ${sevCol(drawerCell.severity)}` }} />
                            <span className="text-[11px] font-mono font-bold text-white uppercase">{drawerCell.section} / {drawerCell.severity}</span>
                            <span className="text-[9px] font-mono text-zinc-300 bg-white/[0.05] border border-white/[0.1] px-2 py-0.5 rounded-full">{drawerCell.count} Clause{drawerCell.count !== 1 ? "s" : ""}</span>
                            <div className="ml-auto flex items-center gap-2">
                                {onJumpToAnalysis && <button onClick={onJumpToAnalysis} className="text-[9px] font-mono border px-2.5 py-1 rounded-lg" style={{ color: accentColor, borderColor: `${accentColor}33` }}>→ Analysis</button>}
                                <button onClick={() => setDrawerCell(null)} className="text-zinc-600 hover:text-zinc-300 p-1 rounded-lg hover:bg-white/[0.04]"><X size={14} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {drawerCell.clauses.length === 0 ? (
                                <p className="text-[11px] font-mono text-zinc-400 text-center py-10">No clauses in this category.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {drawerCell.clauses.map((c, i) => (
                                        <div key={i} className="border border-white/[0.05] rounded-xl p-3 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <span className="text-[11px] font-mono font-semibold text-zinc-200">{c.name}</span>
                                                <span className="text-[8px] font-mono text-zinc-300 border border-white/[0.2] px-1.5 py-0.5 rounded shrink-0">{c.ref}</span>
                                            </div>
                                            <p className="text-[10px] font-mono text-zinc-300 leading-relaxed">{c.summary}</p>
                                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.04]">
                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sevCol(drawerCell.severity) }} />
                                                <span className="text-[7px] font-mono text-zinc-400 uppercase tracking-widest">{drawerCell.severity} severity</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}