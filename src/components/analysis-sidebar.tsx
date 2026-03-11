"use client"
import { useState, useRef, useEffect } from "react"
import {
    Download, AlertTriangle, FileText, BarChart3, Shield,
    Activity, Search, ChevronDown, ChevronRight, Sparkles
} from "lucide-react"

interface SidebarProps {
    report: { riskScore?: number; flags?: string[]; metadata?: Record<string, unknown> }
    jobId: string | null
    onSend: (msg: string) => void
    onSetQuery: (q: string) => void
    onFocusInput: () => void
}

const getFlagExplanation = (flag: string): string => {
    const l = flag.toLowerCase()
    if (l.includes("exclusion")) return "Exclusions directly impact claim eligibility and define critical coverage gaps."
    if (l.includes("sub-limit") || l.includes("sublimit")) return "Sub-limits cap payouts for specific categories, potentially leaving significant out-of-pocket exposure."
    if (l.includes("co-pay") || l.includes("copay")) return "Copayment requirements mean the policyholder bears a percentage of each claim amount."
    if (l.includes("waiting")) return "Waiting periods delay coverage activation, creating temporary protection gaps."
    if (l.includes("deductible")) return "Elevated deductibles increase financial exposure at claim time."
    if (l.includes("pre-existing")) return "Pre-existing condition clauses can materially limit coverage for known conditions."
    if (l.includes("limit") || l.includes("cap")) return "Coverage caps define maximum payout boundaries for claims."
    return "This flag highlights a provision that may impact claim outcomes or policyholder obligations."
}

const clauseItems = [
    { label: "Coverage Scope & Limits", query: "What is the complete coverage scope and all specific limits?" },
    { label: "Exclusions & Restrictions", query: "List every exclusion and restriction with clause references" },
    { label: "Claims Settlement Process", query: "Explain the claims submission and settlement procedure" },
    { label: "Premium & Payment Terms", query: "Break down the premium structure and payment schedule" },
    { label: "Renewal & Cancellation", query: "What are the renewal and cancellation terms?" },
]

export function AnalysisSidebar({ report, jobId, onSend, onSetQuery, onFocusInput, className = "" }: SidebarProps & { className?: string }) {
    const [expandedFlags, setExpandedFlags] = useState<Record<number, boolean>>({})
    const [showExport, setShowExport] = useState(false)
    const exportRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false) }
        document.addEventListener("mousedown", h)
        return () => document.removeEventListener("mousedown", h)
    }, [])

    const rs = report.riskScore || 0
    const riskColor = rs >= 70 ? "#f87171" : rs >= 40 ? "#fbbf24" : "#34d399"
    const riskTextClass = rs >= 70 ? "text-red-400" : rs >= 40 ? "text-amber-400" : "text-emerald-400"
    const riskLabel = rs >= 70 ? "High Risk" : rs >= 40 ? "Moderate Risk" : "Low Risk"
    const circumference = 2 * Math.PI * 58
    const flags = report.flags || []
    const policyType = report.metadata?.policyType ? String(report.metadata.policyType) : null

    return (
        <div className={`flex flex-col overflow-y-auto shrink-0 ${className}`}>
            {/* Risk Score Ring */}
            <div className="px-5 py-6 border-b border-white/[0.04] flex flex-col items-center">
                <div className="relative w-[140px] h-[140px]">
                    <svg width="140" height="140" viewBox="0 0 140 140">
                        <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
                        <circle cx="70" cy="70" r="58" fill="none" stroke={riskColor} strokeWidth="8"
                            strokeDasharray={`${(rs / 100) * circumference} ${circumference}`}
                            strokeLinecap="round" transform="rotate(-90 70 70)"
                            style={{ transition: "stroke-dasharray 1s ease-out" }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[36px] font-bold text-zinc-100 leading-none">{rs}</span>
                        <span className="text-[12px] text-zinc-500 mt-0.5">/100</span>
                        <span className={`text-[11px] font-semibold mt-1.5 ${riskTextClass}`}>{riskLabel}</span>
                    </div>
                </div>
                {policyType && (
                    <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-[#c8ff00]/10 text-[#c8ff00] border border-[#c8ff00]/20 mt-4 uppercase tracking-[0.1em]">
                        {policyType}
                    </span>
                )}
            </div>

            {/* Export */}
            <div className="px-5 py-4 border-b border-white/[0.04]" ref={exportRef}>
                <button onClick={() => setShowExport(p => !p)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-white/[0.08] bg-[#111318] hover:bg-[#161920] text-[13px] text-zinc-300 font-medium transition-colors">
                    <span className="flex items-center gap-2"><Download className="w-3.5 h-3.5 text-zinc-400" /> Export Reports</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${showExport ? "rotate-180" : ""}`} />
                </button>
                {showExport && (
                    <div className="mt-2 bg-[#161920] border border-white/[0.08] rounded-lg overflow-hidden animate-in fade-in duration-200">
                        <a href={`/api/export/excel?jobId=${jobId}`} download onClick={() => setShowExport(false)}>
                            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><BarChart3 className="w-3.5 h-3.5 text-emerald-400" /></div>
                                <div><span className="text-[13px] text-zinc-200 font-medium block">Full Excel Report</span><span className="text-[11px] text-zinc-500">Standard analysis spreadsheet</span></div>
                            </div>
                        </a>
                        <a href={`/api/export/pdf?jobId=${jobId}`} download onClick={() => setShowExport(false)}>
                            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                <div className="w-7 h-7 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/20 flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#c8ff00]" /></div>
                                <div><span className="text-[13px] text-zinc-200 font-medium block">Standard PDF Report</span><span className="text-[11px] text-zinc-500">Full policy analysis document</span></div>
                            </div>
                        </a>
                        <div className="border-t border-white/[0.04] my-1" />
                        <button onClick={() => { setShowExport(false); onSetQuery("Generate a tailored Excel report covering: "); onFocusInput() }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                            <div className="w-7 h-7 rounded-md bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center"><BarChart3 className="w-3.5 h-3.5 text-emerald-400/60" /></div>
                            <div><span className="text-[13px] text-zinc-300 font-medium block">Custom Excel</span><span className="text-[11px] text-zinc-500">Specify scope and parameters</span></div>
                        </button>
                        <button onClick={() => { setShowExport(false); onSetQuery("Generate a comprehensive PDF report outlining: "); onFocusInput() }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                            <div className="w-7 h-7 rounded-md bg-[#c8ff00]/5 border border-[#c8ff00]/10 flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#c8ff00]/60" /></div>
                            <div><span className="text-[13px] text-zinc-300 font-medium block">Custom PDF</span><span className="text-[11px] text-zinc-500">Specify scope and parameters</span></div>
                        </button>
                        <button onClick={() => { setShowExport(false); onSetQuery("Generate a detailed Word document report for: "); onFocusInput() }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                            <div className="w-7 h-7 rounded-md bg-[#c8ff00]/5 border border-[#c8ff00]/10 flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#c8ff00]/60" /></div>
                            <div><span className="text-[13px] text-zinc-300 font-medium block">Custom Word</span><span className="text-[11px] text-zinc-500">Specify scope and parameters</span></div>
                        </button>
                    </div>
                )}
            </div>

            {/* Risk Flags */}
            {flags.length > 0 && (
                <div className="px-5 py-4 border-b border-white/[0.04]">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Risk Flags</span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold border border-amber-500/20">{flags.length}</span>
                    </div>
                    <ul className="space-y-2">
                        {flags.map((f, i) => (
                            <li key={i}>
                                <button onClick={() => setExpandedFlags(p => ({ ...p, [i]: !p[i] }))} className="w-full text-left">
                                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#111318] border border-amber-500/15 hover:border-amber-500/25 transition-colors">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-[6px] shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[12px] text-amber-400/90 leading-relaxed">{f}</span>
                                            <div className="flex items-center gap-1 mt-1">
                                                <ChevronRight className={`w-3 h-3 text-zinc-600 transition-transform duration-200 ${expandedFlags[i] ? "rotate-90" : ""}`} />
                                                <span className="text-[10px] text-zinc-600">Why this matters</span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                {expandedFlags[i] && (
                                    <div className="ml-4 mt-1.5 p-2.5 text-[11px] text-zinc-500 leading-relaxed bg-[#0E1014] rounded-md border border-white/[0.04] animate-in fade-in slide-in-from-top-1 duration-200">
                                        {getFlagExplanation(f)}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Clause Map */}
            <div className="px-5 py-4 border-b border-white/[0.04]">
                <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-3.5 h-3.5 text-[#c8ff00]" />
                    <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Clause Map</span>
                </div>
                <div className="space-y-0.5">
                    {clauseItems.map((item, i) => (
                        <button key={i} onClick={() => onSend(item.query)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/[0.04] transition-colors text-left group">
                            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-[#c8ff00] transition-colors shrink-0" />
                            <span className="text-[12px] font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-[#c8ff00]" />
                    <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Quick Actions</span>
                </div>
                <div className="space-y-1.5">
                    <button onClick={() => onSend("What are the key exclusions and limitations?")} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#c8ff00]/10 bg-[#c8ff00]/5 hover:bg-[#c8ff00]/10 text-[12px] font-mono font-medium text-[#c8ff00]/90 transition-colors text-left">
                        <Search className="w-3 h-3 shrink-0" /> List Exclusions
                    </button>
                    <button onClick={() => onSend("What does this policy cover and what are the limits?")} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/10 text-[12px] text-emerald-300 transition-colors text-left">
                        <Shield className="w-3 h-3 shrink-0" /> Check Coverage
                    </button>
                    <button onClick={() => { onSetQuery("sim: simulate a claim where "); onFocusInput() }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10 text-[12px] text-amber-300 transition-colors text-left">
                        <Activity className="w-3 h-3 shrink-0" /> Simulate Claim
                    </button>
                </div>
            </div>
        </div>
    )
}
