"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileText, Swords, Zap, Send, Loader2, X, MessageCircle,
  Sparkles, ChevronDown, Shield, AlertTriangle, Eye, Target,
  Network, GitBranch, Flame, MessageSquare, HelpCircle, Brain, ArrowLeft, type LucideIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PolicySummary from "@/components/consumer/policy-summary";
import FinePrintAlerts from "@/components/consumer/fine-print-alerts";
import CoverageGaps from "@/components/consumer/coverage-gaps";
import InsurerReputation from "@/components/consumer/insurer-reputation";
import ComparisonTable from "@/components/consumer/comparison-table";
import { AppHeader } from "@/components/AppHeader";
import {
  PolicyNetworkGraph,
  ClauseRelationshipMap,
  RiskHeatmap,
} from "@/components/policy-visualizations";

import ReactMarkdown from 'react-markdown';

type Tab = "analyze" | "compare" | "simulate";
type WorkspaceTab = "analysis" | "graph" | "clauses" | "heatmap";
type PanelId = "overview" | "gaps" | "fine" | "chat";
type GridMode = "default" | "focus" | "split";
type SplitDir = "v" | "h";

const PANEL_META: { id: PanelId; label: string; shortLabel: string; icon: IconType; badge?: (a: AnalysisResult) => string }[] = [
  { id: "overview", label: "Policy Overview", shortLabel: "Overview", icon: FileText as IconType, badge: (a) => `${a.summary.whatIsCovered.length} covered` },
  { id: "gaps", label: "Coverage Gaps", shortLabel: "Gaps", icon: AlertTriangle as IconType, badge: (a) => `${a.coverageGaps.length} gaps` },
  { id: "fine", label: "Fine Print", shortLabel: "Fine Print", icon: Eye as IconType, badge: (a) => `${a.finePrintAlerts.length} alerts` },
  { id: "chat", label: "Chat with Policy", shortLabel: "AI Chat", icon: MessageCircle as IconType },
];

interface UploadedPolicy {
  file: File; jobId: string | null;
  status: "uploading" | "processing" | "completed" | "error"; error?: string;
  tempId?: string;
}

interface AnalysisResult {
  summary: {
    policyOverview: { policyType: string; premium: string; coverageAmount: string; deductible: string; policyDuration: string; insurerName: string; policyNumber: string; startDate: string; expiryDate: string };
    insuredMembers?: Array<{ name: string; relationship: string; ped: string[]; riskScore: number }>;
    whatIsCovered: string[]; whatIsNotCovered: string[]; importantConditions: string[];
    questionsToAskAgent: string[]; renewalInfo: { expiryDate: string; daysUntilExpiry: number | null };
  };
  finePrintAlerts: { severity: "warning" | "critical"; clause: string; explanation: string; whyItMatters: string }[];
  coverageGaps: { gap: string; icon: string; whyItMatters: string; suggestedAddOn: string }[];
  insurerReputation: { name: string; sector: string; csr: number; complaints?: number; complaintZone?: "green" | "yellow" | "red"; solvency?: string; goldenCombo?: boolean } | null;
  visualizations?: any;
}

interface ChatMsg { role: "user" | "ai"; text: string }
interface SimResult { covered: string; estimatedPayout: string; outOfPocket: string; clauseReference: string; }

const scenarioTemplates = [
  { label: "🚗 Accident", text: "I was in a car accident. My car is totaled. What's covered?" },
  { label: "🏥 Surgery", text: "I need hospitalization for surgery. What expenses are covered?" },
  { label: "🌊 Flood", text: "My property was damaged in a flash flood. Am I covered?" },
  { label: "🔒 Theft", text: "My vehicle was stolen from a locked garage. What's the protocol?" },
];

/* ══════════ Collapsible (mobile) ══════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconType = React.FC<{ size?: number; className?: string;[k: string]: any }>
function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true, badge }: {
  title: string; icon: IconType; children: React.ReactNode; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/[0.04] rounded-xl bg-[#0d0d0d] overflow-hidden shadow-sm shadow-black/20">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon size={14} className="text-zinc-500" />
          <span className="text-[11px] font-mono font-bold text-zinc-300 tracking-[0.05em] uppercase">{title}</span>
          {badge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c8ff00]/10 text-[#c8ff00] font-bold border border-[#c8ff00]/20">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-zinc-600 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <div className="px-4 pb-5 border-t border-white/[0.03] bg-[#0d0d0d]/50">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════ Workstation Panel (enhanced) ══════════ */
function WsPanel({ panelId, title, icon: Icon, children, badge, className = "",
  contentClassName = "flex-1 overflow-y-auto p-4",
  onExpand, onSplit, splitPicking, isSplitOrigin, onCompleteSplit
}: {
  panelId: PanelId; title: string; icon: IconType; children: React.ReactNode;
  badge?: string; className?: string; contentClassName?: string;
  onExpand?: () => void; onSplit?: () => void;
  splitPicking: PanelId | null; isSplitOrigin?: boolean;
  onCompleteSplit?: () => void;
}) {
  const isSplitTarget = splitPicking !== null && !isSplitOrigin;
  return (
    <div className={`border border-white/[0.04] rounded-none flex flex-col overflow-hidden bg-[#0a0a0a] relative ${isSplitOrigin ? "ring-1 ring-[#c8ff00]/30" : ""} ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-[#0d0d0d] shrink-0">
        <Icon size={11} className="text-zinc-600" />
        <span className="text-[9px] font-mono font-bold text-zinc-500 tracking-widest uppercase">{title}</span>
        {badge && <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.03] text-zinc-600 font-bold border border-white/[0.04]">{badge}</span>}
        {isSplitOrigin && <span className="text-[8px] font-mono text-[#c8ff00]/60 ml-1 animate-pulse">Selecting…</span>}
        <div className="ml-auto flex items-center gap-1">
          {!splitPicking && onSplit && (
            <button onClick={onSplit} title="Split view"
              className="text-zinc-700 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-white/[0.04] group">
              <svg width={12} height={12} viewBox="0 0 14 14" fill="none" className="transition-colors">
                <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          )}
          {isSplitOrigin && onSplit && (
            <button onClick={onSplit} title="Cancel split"
              className="text-[#c8ff00]/50 hover:text-[#c8ff00] transition-colors p-1 text-[8px] font-mono">cancel</button>
          )}
          {onExpand && !splitPicking && (
            <button onClick={onExpand} title="Expand panel"
              className="text-zinc-700 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-white/[0.04]">
              <svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                <path d="M1 5V2a1 1 0 011-1h3M9 1h3a1 1 0 011 1v3M13 9v3a1 1 0 01-1 1H9M5 13H2a1 1 0 01-1-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Content */}
      <div className={contentClassName}>{children}</div>
      {/* Split-target overlay */}
      <AnimatePresence>
        {isSplitTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-[2px] bg-[#080808]/70 cursor-pointer"
            onClick={onCompleteSplit}>
            <div className="border border-[#c8ff00]/25 bg-[#c8ff00]/[0.04] rounded-2xl px-6 py-4 flex flex-col items-center gap-2 hover:border-[#c8ff00]/60 hover:bg-[#c8ff00]/[0.07] transition-all">
              <svg width={20} height={20} viewBox="0 0 14 14" fill="none" className="text-[#c8ff00]">
                <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="text-[10px] font-mono font-bold text-[#c8ff00] tracking-widest">SPLIT WITH {title.toUpperCase()}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════ Text Selection Popup ══════════ */
function TextSelectionPopup({ onAction }: { onAction: (action: string, text: string) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState("");

  useEffect(() => {
    const handler = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() || "";
      if (text.length > 10 && text.length < 600) {
        const range = s?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (rect) { setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 }); setSel(text); }
      } else { setPos(null); setSel(""); }
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  if (!pos || !sel) return null;
  const actions = [
    { label: "Explain", icon: Eye },
    { label: "Check Risk", icon: AlertTriangle },
    { label: "Simplify", icon: Brain },
    { label: "Ask Flow AI", icon: HelpCircle },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 5, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-auto"
      style={{ left: pos.x, top: pos.y }}>
      <div className="bg-[#111] border border-white/[0.08] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] px-1 py-1 flex gap-0.5">
        {actions.map(a => (
          <button key={a.label}
            onClick={() => { onAction(a.label, sel); setPos(null); setSel(""); window.getSelection()?.removeAllRanges(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-semibold text-zinc-500 hover:text-[#c8ff00] hover:bg-white/[0.04] transition-colors">
            <a.icon size={11} /> {a.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────── Typewriter Component ───────────────
const TypewriterEffect = ({ text, isLatest }: { text: string; isLatest: boolean }) => {
  const [displayedText, setDisplayedText] = useState(isLatest ? "" : text);

  useEffect(() => {
    if (!isLatest) {
      setTimeout(() => setDisplayedText(text), 0);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i += 4; // speed
      if (i > text.length + 4) {
        clearInterval(interval);
        setDisplayedText(text);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [text, isLatest]);

  return (
    <ReactMarkdown
      components={{
        p: ({ node, ...props }) => <p className="whitespace-pre-wrap mb-2 last:mb-0" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-bold text-zinc-100 dark:text-zinc-100" {...props} />,
        em: ({ node, ...props }) => <em className="italic text-zinc-300" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
        li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
        code: ({ node, inline, ...props }: any) =>
          inline
            ? <code className="bg-white/[0.08] rounded px-1 py-0.5 text-[#c8ff00] font-mono text-[10.5px]" {...props} />
            : <code className="block bg-[#080808] border border-white/[0.04] rounded p-2 my-2 font-mono text-[10.5px] overflow-x-auto" {...props} />
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
};

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function ConsumerPage() {
  const [tab, setTab] = useState<Tab>("analyze");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("analysis");
  const [gridMode, setGridMode] = useState<GridMode>("default");
  const [focusedPanel, setFocusedPanel] = useState<PanelId | null>(null);
  const [splitPanels, setSplitPanels] = useState<[PanelId, PanelId]>(["overview", "gaps"]);
  const [splitDir, setSplitDir] = useState<SplitDir>("v");
  const [splitPicking, setSplitPicking] = useState<PanelId | null>(null);
  const [policies, setPolicies] = useState<UploadedPolicy[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [comparison, setComparison] = useState<{ dimensions: string[]; policies: { insurerName: string; policyType: string; values: Record<string, string> }[]; aiJudgment: string; winner: string; winnerReason: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [simScenario, setSimScenario] = useState("");
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);

  const handleResetState = () => {
    setPolicies([]);
    setAnalysis(null);
    setComparison(null);
    setChatMessages([]);
    setChatInput("");
    setSimResult(null);
    setSimScenario("");
    setError("");
    setAnalysisStage(0);
  };

  const handleTabChange = (newTab: Tab) => {
    if (newTab === tab) return;
    setTab(newTab);
    handleResetState();
  };

  /* ── Upload ── */
  const uploadFile = useCallback(async (file: File) => {
    const tempId = Math.random().toString(36).slice(2, 9);
    setPolicies(prev => [...prev, { file, jobId: null, status: "uploading", tempId }]);

    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Upload failed"); }
      const { jobId } = await res.json();

      setPolicies(prev => prev.map(p => p.tempId === tempId ? { ...p, jobId, status: "processing" } : p));

      let done = false;
      for (let i = 0; i < 30 && !done; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const sr = await fetch(`/api/status/${jobId}`);
        const sj = await sr.json();
        if (sj.status === "COMPLETED") {
          setPolicies(prev => prev.map(p => p.tempId === tempId ? { ...p, status: "completed" } : p));
          done = true;
        } else if (sj.status === "ERROR") {
          throw new Error(sj.error || "Processing failed");
        }
      }
      if (!done) throw new Error("Processing timed out");
    } catch (e: unknown) {
      const err = e as Error;
      setPolicies(prev => prev.map(p => p.tempId === tempId ? { ...p, status: "error", error: err.message } : p));
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (tab === "compare") {
      files.slice(0, 4 - policies.length).forEach(f => uploadFile(f));
    } else if (files[0]) {
      uploadFile(files[0]);
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (tab === "compare") {
      files.slice(0, 4 - policies.length).forEach(f => uploadFile(f));
    } else if (files[0]) {
      uploadFile(files[0]);
    }
    e.target.value = "";
  };
  const removePolicy = (idx: number) => setPolicies(prev => prev.filter((_, i) => i !== idx));

  /* ── Analyze ── */
  const runAnalysis = async () => {
    const cp = policies.find(p => p.status === "completed" && p.jobId);
    if (!cp?.jobId) return;
    setAnalyzing(true); setError("");
    try {
      const res = await fetch("/api/consumer/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: cp.jobId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setAnalysis(await res.json());
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setAnalyzing(false); }
  };

  const runAnalysisWithStages = async () => {
    setAnalysisStage(1);
    setTimeout(() => setAnalysisStage(2), 1400);
    setTimeout(() => setAnalysisStage(3), 2800);
    setTimeout(() => setAnalysisStage(4), 4200);
    await runAnalysis();
    setAnalysisStage(0);
  };

  /* ── Compare ── */
  const runComparison = async () => {
    const ids = policies.filter(p => p.status === "completed" && p.jobId).map(p => p.jobId);
    if (ids.length < 2) { setError("Upload at least 2 policies"); return; }
    setComparing(true); setError("");
    try {
      const res = await fetch("/api/consumer/compare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: ids }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setComparison((await res.json()).comparison);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setComparing(false); }
  };

  /* ── Chat ── */
  const sendChat = async (message?: string, isCompareMode?: boolean) => {
    const msg = (message || chatInput).trim();
    if (!msg || chatLoading) return;

    setChatInput(""); setChatMessages(prev => [...prev, { role: "user", text: msg }]); setChatLoading(true);
    try {
      const historyToSend = chatMessages
        .filter(m => m.role === "user" || m.role === "ai")
        .slice(-10)
        .map(m => ({ role: m.role, text: m.text }));

      if (isCompareMode) {
        const jobIds = policies.filter(p => p.status === "completed" && p.jobId).map(p => p.jobId);
        if (jobIds.length < 2) return;
        const res = await fetch("/api/consumer/compare-chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds, message: msg, history: historyToSend }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const { reply } = await res.json();
        setChatMessages(prev => [...prev, { role: "ai", text: reply }]);
      } else {
        const cp = policies.find(p => p.status === "completed" && p.jobId);
        if (!cp?.jobId) return;
        const res = await fetch("/api/consumer/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: cp.jobId, message: msg, history: historyToSend }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const { reply } = await res.json();
        setChatMessages(prev => [...prev, { role: "ai", text: reply }]);
      }
    } catch (e: unknown) {
      setChatMessages(prev => [...prev, { role: "ai", text: `Error: ${(e as Error).message}` }]);
    } finally { setChatLoading(false); }
  };

  /* ── Simulate ── */
  const runSimulation = async (scenario: string) => {
    const cp = policies.find(p => p.status === "completed" && p.jobId);
    if (!cp?.jobId || !scenario.trim()) return;
    setSimLoading(true); setSimResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: cp.jobId, scenario }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setSimResult(await res.json());
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSimLoading(false); }
  };

  const handleTextAction = (action: string, text: string) => {
    const prompt = action === "Explain" ? `Explain this clause in plain English: "${text}"`
      : action === "Check Risk" ? `What are the risks in this clause: "${text}"`
        : action === "Simplify" ? `Simplify this policy text: "${text}"`
          : `Tell me about this: "${text}"`;
    if (analysis) { setWorkspaceTab("analysis"); sendChat(prompt); }
  };

  /* ── Grid mode helpers ── */
  const focusPanel = (id: PanelId) => {
    setWorkspaceTab("analysis");
    setGridMode("focus");
    setFocusedPanel(id);
    setSplitPicking(null);
  };
  const exitMode = () => { setGridMode("default"); setFocusedPanel(null); setSplitPicking(null); };
  const startSplit = (id: PanelId) => setSplitPicking(prev => prev === id ? null : id);
  const completeSplit = (id: PanelId) => {
    if (!splitPicking || splitPicking === id) return;
    setSplitPanels([splitPicking, id]);
    setGridMode("split");
    setSplitPicking(null);
  };

  const renderChat = (isCompareMode?: boolean) => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 mb-2 p-4">
        {chatMessages.length === 0 && <p className="text-[10px] font-mono text-zinc-700 text-center py-8">{isCompareMode ? "Ask anything about these quotes..." : "Ask anything about your policy..."}</p>}
        {chatMessages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} py-1`}>
            {m.role === "ai" ? (
              <div className="flex gap-2.5 max-w-[85%]">
                <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3 h-3 text-[#c8ff00]" />
                </div>
                <div className="bg-[#111111] border border-white/[0.06] rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="text-[11px] font-mono leading-relaxed text-zinc-300">
                    <TypewriterEffect text={m.text} isLatest={i === chatMessages.length - 1} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-[11px] font-mono leading-relaxed bg-[#c8ff00]/[0.06] text-zinc-200 border border-[#c8ff00]/10">
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            )}
          </div>
        ))}
        {chatLoading && <div className="flex justify-start"><div className="bg-white/[0.025] border border-white/[0.04] rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-600 flex items-center gap-1.5"><Loader2 size={10} className="animate-spin" /> Thinking...</div></div>}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 pt-0">
        <div className="flex gap-2 pt-2 border-t border-white/[0.04] shrink-0">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat(undefined, isCompareMode)}
            placeholder={isCompareMode ? "Ask about the quotes..." : "Ask about your policy..."} className="flex-1 bg-[#111] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#c8ff00]/20 transition-colors" />
          <button onClick={() => sendChat(undefined, isCompareMode)} disabled={chatLoading || !chatInput.trim()} className="px-2.5 py-1.5 bg-[#c8ff00] hover:bg-[#d4ff33] rounded-lg text-black disabled:opacity-40 transition-colors"><Send size={12} /></button>
        </div>
      </div>
    </div>
  );

  const renderPanelContent = (id: PanelId) => {
    if (!analysis) return null;
    switch (id) {
      case "overview": return <PolicySummary summary={analysis.summary} />;
      case "gaps": return <CoverageGaps gaps={analysis.coverageGaps} />;
      case "fine": return <FinePrintAlerts alerts={analysis.finePrintAlerts} />;
      case "chat": return renderChat();
    }
  };

  const hasCompleted = policies.some(p => p.status === "completed");
  const completedCount = policies.filter(p => p.status === "completed").length;
  const csr = analysis?.insurerReputation?.csr || 50;
  const insurerName = analysis?.summary?.policyOverview?.insurerName || analysis?.insurerReputation?.name || "Policy";
  const riskFlags = analysis?.finePrintAlerts.filter(a => a.severity === "critical").map(a => a.clause) || [];

  /* ════════════════════════════════════════════
     WORKSTATION TAB DEFINITIONS
  ════════════════════════════════════════════ */
  const wsTabs: { key: WorkspaceTab; icon: IconType; label: string }[] = [
    { key: "analysis", icon: MessageSquare, label: "Analysis" },
    { key: "graph", icon: Network, label: "Policy Graph" },
    { key: "clauses", icon: GitBranch, label: "Clause Map" },
    { key: "heatmap", icon: Flame, label: "Risk Heatmap" },
  ];

  return (
    <>
      {(!analysis && !(comparison && tab === "compare")) && <AppHeader />}
      <div className={`flex flex-col ${(!analysis && !(comparison && tab === "compare")) ? "h-[calc(100vh-56px)]" : "h-screen"} w-full bg-[#080808] overflow-hidden relative`}>

        {analysis && <TextSelectionPopup onAction={handleTextAction} />}

        {/* ═══════════════════════════════════════════
          PRE-ANALYSIS: UPLOAD CONSOLE
      ═══════════════════════════════════════════ */}
        {(!analysis && !(comparison && tab === "compare")) && (
          <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-6 overflow-y-auto">
            {/* Header label */}
            <div className="w-full max-w-[640px] mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-white/[0.02] border border-white/[0.05] text-[9px] font-mono font-bold text-zinc-600 tracking-[0.16em] uppercase mb-6">
                <span className="w-1 h-1 rounded-full bg-[#c8ff00]/40" /> CONSUMER INTELLIGENCE CONSOLE
              </div>
              <h1 className="text-[2rem] md:text-[2.6rem] font-semibold text-white tracking-[-0.03em] leading-[1.08] mb-3">
                Understand <span className="text-[#c8ff00]">Any Policy</span> Instantly
              </h1>
              <p className="text-zinc-600 text-[12px] font-mono">
                Upload your policy. Get plain-language breakdown, hidden risk detection, and AI chat.
              </p>
            </div>

            {/* Mode Tabs */}
            <div className="w-full max-w-[480px] mb-6">
              <div className="flex gap-0 bg-[#0d0d0d] border border-white/[0.05] rounded-xl p-1">
                {([
                  { key: "analyze" as Tab, icon: FileText, label: "Analyze" },
                  { key: "compare" as Tab, icon: Swords, label: "Compare" },
                  { key: "simulate" as Tab, icon: Zap, label: "Simulate" },
                ]).map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.key} onClick={() => handleTabChange(t.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-mono font-semibold tracking-wider transition-all duration-200
                      ${tab === t.key
                          ? "bg-white/[0.04] text-[#c8ff00] border border-white/[0.06]"
                          : "text-zinc-700 hover:text-zinc-400"}`}>
                      <Icon size={13} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full max-w-[560px] space-y-4">
              {/* Error */}
              {error && (
                <div className="p-3 rounded-xl border border-red-500/15 bg-red-500/[0.04] text-red-400 text-[11px] font-mono flex items-center gap-2">
                  <X size={13} /> {error}
                  <button onClick={() => setError("")} className="ml-auto hover:text-red-300"><X size={12} /></button>
                </div>
              )}

              {/* Upload Drop Zone */}
              <div className={`relative border rounded-xl p-8 text-center cursor-pointer transition-all duration-300
              ${dragOver ? "border-[#c8ff00]/30 bg-[#c8ff00]/[0.02] shadow-[0_0_30px_rgba(200,255,0,0.04)]" : "border-white/[0.05] hover:border-white/[0.09] bg-[#0d0d0d]"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} multiple={tab === "compare"} />
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border transition-all duration-300
                  ${dragOver ? "bg-[#c8ff00]/[0.08] border-[#c8ff00]/20" : "bg-white/[0.02] border-white/[0.05]"}`}>
                    <Upload size={18} className={dragOver ? "text-[#c8ff00]" : "text-zinc-700"} />
                  </div>
                  <p className="text-[13px] font-mono text-zinc-500 mb-1">
                    {tab === "compare" ? "Drop policies here to compare (2–4 PDFs)" : "Drop your insurance policy here"}
                  </p>
                  <p className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">PDF · Max 30MB</p>
                </div>
              </div>

              {/* File list */}
              {policies.length > 0 && (
                <div className="space-y-1.5">
                  {policies.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-[#0d0d0d] border border-white/[0.04] rounded-lg">
                      <FileText size={13} className="text-zinc-700 shrink-0" />
                      <span className="text-[11px] font-mono text-zinc-400 flex-1 truncate">{p.file.name}</span>
                      <span className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded border tracking-widest uppercase flex items-center gap-1
                      ${p.status === "completed" ? "bg-emerald-500/[0.06] text-emerald-500 border-emerald-500/15"
                          : p.status === "error" ? "bg-red-500/[0.06] text-red-400 border-red-500/15"
                            : "bg-amber-500/[0.06] text-amber-400 border-amber-500/15"}`}>
                        {(p.status === "uploading" || p.status === "processing") && <Loader2 size={9} className="animate-spin" />}
                        {p.status === "completed" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
                        {p.status === "uploading" && "Uploading"}{p.status === "processing" && "Processing"}
                        {p.status === "completed" && "Ready"}{p.status === "error" && (p.error || "Error")}
                      </span>
                      <button onClick={() => removePolicy(i)} className="text-zinc-700 hover:text-zinc-400 transition-colors"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Analyze CTA */}
              {tab === "analyze" && hasCompleted && !analysis && (
                <div className="space-y-3">
                  <button onClick={runAnalysisWithStages} disabled={analyzing}
                    className="relative w-full py-2.5 rounded-xl bg-[#c8ff00] hover:bg-[#d4ff33] text-black font-mono font-bold text-[13px] tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(200,255,0,0.15)]">
                    {analyzing ? <><Loader2 size={15} className="animate-spin" /> Analyzing...</> : <><Sparkles size={15} /> Analyze Policy</>}
                  </button>
                  {analyzing && analysisStage > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="p-4 rounded-xl border border-white/[0.04] bg-[#0d0d0d] space-y-2.5">
                      {[
                        { s: 1, label: "Reading document structure..." },
                        { s: 2, label: "Extracting policy clauses..." },
                        { s: 3, label: "Detecting risk patterns..." },
                        { s: 4, label: "Generating intelligence report..." },
                      ].map(st => (
                        <div key={st.s} className="flex items-center gap-2.5">
                          {analysisStage > st.s
                            ? <div className="w-3 h-3 rounded-full bg-[#c8ff00]/20 border border-[#c8ff00]/30 flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-[#c8ff00]" /></div>
                            : analysisStage === st.s
                              ? <Loader2 size={12} className="animate-spin text-[#c8ff00]" />
                              : <div className="w-3 h-3 rounded-full border border-white/[0.08]" />}
                          <span className={`text-[11px] font-mono ${analysisStage >= st.s ? "text-zinc-300" : "text-zinc-700"}`}>{st.label}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              )}

              {tab === "compare" && (
                <div>
                  {completedCount >= 2 && !comparison && (
                    <button onClick={runComparison} disabled={comparing}
                      className="w-full py-2.5 rounded-xl bg-[#c8ff00] hover:bg-[#d4ff33] text-black font-mono font-bold text-[12px] tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {comparing ? <><Loader2 size={14} className="animate-spin" /> Comparing...</> : <><Swords size={14} /> Compare {completedCount} Quotes</>}
                    </button>
                  )}
                  {completedCount < 2 && <p className="text-center text-zinc-700 text-[11px] font-mono py-3">Upload at least 2 quotes to compare.</p>}
                </div>
              )}

              {tab === "simulate" && (
                <div className="space-y-3">
                  {!hasCompleted ? <p className="text-center text-zinc-700 text-[11px] font-mono py-3">Upload a policy first.</p> : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {scenarioTemplates.map((s, i) => (
                          <button key={i} onClick={() => { setSimScenario(s.text); runSimulation(s.text); }}
                            className="border border-white/[0.05] bg-[#0d0d0d] hover:bg-white/[0.02] rounded-lg p-2.5 text-left transition-colors">
                            <span className="text-[11px] font-mono text-zinc-500">{s.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={simScenario} onChange={e => setSimScenario(e.target.value)}
                          placeholder="Describe a scenario..." className="flex-1 bg-[#0d0d0d] border border-white/[0.05] rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#c8ff00]/20" />
                        <button onClick={() => runSimulation(simScenario)} disabled={simLoading || !simScenario.trim()}
                          className="px-4 py-2 bg-[#c8ff00] hover:bg-[#d4ff33] rounded-lg text-black text-[11px] font-mono font-bold disabled:opacity-40 transition-colors flex items-center gap-1">
                          {simLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Run
                        </button>
                      </div>
                      {simResult && (
                        <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                          className="border border-white/[0.08] rounded-2xl p-5 bg-zinc-900/40 backdrop-blur-md space-y-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                          {/* Animated border gradient */}
                          <div className="absolute inset-0 bg-gradient-to-br from-[#c8ff00]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 relative z-10">
                            <div className="flex items-center gap-2">
                              <Zap size={12} className="text-[#c8ff00] animate-pulse" />
                              <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-[0.2em]">Simulation Verdict</span>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[9px] font-mono font-black tracking-widest uppercase border ${simResult.covered === "Yes" ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : simResult.covered === "No" ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              {simResult.covered === "Yes" ? "Covered" : simResult.covered === "No" ? "Not Covered" : "Partial"}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                            <div className="space-y-1.5">
                              <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block opacity-70">Core Determination</span>
                              <p className={`text-[13px] font-mono leading-relaxed ${simResult.covered === "Yes" ? "text-emerald-400" : simResult.covered === "No" ? "text-red-400" : "text-amber-400"} font-bold`}>
                                {simResult.covered}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white/[0.02] rounded-lg p-2 border border-white/[0.03]">
                                <span className="text-[7px] font-mono text-zinc-600 uppercase tracking-widest block mb-0.5">Est. Payout</span>
                                <p className="text-[12px] font-mono font-black text-zinc-100">{simResult.estimatedPayout}</p>
                              </div>
                              <div className="bg-white/[0.02] rounded-lg p-2 border border-white/[0.03]">
                                <span className="text-[7px] font-mono text-zinc-600 uppercase tracking-widest block mb-0.5">Your Cost</span>
                                <p className="text-[12px] font-mono font-black text-zinc-100">{simResult.outOfPocket}</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#050505]/60 border border-white/[0.05] rounded-xl p-3.5 mt-2 relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-60">
                              <Brain size={10} className="text-zinc-400" />
                              <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Clause Intelligence</span>
                            </div>
                            <p className="text-[11px] font-mono text-zinc-400 leading-relaxed italic border-l border-white/[0.1] pl-3 py-0.5">
                              &ldquo;{simResult.clauseReference}&rdquo;
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
          QUOTE COMPARISON WORKSTATION
      ═══════════════════════════════════════════════════════════ */}
        {comparison && !analysis && tab === "compare" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* ═══════════ COMMAND BAR (UNIFIED) ═══════════ */}
            <div className="h-12 w-full bg-[#080808] border-b border-white/[0.04] px-4 flex items-center justify-between shrink-0 z-50">
              <div className="flex items-center h-full gap-4">
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="Flow AI Logo" className="w-5 h-5 object-contain" />
                  <div className="flex flex-col">
                    <span className="font-extrabold text-zinc-100 tracking-tighter text-[13px] leading-tight flex items-center gap-1.5 whitespace-nowrap">
                      FLOW AI <span className="text-zinc-500 font-medium text-[11px] uppercase tracking-widest hidden xl:inline-block">| Policy Intelligence Engine</span>
                    </span>
                  </div>
                </div>
                <div className="h-4 w-px bg-white/[0.06] hidden md:block" />
                <div className="flex items-center gap-2 overflow-hidden truncate">
                  <span className="text-[11px] font-mono font-semibold text-[#c8ff00] truncate max-w-[150px]">
                    Quote Battle Mode
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 h-full">
                <button onClick={() => { handleResetState(); setTab("compare"); }} className="text-zinc-400 hover:text-zinc-100 px-3 py-1 flex items-center gap-1 opacity-70 hover:opacity-100 text-[11px] font-mono uppercase tracking-widest transition-all">
                  <ArrowLeft size={14} /> Back
                </button>
              </div>
            </div>

            {/* WORKSPACE AREA */}
            <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-48px)] bg-[#0A0A0A] overflow-hidden">
              <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                  <ComparisonTable comparison={comparison} />
                </div>
              </div>
              <div className="w-full lg:w-[420px] bg-[#0E1116] border-t lg:border-t-0 lg:border-l border-white/[0.04] flex flex-col shrink-0 h-[400px] lg:h-full">
                <div className="p-3 border-b border-white/[0.04] bg-[#0E1116] z-10 sticky top-0 shrink-0">
                  <h4 className="text-[10px] font-mono text-[#c8ff00] uppercase tracking-widest pl-1">Quote Comparison AI </h4>
                </div>
                <div className="flex-1 overflow-hidden">
                  {renderChat(true)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
          POST-ANALYSIS: INTELLIGENCE WORKSTATION
      ═══════════════════════════════════════════════════════════ */}
        {analysis && (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* ═══════════ COMMAND BAR (UNIFIED) ═══════════ */}
            <div className="h-12 w-full bg-[#080808] border-b border-white/[0.04] px-4 flex items-center justify-between shrink-0 z-50">
              {/* Left section: Logo & Context & Tabs */}
              <div className="flex items-center h-full gap-4">
                {/* Logo */}
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="Flow AI Logo" className="w-5 h-5 object-contain" />
                  <div className="flex flex-col">
                    <span className="font-extrabold text-zinc-100 tracking-tighter text-[13px] leading-tight flex items-center gap-1.5 whitespace-nowrap">
                      FLOW AI <span className="text-zinc-500 font-medium text-[11px] uppercase tracking-widest hidden xl:inline-block">| Policy Intelligence Engine</span>
                    </span>
                  </div>
                </div>

                {/* Policy Context */}
                <div className="h-4 w-px bg-white/[0.06] hidden md:block" />
                <div className="flex items-center gap-2 overflow-hidden truncate hidden sm:flex">
                  {insurerName && (
                    <>
                      <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[120px] hidden xl:inline-block">{insurerName}</span>
                      <div className="h-3 w-px bg-white/[0.06] hidden xl:block" />
                    </>
                  )}
                  <span className="text-[11px] font-mono font-semibold text-[#c8ff00] truncate max-w-[120px]">
                    <span className="text-zinc-500 font-normal hidden md:inline-block xl:hidden">Policy: </span>{policies.find(p => p.status === "completed")?.file.name || "Policy.pdf"}
                  </span>
                </div>
                <div className="h-4 w-px bg-white/[0.06] ml-2 hidden lg:block" />

                {/* Workspace Tabs */}
                <div className="flex items-center gap-1 h-full hidden md:flex ml-2">
                  {wsTabs.map(t => (
                    <button key={t.key} onClick={() => setWorkspaceTab(t.key)}
                      className={`px-3 h-full flex flex-col justify-end pb-[10px] text-[10px] font-mono font-bold tracking-widest transition-all duration-200 border-b-2 
                    ${workspaceTab === t.key
                          ? "border-[#c8ff00] text-[#c8ff00]"
                          : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-white/10"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right section */}
              <div className="flex items-center gap-2 sm:gap-4 shrink-0 h-full">
                <a href="/pro/workspace" className="text-[10px] font-mono font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest hidden sm:block">
                  Pro View
                </a>

                <div className="h-4 w-px bg-white/[0.06]" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500 hidden xs:inline-block">CSR</span>
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${csr >= 80 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                    {csr}%
                  </span>
                </div>

                <button
                  onClick={() => { setAnalysis(null); setPolicies([]); setChatMessages([]); setComparison(null); setSimResult(null); setWorkspaceTab("analysis"); }}
                  className="h-7 px-2 sm:px-3 flex items-center justify-center bg-[#c8ff00] hover:bg-[#d4ff33] text-black text-[10px] font-mono font-bold uppercase tracking-widest transition-colors ml-1 sm:ml-2 rounded-sm"
                >
                  <span className="hidden xs:inline">{tab === "compare" ? "NEW COMPARE" : "NEW ANALYSIS"}</span>
                  <span className="xs:hidden">NEW</span>
                </button>
              </div>
            </div>

            {/* ── Desktop Workstation ── */}
            <div className="hidden lg:flex flex-1 overflow-hidden">

              {/* ─── LEFT INTELLIGENCE SIDEBAR (220px) ─── */}
              <div className="w-[220px] shrink-0 border-r border-white/[0.04] bg-[#0a0a0a] flex flex-col overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.04]">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-widest uppercase">Policy Intelligence</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {/* Nav items proxy for sidebar sections */}
                  {[
                    { icon: Shield, label: "Insurer Profile", key: "insurer", panelId: null as PanelId | null },
                    { icon: FileText, label: "Policy Overview", key: "overview", panelId: "overview" as PanelId | null },
                    { icon: AlertTriangle, label: "Coverage Gaps", key: "gaps", panelId: "gaps" as PanelId | null, badge: analysis.coverageGaps.length },
                    { icon: Eye, label: "Fine Print", key: "fine", panelId: "fine" as PanelId | null, badge: analysis.finePrintAlerts.length },
                    { icon: MessageCircle, label: "AI Chat", key: "chat", panelId: "chat" as PanelId | null },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <button key={item.key}
                        onClick={() => item.panelId ? focusPanel(item.panelId) : setWorkspaceTab("analysis")}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors group
                        ${gridMode === "focus" && focusedPanel === item.panelId
                            ? "bg-[#c8ff00]/[0.04] border border-[#c8ff00]/15 text-[#c8ff00]"
                            : "hover:bg-white/[0.03]"}`}>
                        <div className="flex items-center gap-2">
                          <Icon size={12} className="text-zinc-400 group-hover:text-white transition-colors" />
                          <span className="text-[11px] font-mono text-zinc-300 group-hover:text-white transition-colors">{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="text-[10px] font-mono text-zinc-300 bg-white/[0.04] border border-white/[0.05] px-1.5 py-0.5 rounded">{item.badge}</span>
                        )}
                      </button>
                    );
                  })}

                  <div className="pt-3 border-t border-white/[0.04] mt-3 space-y-1">
                    <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest px-2 mb-2">Visualizations</p>
                    {[
                      { icon: Network, label: "Policy Graph", key: "graph" as WorkspaceTab },
                      { icon: GitBranch, label: "Clause Map", key: "clauses" as WorkspaceTab },
                      { icon: Flame, label: "Risk Heatmap", key: "heatmap" as WorkspaceTab },
                    ].map(item => {
                      const Icon = item.icon;
                      return (
                        <button key={item.key}
                          onClick={() => setWorkspaceTab(item.key)}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all
                          ${workspaceTab === item.key
                              ? "bg-[#c8ff00]/[0.04] border border-[#c8ff00]/15 text-[#c8ff00]"
                              : "hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200"}`}>
                          <Icon size={12} className={workspaceTab === item.key ? "text-[#c8ff00]" : "text-zinc-400"} />
                          <span className="text-[11px] font-mono">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Risk summary widget */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04]">
                    <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest px-1 mb-2">Risk Indicators</p>
                    <div className="space-y-2 px-1">
                      {[
                        { label: "Coverage Gaps", val: analysis.coverageGaps.length, max: 8, color: "bg-amber-500" },
                        { label: "Alerts", val: analysis.finePrintAlerts.length, max: 10, color: "bg-red-500" },
                        { label: "CSR Score", val: csr, max: 100, color: "bg-[#c8ff00]" },
                      ].map(r => (
                        <div key={r.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono text-zinc-400">{r.label}</span>
                            <span className="text-[10px] font-mono text-zinc-300">{r.val}</span>
                          </div>
                          <div className="h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div className={`h-full rounded-full ${r.color}`}
                              initial={{ width: 0 }} animate={{ width: `${Math.min(r.val / r.max, 1) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── CENTER WORKSPACE ─── */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">



                {/* ─ Analysis Tab: Grid Mode System ─ */}
                {workspaceTab === "analysis" && analysis && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Mode Bar (shown in focus/split) */}
                    <AnimatePresence>
                      {gridMode !== "default" && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="border-b border-white/[0.04] bg-[#0d0d0d] px-3 py-1.5 flex items-center gap-2 flex-wrap shrink-0">
                          {/* Frozen panel chips */}
                          {gridMode === "focus" && PANEL_META.filter(p => p.id !== focusedPanel).map(pm => {
                            const Ic = pm.icon;
                            return (
                              <button key={pm.id} onClick={() => focusPanel(pm.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/[0.04] bg-white/[0.01] text-[8px] font-mono text-zinc-700 hover:text-zinc-400 hover:border-white/[0.08] transition-all cursor-pointer">
                                <Ic size={9} className="opacity-60" />{pm.shortLabel}
                                <span className="text-[7px] border border-zinc-800 rounded px-1 text-zinc-800 ml-1">FROZEN</span>
                              </button>
                            );
                          })}
                          {/* Split mode controls */}
                          {gridMode === "split" && (
                            <>
                              <span className="text-[9px] font-mono text-zinc-600">SPLIT —</span>
                              <span className="text-[9px] font-mono text-zinc-400">{PANEL_META.find(p => p.id === splitPanels[0])?.shortLabel}</span>
                              <span className="text-[9px] font-mono text-zinc-700">+</span>
                              <span className="text-[9px] font-mono text-zinc-400">{PANEL_META.find(p => p.id === splitPanels[1])?.shortLabel}</span>
                              <div className="flex items-center gap-0.5 bg-white/[0.02] border border-white/[0.04] rounded-lg p-0.5 ml-1">
                                <button onClick={() => setSplitDir("v")} className={`px-2 py-0.5 rounded text-[8px] font-mono transition-all ${splitDir === "v" ? "bg-white/[0.06] text-[#c8ff00]" : "text-zinc-700 hover:text-zinc-400"}`}>⬛ Side</button>
                                <button onClick={() => setSplitDir("h")} className={`px-2 py-0.5 rounded text-[8px] font-mono transition-all ${splitDir === "h" ? "bg-white/[0.06] text-[#c8ff00]" : "text-zinc-700 hover:text-zinc-400"}`}>⬜ Stack</button>
                              </div>
                            </>
                          )}
                          <button onClick={exitMode}
                            className="ml-auto flex items-center gap-1 text-[9px] font-mono text-red-500 border border-red-500/20 px-2.5 py-1 rounded-lg hover:bg-red-500/[0.04] transition-all">
                            <X size={10} /> EXIT {gridMode === "focus" ? "FOCUS" : "SPLIT"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Default: 2×2 Grid */}
                    {gridMode === "default" && (
                      <div className="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden" style={{ gap: "1px", background: "rgba(255,255,255,0.03)" }}>
                        {PANEL_META.map(pm => (
                          <WsPanel key={pm.id} panelId={pm.id} title={pm.label} icon={pm.icon}
                            badge={pm.badge ? pm.badge(analysis) : undefined}
                            contentClassName={pm.id === "chat" ? "flex-1 flex flex-col p-4 overflow-hidden" : "flex-1 overflow-y-auto p-4"}
                            splitPicking={splitPicking} isSplitOrigin={splitPicking === pm.id}
                            onExpand={() => focusPanel(pm.id)}
                            onSplit={() => startSplit(pm.id)}
                            onCompleteSplit={() => completeSplit(pm.id)}>
                            {renderPanelContent(pm.id)}
                          </WsPanel>
                        ))}
                      </div>
                    )}

                    {/* Focus: single panel full */}
                    {gridMode === "focus" && focusedPanel && (
                      <div className="flex-1 overflow-hidden bg-[#0a0a0a]">
                        <WsPanel panelId={focusedPanel} className="h-full"
                          title={PANEL_META.find(p => p.id === focusedPanel)!.label}
                          icon={PANEL_META.find(p => p.id === focusedPanel)!.icon}
                          badge={PANEL_META.find(p => p.id === focusedPanel)?.badge?.(analysis)}
                          contentClassName={focusedPanel === "chat" ? "flex-1 flex flex-col p-4 overflow-hidden" : "flex-1 overflow-y-auto p-4"}
                          splitPicking={null}
                          onExpand={exitMode}
                          onSplit={() => startSplit(focusedPanel)}>
                          {renderPanelContent(focusedPanel)}
                        </WsPanel>
                      </div>
                    )}

                    {/* Split: 2 panels */}
                    {gridMode === "split" && splitPanels && (
                      <div className={`flex-1 overflow-hidden ${splitDir === "v" ? "flex flex-row" : "flex flex-col"}`}
                        style={{ gap: "1px", background: "rgba(255,255,255,0.03)" }}>
                        {splitPanels.map(pid => {
                          const pm = PANEL_META.find(p => p.id === pid)!;
                          return (
                            <div key={pid} className="flex-1 overflow-hidden flex flex-col">
                              <WsPanel panelId={pid} title={pm.label} icon={pm.icon} className="h-full"
                                badge={pm.badge?.(analysis)}
                                contentClassName={pid === "chat" ? "flex-1 flex flex-col p-4 overflow-hidden" : "flex-1 overflow-y-auto p-4"}
                                splitPicking={null} onExpand={() => { setFocusedPanel(pid); setGridMode("focus"); }} onSplit={exitMode}>
                                {renderPanelContent(pid)}
                              </WsPanel>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ─ Policy Network Graph ─ */}
                {workspaceTab === "graph" && (
                  <div className="flex-1 overflow-hidden bg-[#080808]">
                    <PolicyNetworkGraph riskScore={csr} flags={riskFlags} data={analysis?.visualizations} />
                  </div>
                )}

                {/* ─ Clause Relationship Map ─ */}
                {workspaceTab === "clauses" && (
                  <div className="flex-1 overflow-hidden bg-[#080808]">
                    <ClauseRelationshipMap data={analysis?.visualizations} />
                  </div>
                )}

                {/* ─ Risk Heatmap ─ */}
                {workspaceTab === "heatmap" && (
                  <div className="flex-1 overflow-hidden bg-[#080808]">
                    <RiskHeatmap onJumpToAnalysis={() => setWorkspaceTab("analysis")} data={analysis?.visualizations} />
                  </div>
                )}
              </div>

              {/* ─── RIGHT RISK PANEL (300px) ─── */}
              <div className="w-[280px] shrink-0 border-l border-white/[0.04] bg-[#0a0a0a] flex flex-col overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2">
                  <Shield size={12} className="text-zinc-400" />
                  <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-widest uppercase">Insurer Profile</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <InsurerReputation insurer={analysis.insurerReputation} />

                  {/* Risk score display */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Risk Score</span>
                      <span className={`text-[18px] font-mono font-bold ${csr >= 70 ? "text-emerald-400" : csr >= 40 ? "text-amber-400" : "text-red-400"}`}>{csr}%</span>
                    </div>
                    <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${csr >= 70 ? "bg-emerald-500" : csr >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        initial={{ width: 0 }} animate={{ width: `${csr}%` }} transition={{ duration: 1, delay: 0.3 }} />
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400 mt-1.5">
                      {csr >= 70 ? "Strong claim settlement record" : csr >= 40 ? "Average claim settlement" : "Below average — review carefully"}
                    </p>
                  </div>

                  {/* Gap summary */}
                  {analysis.coverageGaps.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/[0.04]">
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Top Gaps</span>
                      <div className="mt-2 space-y-1.5">
                        {analysis.coverageGaps.slice(0, 4).map((g, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/[0.03] border border-amber-500/[0.08]">
                            <span className="text-sm shrink-0">{g.icon || "⚠️"}</span>
                            <p className="text-[10px] font-mono text-zinc-300 leading-snug">{g.gap}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Mobile: Stacked Accordion ── */}
            <div className="lg:hidden flex-1 overflow-y-auto p-4 pb-24 space-y-4 bg-[#080808]">
              {workspaceTab === "analysis" && (
                <>
                  <div className="mb-2 space-y-4">
                    <div className="px-4 pt-4 sm:pt-6">
                      <div className="flex flex-col mb-4">
                        <span className="text-[10px] font-mono font-black text-[#c8ff00] tracking-[0.2em] mb-1">INTELLIGENCE WORKSTATION</span>
                        <h2 className="text-xl sm:text-2xl font-mono font-bold text-zinc-100 flex items-center gap-3">
                          Policy Report
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </h2>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <div className="bg-[#0d0d0d] border border-white/[0.04] rounded-xl p-3.5 shadow-inner">
                          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Safety Score</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-2xl font-mono font-bold ${csr >= 70 ? "text-emerald-400" : csr >= 40 ? "text-amber-400" : "text-red-400"}`}>{csr}%</span>
                          </div>
                          <div className="mt-2 w-full h-1 bg-white/[0.03] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${csr >= 70 ? "bg-emerald-500" : csr >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${csr}%` }} />
                          </div>
                        </div>
                        <div className="bg-[#0d0d0d] border border-white/[0.04] rounded-xl p-3.5 shadow-inner">
                          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Fine Print</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-mono font-bold text-zinc-200">{analysis.finePrintAlerts.length}</span>
                            <span className="text-[8px] font-mono text-zinc-600 uppercase">Alerts</span>
                          </div>
                          <div className="mt-2 flex gap-1">
                            {analysis.finePrintAlerts.slice(0, 5).map((_, i) => (
                              <div key={i} className="flex-1 h-1 bg-amber-500/20 rounded-full" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <CollapsibleSection title="Insurer Profile" icon={Shield} defaultOpen={true}>
                    <InsurerReputation insurer={analysis.insurerReputation} />
                  </CollapsibleSection>
                  <CollapsibleSection title="Coverage Gaps" icon={AlertTriangle} badge={`${analysis.coverageGaps.length}`}>
                    <CoverageGaps gaps={analysis.coverageGaps} />
                  </CollapsibleSection>
                  <CollapsibleSection title="Policy Overview" icon={FileText}>
                    <PolicySummary summary={analysis.summary} />
                  </CollapsibleSection>
                  <CollapsibleSection title="Fine Print Detector" icon={Eye} badge={`${analysis.finePrintAlerts.length}`} defaultOpen={false}>
                    <FinePrintAlerts alerts={analysis.finePrintAlerts} />
                  </CollapsibleSection>
                  <CollapsibleSection title="Chat with Policy" icon={MessageCircle} defaultOpen={false}>
                    <div className="space-y-3 max-h-64 overflow-y-auto mb-3 p-1">
                      {chatMessages.length === 0 && <p className="text-[10px] font-mono text-zinc-700 text-center py-6 border border-dashed border-white/[0.05] rounded-lg mt-2">Ask anything about this policy...</p>}
                      {chatMessages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                          {m.role === "ai" ? (
                            <div className="flex gap-2.5 max-w-[92%]">
                              <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                                <Sparkles className="w-3 h-3 text-[#c8ff00]" />
                              </div>
                              <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                                <div className="text-[11px] font-mono text-zinc-300 leading-relaxed">
                                  <TypewriterEffect text={m.text} isLatest={i === chatMessages.length - 1} />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[11px] font-mono bg-[#c8ff00]/[0.1] text-zinc-100 border border-[#c8ff00]/20 shadow-sm shadow-[#c8ff00]/5">
                              <p className="whitespace-pre-wrap">{m.text}</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {chatLoading && <div className="flex justify-start"><div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-500 flex items-center gap-1.5"><Loader2 size={10} className="animate-spin" /> Analyzing query...</div></div>}
                    </div>
                    <div className="flex gap-2">
                      <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && sendChat()}
                        placeholder="Ask anything..."
                        className="flex-1 bg-[#080808] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#c8ff00]/30 transition-all" />
                      <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                        className="w-10 h-10 flex items-center justify-center bg-[#c8ff00] hover:bg-[#d4ff33] rounded-xl text-black disabled:opacity-40 transition-all shadow-lg shadow-[#c8ff00]/10"><Send size={14} /></button>
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {workspaceTab === "graph" && (
                <div className="h-[calc(100vh-160px)] rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0d0d0d]">
                  <PolicyNetworkGraph riskScore={csr} flags={riskFlags} data={analysis?.visualizations} />
                </div>
              )}
              {workspaceTab === "clauses" && (
                <div className="h-[calc(100vh-160px)] rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0d0d0d]">
                  <ClauseRelationshipMap data={analysis?.visualizations} />
                </div>
              )}
              {workspaceTab === "heatmap" && (
                <div className="h-[calc(100vh-160px)] rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0d0d0d]">
                  <RiskHeatmap onJumpToAnalysis={() => setWorkspaceTab("analysis")} data={analysis?.visualizations} />
                </div>
              )}
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[400px] z-[100]">
              <div className="bg-[#0d0d0d]/90 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-1.5 shadow-2xl shadow-black/60 flex items-center justify-between gap-1">
                {wsTabs.map(t => {
                  const Icon = t.icon;
                  const isActive = workspaceTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setWorkspaceTab(t.key)}
                      className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-300 relative group
                      ${isActive ? "bg-[#c8ff00]/[0.08] text-[#c8ff00]" : "text-zinc-500 hover:text-zinc-300"}`}>
                      <Icon size={16} className={isActive ? "text-[#c8ff00]" : "text-zinc-500 group-hover:text-zinc-400"} />
                      <span className="text-[8px] font-mono font-bold tracking-[0.1em] uppercase">{t.label.split(' ')[0]}</span>
                      {isActive && (
                        <motion.div layoutId="mobileTabActive" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-[#c8ff00] rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
