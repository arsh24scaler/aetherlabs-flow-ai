"use client";
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
    Send, Loader2, X, Sparkles, Info, ChevronDown, RotateCcw,
    ArrowDown, Paperclip, Shield, Activity, Home, Car, Heart,
    Clock, Scale, AlertTriangle, CheckCircle, Minus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

/* ═══════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════ */

interface AdvisorMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

interface DimensionScores {
    mortality: number | null;
    income_disruption: number | null;
    asset_loss: number | null;
    liability: number | null;
    health: number | null;
    longevity: number | null;
}

interface INSEntry {
    score: number;
    tier: string;
    gap: string;
}

interface CoverageRec {
    method?: string;
    min?: number;
    recommended?: number;
    term_years?: number;
    monthly_benefit?: number;
    elimination_days?: number;
    benefit_period?: string;
    dwelling?: number;
    liability?: number;
}

interface ScoreData {
    inputs_collected: Record<string, unknown>;
    dimension_scores: DimensionScores;
    CRI: number | null;
    CRI_tier: string;
    GSI: number | null;
    GSI_tier: string;
    INS: Record<string, INSEntry>;
    coverage_recommendations: Record<string, CoverageRec>;
    data_completeness: string;
    missing_inputs: string[];
    phase: "intake" | "scoring" | "report" | "followup";
}

const EMPTY_SCORES: ScoreData = {
    inputs_collected: {},
    dimension_scores: { mortality: null, income_disruption: null, asset_loss: null, liability: null, health: null, longevity: null },
    CRI: null,
    CRI_tier: "",
    GSI: null,
    GSI_tier: "",
    INS: {},
    coverage_recommendations: {},
    data_completeness: "INSUFFICIENT",
    missing_inputs: [],
    phase: "intake",
};

const SESSION_KEY = "aria_advisor_session";

/* ═══════════════════════════════════════════════════
   HELPER COMPONENTS
═══════════════════════════════════════════════════ */

const DIMENSION_META: { key: keyof DimensionScores; label: string; icon: React.ElementType }[] = [
    { key: "mortality", label: "Mortality", icon: Shield },
    { key: "income_disruption", label: "Income Disruption", icon: Activity },
    { key: "asset_loss", label: "Asset Loss", icon: Home },
    { key: "liability", label: "Liability", icon: Scale },
    { key: "health", label: "Health & Medical", icon: Heart },
    { key: "longevity", label: "Longevity & LTC", icon: Clock },
];

const INS_TYPE_META: { key: string; label: string }[] = [
    { key: "life", label: "Life" },
    { key: "disability", label: "Disability" },
    { key: "health", label: "Health" },
    { key: "homeowners", label: "Home" },
    { key: "auto", label: "Auto" },
    { key: "umbrella", label: "Umbrella" },
    { key: "ltc", label: "LTC" },
];

function getCRIColor(cri: number | null): string {
    if (cri === null) return "#333";
    if (cri <= 25) return "#22c55e";
    if (cri <= 50) return "#3b82f6";
    if (cri <= 75) return "#f59e0b";
    return "#ef4444";
}

function getGapPillStyle(gap: string): { bg: string; text: string; border: string } {
    switch (gap) {
        case "CRITICAL": return { bg: "rgba(239,68,68,0.08)", text: "#ef4444", border: "rgba(239,68,68,0.2)" };
        case "HIGH": return { bg: "rgba(245,158,11,0.08)", text: "#f59e0b", border: "rgba(245,158,11,0.2)" };
        case "CONSIDER": return { bg: "rgba(59,130,246,0.08)", text: "#3b82f6", border: "rgba(59,130,246,0.2)" };
        case "OK": return { bg: "rgba(34,197,94,0.08)", text: "#22c55e", border: "rgba(34,197,94,0.2)" };
        default: return { bg: "rgba(255,255,255,0.02)", text: "#555", border: "rgba(255,255,255,0.04)" };
    }
}

function formatCurrency(n: number | undefined): string {
    if (!n) return "—";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
    return `₹${n.toLocaleString("en-IN")}`;
}

/* ═══════════════ CRI Ring SVG ═══════════════ */
function CRIRing({ value, tier }: { value: number | null; tier: string }) {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const progress = value !== null ? (value / 100) * circumference : 0;
    const color = getCRIColor(value);

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-[96px] h-[96px]">
                <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                    <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
                    <motion.circle
                        cx="48" cy="48" r={radius} fill="none"
                        stroke={color} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - progress }}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                        className="text-[22px] font-mono font-bold"
                        style={{ color }}
                        key={value}
                        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        {value !== null ? value : "—"}
                    </motion.span>
                    <span className="text-[7px] font-mono text-zinc-600 uppercase tracking-[0.15em]">CRI</span>
                </div>
            </div>
            {tier && (
                <motion.span
                    className="text-[9px] font-mono font-bold uppercase tracking-[0.12em] mt-1.5 px-2 py-0.5 rounded"
                    style={{ color, backgroundColor: `${color}15` }}
                    key={tier}
                    initial={{ scale: 1.15 }} animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                >
                    {tier}
                </motion.span>
            )}
        </div>
    );
}

/* ═══════════════ Score Bar ═══════════════ */
function ScoreBar({ label, value, icon: Icon }: { label: string; value: number | null; icon: React.ElementType }) {
    const isActive = value !== null;
    const IconComp = Icon as React.FC<{ size?: number; className?: string }>;
    return (
        <div className={`transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-30"}`}>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                    <IconComp size={10} className={isActive ? "text-zinc-400" : "text-zinc-700"} />
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">{label}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-300">
                    {isActive ? value : "?"}
                </span>
            </div>
            <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                    className="h-full rounded-full bg-[#c8ff00]"
                    initial={{ width: 0 }}
                    animate={{ width: isActive ? `${Math.min(value!, 100)}%` : "0%" }}
                    transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                />
            </div>
        </div>
    );
}

/* ═══════════════ Typing Dots ═══════════════ */
function TypingIndicator() {
    return (
        <div className="flex items-center gap-1.5 px-3 py-2.5">
            {[0, 1, 2].map(i => (
                <motion.div
                    key={i}
                    className="w-[5px] h-[5px] rounded-full bg-[#c8ff00]"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                />
            ))}
        </div>
    );
}

/* ════════════════ Completeness Arc ════════════════ */
function CompletenessArc({ tier }: { tier: string }) {
    const tiers = ["INSUFFICIENT", "LOW", "MEDIUM", "HIGH"];
    const idx = tiers.indexOf(tier);
    const progress = idx >= 0 ? ((idx + 1) / 4) * 100 : 0;
    const color = idx <= 0 ? "#666" : idx === 1 ? "#ef4444" : idx === 2 ? "#f59e0b" : "#22c55e";

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-7 h-7">
                <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
                    <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2.5" />
                    <motion.circle
                        cx="14" cy="14" r="11" fill="none"
                        stroke={color} strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={69.1}
                        initial={{ strokeDashoffset: 69.1 }}
                        animate={{ strokeDashoffset: 69.1 - (progress / 100) * 69.1 }}
                        transition={{ duration: 0.6 }}
                    />
                </svg>
            </div>
            <div>
                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.12em] block">Profile</span>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color }}>
                    {tier || "INSUFFICIENT"}
                </span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   MAIN ADVISOR TAB COMPONENT
═══════════════════════════════════════════════════ */
export default function AdvisorTab() {
    const [messages, setMessages] = useState<AdvisorMessage[]>([]);
    const [scoreData, setScoreData] = useState<ScoreData>(EMPTY_SCORES);
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [sessionRestored, setSessionRestored] = useState(false);
    const [userScrolledUp, setUserScrolledUp] = useState(false);
    const [mobileScoreOpen, setMobileScoreOpen] = useState(false);

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const welcomeSentRef = useRef(false);

    /* ── Session Persistence ── */
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) {
                const { messages: savedMsgs, scoreData: savedScore } = JSON.parse(saved);
                if (savedMsgs?.length) {
                    setMessages(savedMsgs);
                    setScoreData(savedScore || EMPTY_SCORES);
                    setSessionRestored(true);
                    setTimeout(() => setSessionRestored(false), 4000);
                    return;
                }
            }
        } catch { /* ignore */ }
        // Send welcome message
        if (!welcomeSentRef.current) {
            welcomeSentRef.current = true;
            triggerWelcome();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, scoreData }));
            } catch { /* ignore */ }
        }
    }, [messages, scoreData]);

    /* ── Welcome Message ── */
    const triggerWelcome = useCallback(async () => {
        setIsStreaming(true);
        const welcomeId = crypto.randomUUID();

        // Add empty assistant message that will be filled by streaming
        setMessages([{
            id: welcomeId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        }]);

        try {
            const response = await fetch("/api/advisor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "Hello, I'd like to assess my insurance needs." }],
                }),
            });

            if (!response.ok) throw new Error("API error");

            await processStream(response, welcomeId);
        } catch {
            setMessages(prev => prev.map(m =>
                m.id === welcomeId
                    ? { ...m, content: "Welcome to ARIA — your AI Risk & Insurance Advisor. I'll guide you through a comprehensive insurance needs assessment based on established financial planning methodology.\n\nLet's start with the basics. **How old are you?**" }
                    : m
            ));
        }

        setIsStreaming(false);
    }, []);

    /* ── Stream Processing ── */
    const processStream = async (response: Response, messageId: string) => {
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") continue;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.text) {
                                fullText += parsed.text;

                                // Extract visible text (before ---SCOREDATA---)
                                const visibleText = fullText.split("---SCOREDATA---")[0].trim();

                                setMessages(prev => prev.map(m =>
                                    m.id === messageId ? { ...m, content: visibleText } : m
                                ));
                            }
                        } catch { /* skip */ }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Parse score data from the complete response
        parseScoreData(fullText);
    };

    /* ── Score Data Parsing ── */
    const parseScoreData = (fullText: string) => {
        const parts = fullText.split("---SCOREDATA---");
        if (parts.length < 2) return;

        const jsonStr = parts[1].trim();
        // Try to extract JSON — it might have trailing text or markdown
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        try {
            const parsed = JSON.parse(jsonMatch[0]);
            setScoreData(prev => ({
                ...prev,
                ...parsed,
                dimension_scores: { ...prev.dimension_scores, ...parsed.dimension_scores },
                inputs_collected: { ...prev.inputs_collected, ...parsed.inputs_collected },
                INS: { ...prev.INS, ...parsed.INS },
                coverage_recommendations: { ...prev.coverage_recommendations, ...parsed.coverage_recommendations },
            }));
        } catch (e) {
            console.error("Score JSON parse error:", e);
        }
    };

    /* ── Send Message ── */
    const sendMessage = useCallback(async () => {
        const text = inputValue.trim();
        if (!text || isStreaming) return;

        const userMsg: AdvisorMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            timestamp: Date.now(),
        };
        const assistantId = crypto.randomUUID();
        const assistantMsg: AdvisorMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setInputValue("");
        setIsStreaming(true);
        setUserScrolledUp(false);

        try {
            // Build conversation history for the API
            const history = [...messages, userMsg]
                .filter(m => m.content.trim())
                .map(m => ({
                    role: m.role === "assistant" ? "model" : "user",
                    content: m.content,
                }));

            const response = await fetch("/api/advisor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: history }),
            });

            if (!response.ok) throw new Error("API error");

            await processStream(response, assistantId);
        } catch {
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: "⚠ ARIA is temporarily unavailable. Please try again." }
                    : m
            ));
        }

        setIsStreaming(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputValue, isStreaming, messages]);

    /* ── Auto Scroll ── */
    useEffect(() => {
        if (!userScrolledUp && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, userScrolledUp]);

    const handleScroll = useCallback(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        setUserScrolledUp(!isNearBottom);
    }, []);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setUserScrolledUp(false);
    };

    /* ── Clear Session ── */
    const clearSession = () => {
        sessionStorage.removeItem(SESSION_KEY);
        setMessages([]);
        setScoreData(EMPTY_SCORES);
        setInputValue("");
        welcomeSentRef.current = false;
        setTimeout(() => {
            welcomeSentRef.current = true;
            triggerWelcome();
        }, 100);
    };

    /* ── Computed ── */
    const inputCount = useMemo(() => Object.keys(scoreData.inputs_collected).length, [scoreData.inputs_collected]);
    const topRecommendations = useMemo(() => {
        return Object.entries(scoreData.INS)
            .filter(([, v]) => v.score >= 41)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 3);
    }, [scoreData.INS]);

    /* ═══════════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════════ */
    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* ── Three-Column Layout ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ═══════ LEFT SIDEBAR — Risk Profile ═══════ */}
                <div className="hidden lg:flex w-[220px] shrink-0 border-r border-white/[0.04] bg-[#0a0a0a] flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                            <Sparkles size={11} className="text-[#c8ff00]" />
                            <span className="text-[9px] font-mono font-bold text-zinc-400 tracking-[0.14em] uppercase">Risk Profile</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                        {/* Completeness */}
                        <CompletenessArc tier={scoreData.data_completeness} />

                        {/* Dimension Scores */}
                        <div className="space-y-3">
                            <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.15em]">Dimensions</span>
                            {DIMENSION_META.map(d => (
                                <ScoreBar
                                    key={d.key}
                                    label={d.label}
                                    value={scoreData.dimension_scores[d.key]}
                                    icon={d.icon}
                                />
                            ))}
                        </div>

                        {/* Session Summary */}
                        {inputCount > 0 && (
                            <div className="pt-3 border-t border-white/[0.04]">
                                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.15em] block mb-2">Inputs Collected</span>
                                <div className="space-y-1">
                                    {Object.entries(scoreData.inputs_collected)
                                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                                        .slice(0, 12)
                                        .map(([k, v]) => (
                                            <div key={k} className="flex items-center justify-between">
                                                <span className="text-[9px] font-mono text-zinc-600 truncate max-w-[100px]">
                                                    {k.replace(/_/g, " ")}
                                                </span>
                                                <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[80px] text-right">
                                                    {String(v)}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════ MAIN CHAT PANEL ═══════ */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#080808] relative">
                    {/* Chat Header */}
                    <div className="h-10 px-4 flex items-center justify-between border-b border-white/[0.04] bg-[#0a0a0a] shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/20 flex items-center justify-center">
                                <Sparkles size={10} className="text-[#c8ff00]" />
                            </div>
                            <span className="text-[11px] font-mono font-bold text-zinc-300 tracking-wider">ARIA</span>
                            <span className="text-[9px] font-mono text-zinc-700">— Insurance Advisory Engine</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Mobile score button */}
                            <button
                                onClick={() => setMobileScoreOpen(true)}
                                className="lg:hidden text-[9px] font-mono font-bold text-[#c8ff00] border border-[#c8ff00]/20 px-2 py-1 rounded hover:bg-[#c8ff00]/5 transition-colors flex items-center gap-1"
                            >
                                Score ↗
                            </button>
                            <button
                                onClick={clearSession}
                                className="text-zinc-700 hover:text-zinc-400 transition-colors p-1 rounded hover:bg-white/[0.03]"
                                title="Clear session"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Session Restored Notice */}
                    <AnimatePresence>
                        {sessionRestored && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="px-4 py-1.5 bg-[#c8ff00]/[0.03] border-b border-[#c8ff00]/10 flex items-center gap-2">
                                    <RotateCcw size={10} className="text-[#c8ff00]/60" />
                                    <span className="text-[9px] font-mono text-[#c8ff00]/60">Previous session restored</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Chat Messages */}
                    <div
                        ref={chatContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
                    >
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                {msg.role === "assistant" ? (
                                    <div className="flex gap-2.5 max-w-[85%]">
                                        <div className="w-6 h-6 rounded-lg bg-[#141414] border border-[#1E1E1E] flex items-center justify-center shrink-0 mt-0.5">
                                            <Sparkles className="w-3 h-3 text-[#c8ff00]" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="text-[8px] font-mono text-[#c8ff00]/50 uppercase tracking-[0.15em] block mb-1">✦ ARIA</span>
                                            <div className="bg-[#141414] border border-[#1E1E1E] rounded-xl rounded-tl-sm px-3.5 py-2.5">
                                                <div className="text-[11.5px] font-mono leading-[1.7] text-zinc-300 advisor-markdown">
                                                    {msg.content ? (
                                                        <ReactMarkdown
                                                            components={{
                                                                p: ({ ...props }) => <p className="whitespace-pre-wrap mb-2 last:mb-0" {...props} />,
                                                                strong: ({ ...props }) => <strong className="font-bold text-zinc-100" {...props} />,
                                                                em: ({ ...props }) => <em className="italic text-zinc-400" {...props} />,
                                                                ul: ({ ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                                                ol: ({ ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                                                li: ({ ...props }) => <li className="mb-0.5" {...props} />,
                                                                h1: ({ ...props }) => <h1 className="text-[14px] font-bold text-[#c8ff00] mb-2 mt-3 first:mt-0" {...props} />,
                                                                h2: ({ ...props }) => <h2 className="text-[13px] font-bold text-zinc-200 mb-2 mt-3 first:mt-0" {...props} />,
                                                                h3: ({ ...props }) => <h3 className="text-[12px] font-bold text-zinc-300 mb-1.5 mt-2 first:mt-0" {...props} />,
                                                                hr: () => <hr className="border-white/[0.06] my-3" />,
                                                                blockquote: ({ ...props }) => (
                                                                    <blockquote className="border-l-2 border-[#c8ff00]/30 pl-3 my-2 text-zinc-400 italic" {...props} />
                                                                ),
                                                                table: ({ ...props }) => (
                                                                    <div className="overflow-x-auto my-2">
                                                                        <table className="w-full text-[10px] font-mono" {...props} />
                                                                    </div>
                                                                ),
                                                                th: ({ ...props }) => (
                                                                    <th className="text-left px-2 py-1.5 border-b border-white/[0.08] text-zinc-400 font-bold uppercase tracking-wider text-[9px]" {...props} />
                                                                ),
                                                                td: ({ ...props }) => (
                                                                    <td className="px-2 py-1 border-b border-white/[0.04] text-zinc-300" {...props} />
                                                                ),
                                                                code: ({ className, children, ...props }: any) => {
                                                                    const isInline = !className;
                                                                    return isInline
                                                                        ? <code className="bg-white/[0.06] rounded px-1 py-0.5 text-[#c8ff00] font-mono text-[10.5px]" {...props}>{children}</code>
                                                                        : <code className="block bg-[#0a0a0a] border border-white/[0.04] rounded-lg p-3 my-2 font-mono text-[10.5px] overflow-x-auto text-zinc-300" {...props}>{children}</code>;
                                                                },
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    ) : (
                                                        <TypingIndicator />
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-[8px] font-mono text-zinc-800 mt-1 block">
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="max-w-[85%]">
                                        <div className="bg-[#1A1A1A] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-[11.5px] font-mono leading-[1.7] text-zinc-200">
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        </div>
                                        <span className="text-[8px] font-mono text-zinc-800 mt-1 block text-right">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Scroll to bottom pill */}
                    <AnimatePresence>
                        {userScrolledUp && (
                            <motion.button
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                onClick={scrollToBottom}
                                className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#141414] border border-white/[0.08] rounded-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-[#1a1a1a] transition-colors z-10 shadow-lg"
                            >
                                <ArrowDown size={11} className="text-[#c8ff00]" />
                                <span className="text-[9px] font-mono text-zinc-400">New message</span>
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Input Bar */}
                    <div className="px-4 py-3 border-t border-white/[0.04] bg-[#0a0a0a] shrink-0">
                        <div className="flex items-center gap-2 bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-1.5 focus-within:border-[#c8ff00]/20 transition-colors">
                            <input
                                ref={inputRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                                placeholder="Ask ARIA anything about your insurance..."
                                className="flex-1 bg-transparent text-[11.5px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none min-w-0"
                                disabled={isStreaming}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={isStreaming || !inputValue.trim()}
                                className="w-7 h-7 rounded-md bg-[#c8ff00] hover:bg-[#A8D900] disabled:bg-zinc-800 disabled:text-zinc-600 text-black flex items-center justify-center transition-colors shrink-0"
                            >
                                {isStreaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            </button>
                        </div>
                        <p className="text-[8px] font-mono text-zinc-800 text-center mt-1.5">
                            ARIA provides educational guidance only — not licensed insurance advice
                        </p>
                    </div>
                </div>

                {/* ═══════ RIGHT PANEL — Live Score Card ═══════ */}
                <div className="hidden lg:flex w-[260px] shrink-0 border-l border-white/[0.04] bg-[#0a0a0a] flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-white/[0.04]">
                        <span className="text-[9px] font-mono font-bold text-zinc-400 tracking-[0.14em] uppercase">Live Score Card</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-5">
                        {/* CRI Ring */}
                        <div className="flex justify-center">
                            <CRIRing value={scoreData.CRI} tier={scoreData.CRI_tier} />
                        </div>

                        {/* GSI */}
                        {scoreData.GSI_tier && (
                            <div className="text-center">
                                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.12em] block mb-1">Gap Severity</span>
                                <motion.span
                                    className="text-[10px] font-mono font-bold px-2.5 py-1 rounded inline-block"
                                    style={{
                                        color: scoreData.GSI_tier === "Urgent Action" ? "#ef4444"
                                            : scoreData.GSI_tier === "Action Required" ? "#f59e0b"
                                                : scoreData.GSI_tier === "Review Recommended" ? "#3b82f6"
                                                    : "#22c55e",
                                        backgroundColor: scoreData.GSI_tier === "Urgent Action" ? "rgba(239,68,68,0.08)"
                                            : scoreData.GSI_tier === "Action Required" ? "rgba(245,158,11,0.08)"
                                                : scoreData.GSI_tier === "Review Recommended" ? "rgba(59,130,246,0.08)"
                                                    : "rgba(34,197,94,0.08)",
                                    }}
                                    key={scoreData.GSI_tier}
                                    initial={{ scale: 1.15 }} animate={{ scale: 1 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {scoreData.GSI_tier}
                                </motion.span>
                            </div>
                        )}

                        {/* Coverage Gap List */}
                        <div>
                            <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.12em] block mb-2">Coverage Gaps</span>
                            <div className="space-y-1.5">
                                {INS_TYPE_META.map(t => {
                                    const ins = scoreData.INS[t.key];
                                    const isScored = !!ins;
                                    const gap = ins?.gap || "—";
                                    const style = getGapPillStyle(gap);

                                    return (
                                        <motion.div
                                            key={t.key}
                                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-opacity duration-300 ${isScored ? "opacity-100" : "opacity-30"}`}
                                            style={{ backgroundColor: "rgba(255,255,255,0.015)" }}
                                        >
                                            <span className="text-[10px] font-mono text-zinc-400">{t.label}</span>
                                            <motion.span
                                                className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                                                style={{ backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}` }}
                                                key={`${t.key}-${gap}`}
                                                initial={isScored ? { scale: 1.15 } : {}}
                                                animate={{ scale: 1 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                {isScored ? gap : "—"}
                                            </motion.span>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Top Recommendations */}
                        {topRecommendations.length > 0 && (
                            <div>
                                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.12em] block mb-2">Top Recommendations</span>
                                <div className="space-y-2">
                                    {topRecommendations.map(([key, ins]) => {
                                        const rec = scoreData.coverage_recommendations[key];
                                        const typeMeta = INS_TYPE_META.find(t => t.key === key);
                                        return (
                                            <motion.div
                                                key={key}
                                                className="p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.015]"
                                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-mono font-bold text-zinc-300">
                                                        {typeMeta?.label || key}
                                                    </span>
                                                    <span
                                                        className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                                                        style={{
                                                            color: ins.score >= 66 ? "#ef4444" : "#f59e0b",
                                                            backgroundColor: ins.score >= 66 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                                                        }}
                                                    >
                                                        {ins.tier}
                                                    </span>
                                                </div>
                                                {rec && (
                                                    <span className="text-[10px] font-mono text-[#c8ff00]">
                                                        {rec.recommended ? formatCurrency(rec.recommended)
                                                            : rec.monthly_benefit ? `${formatCurrency(rec.monthly_benefit)}/mo`
                                                                : rec.dwelling ? formatCurrency(rec.dwelling)
                                                                    : "—"}
                                                    </span>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Confidence */}
                        <div className="pt-3 border-t border-white/[0.04]">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.12em]">Confidence</span>
                                <div className="relative group">
                                    <Info size={9} className="text-zinc-700 cursor-help" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                                        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-zinc-400 w-[180px] shadow-xl">
                                            {scoreData.missing_inputs.length > 0
                                                ? `Missing: ${scoreData.missing_inputs.slice(0, 5).join(", ")}`
                                                : "All key inputs collected"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold" style={{
                                color: scoreData.data_completeness === "HIGH" ? "#22c55e"
                                    : scoreData.data_completeness === "MEDIUM" ? "#f59e0b"
                                        : "#ef4444"
                            }}>
                                {scoreData.data_completeness || "INSUFFICIENT"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ Mobile Score Drawer ═══════ */}
            <AnimatePresence>
                {mobileScoreOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-50 lg:hidden"
                            onClick={() => setMobileScoreOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#0a0a0a] border-t border-white/[0.06] rounded-t-2xl max-h-[70vh] overflow-y-auto"
                        >
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-[0.14em] uppercase">Score Card</span>
                                    <button onClick={() => setMobileScoreOpen(false)} className="text-zinc-600"><X size={16} /></button>
                                </div>
                                <div className="flex justify-center"><CRIRing value={scoreData.CRI} tier={scoreData.CRI_tier} /></div>
                                <div className="grid grid-cols-2 gap-2">
                                    {DIMENSION_META.map(d => (
                                        <ScoreBar key={d.key} label={d.label} value={scoreData.dimension_scores[d.key]} icon={d.icon} />
                                    ))}
                                </div>
                                <div className="space-y-1.5">
                                    {INS_TYPE_META.map(t => {
                                        const ins = scoreData.INS[t.key];
                                        const gap = ins?.gap || "—";
                                        const style = getGapPillStyle(gap);
                                        return (
                                            <div key={t.key} className="flex items-center justify-between px-2 py-1">
                                                <span className="text-[10px] font-mono text-zinc-400">{t.label}</span>
                                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                                                    style={{ backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
                                                    {gap}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
