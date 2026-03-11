"use client"

import { useState, useRef, useEffect, useCallback, Fragment } from "react"
import {
  Paperclip, ArrowUp, FileText,
  Loader2, X, Download, AlertTriangle, CheckCircle2,
  Pencil, Sparkles, BarChart3, Shield, Activity,
  Database, Search, ChevronDown, Network, GitBranch, Flame, MessageSquare, Zap, Upload
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import { toPng } from "html-to-image"
import { Progress } from "@/components/ui/progress"
import { EmailCollectionModal } from "@/components/email-collection-modal"
import { AnalysisSidebar } from "@/components/analysis-sidebar"
import { PolicyNetworkGraph, ClauseRelationshipMap, RiskHeatmap } from "@/components/policy-visualizations"
import { AppHeader } from "@/components/AppHeader"

// ─────────────── Types ───────────────
interface PolicyMetadata {
  policyNumber?: string; premiumAmount?: string; insurerName?: string;
  policyType?: string; policyHolderName?: string; startDate?: string;
  expiryDate?: string; sumInsured?: string; deductibles?: string;
  suggestedQuestions?: string[];
  documentType?: string;
  insuredMembers?: Array<{ name: string; relationship: string; ped: string[]; riskScore: number }>;
  insurerReputation?: { csr?: number;[k: string]: any };
  [key: string]: any
}
interface ReportData {
  jobId: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  riskScore?: number; riskScoreRationale?: string; visualizations?: any; flags?: string[]; metadata?: PolicyMetadata; error?: string
}
interface SimResult { covered: string; estimatedPayout?: string; outOfPocket?: string; clauseReference?: string }

type ChatMsg =
  | { role: "user"; text: string }
  | { role: "ai"; text: string }
  | { role: "system"; text: string; type: "upload" | "processing" | "complete" | "error" }
  | { role: "analysis"; report: ReportData }
  | { role: "simulation"; result: SimResult; scenario: string }

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
        p: ({ ...props }) => <p className="leading-[1.7] text-[14.5px] [&:not(:last-child)]:mb-4 text-zinc-300" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold text-zinc-200 tracking-[0.01em]" {...props} />,
        ul: ({ ...props }) => <ul className="list-none space-y-2.5 my-4 pl-0" {...props} />,
        li: ({ ...props }) => (<li className="text-zinc-300" {...props} />)
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
};

// ─────────────── Main Component ───────────────
type CenterTab = "analysis" | "graph" | "clauses" | "heatmap"
export default function Home() {
  // File + Job state
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [progress, setProgress] = useState(0)
  // Center workspace tab
  const [centerTab, setCenterTab] = useState<CenterTab>("analysis")
  const [isUploading, setIsUploading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const snapshotRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Chat state
  const [query, setQuery] = useState("")
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [error, setError] = useState("")
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Simulation state
  const [simScenario, setSimScenario] = useState("")
  const [simLoading, setSimLoading] = useState(false)

  // Export dropdown state
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)

  // Email Modal state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)

  // Limit Modal state
  const [showLimitModal, setShowLimitModal] = useState(false)

  // Derived
  const isCompleted = report?.status === "COMPLETED"
  const hasStarted = chatHistory.length > 0
  const canSubmit = !!jobId && query.trim().length > 0 && !chatLoading

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px"
    }
  }, [query])

  // Watch for limit reached
  useEffect(() => {
    if (error?.toLowerCase().includes("limit") || error?.toLowerCase().includes("exceed")) {
      setShowLimitModal(true)
    }
  }, [error])

  useEffect(() => {
    if (chatHistory.length > 0) {
      const lastMsg = chatHistory[chatHistory.length - 1]
      if (lastMsg.role === "system" && lastMsg.type === "error" && (lastMsg.text.toLowerCase().includes("limit") || lastMsg.text.toLowerCase().includes("exceed"))) {
        setShowLimitModal(true)
      }
    }
  }, [chatHistory])

  // Load existing email from localStorage
  useEffect(() => {
    const savedEmail = localStorage.getItem("aetherlabs_email")
    if (savedEmail) {
      setUserEmail(savedEmail)
    }
  }, [])

  // ─── File upload → auto-process ───
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const selected = e.target.files[0]

    if (selected.type !== "application/pdf") { setError("Only PDF files are supported."); return }
    if (selected.size > 30 * 1024 * 1024) { setError("File size exceeds 30MB limit."); return }

    setFile(selected)
    setError("")

    // Auto upload immediately
    setIsUploading(true)
    setChatHistory(prev => [...prev, { role: "system", text: `Uploading ${selected.name} (${(selected.size / (1024 * 1024)).toFixed(1)}MB)...`, type: "upload" }])

    try {
      const formData = new FormData()
      formData.append("file", selected)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")

      setJobId(data.jobId)
      setIsUploading(false)
      setAnalysisLoading(true)

      // Only show modal if email hasn't been captured yet
      if (!localStorage.getItem("aetherlabs_email")) {
        setShowEmailModal(true)
      }

      setProgress(10)
      // Update "Uploading" message to "Uploaded" and add processing message
      setChatHistory(prev => {
        const updated = [...prev]
        // Find the last upload message and update it
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === "system" && (updated[i] as { type: string }).type === "upload") {
            updated[i] = { role: "system", text: `Uploaded ${selected.name} (${(selected.size / (1024 * 1024)).toFixed(1)}MB)`, type: "complete" }
            break
          }
        }
        return [...updated, { role: "system", text: "Policy uploaded. Analyzing in background \u2014 you can start asking questions now.", type: "processing" }]
      })
    } catch (err: unknown) {
      setError((err as Error).message)
      setIsUploading(false)
      setChatHistory(prev => [...prev, { role: "system", text: (err as Error).message, type: "error" }])
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0]
      if (selected.type !== "application/pdf") { setError("Only PDF files are supported."); return }

      // Simulate input change
      const mockEvent = {
        target: {
          files: [selected]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>
      handleFileChange(mockEvent)
    }
  }

  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

  // ─── Poll for analysis results ───
  const pollForResults = useCallback(async (id: string) => {
    let currentProgress = 10
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${id}`)
        const data = await res.json()
        if (res.ok) {
          setReport(data)
          if (data.status === "COMPLETED") {
            setProgress(100)
            setAnalysisLoading(false)
            clearInterval(intervalId)
            // Remove the "processing" message and add completion + analysis
            setChatHistory(prev => {
              const filtered = prev.filter(m => !(m.role === "system" && (m as { type: string }).type === "processing"))
              return [
                ...filtered,
                { role: "system", text: "Analysis complete.", type: "complete" },
                { role: "analysis", report: data }
              ]
            })
          } else if (data.status === "FAILED") {
            setAnalysisLoading(false)
            clearInterval(intervalId)
            setChatHistory(prev => [...prev, { role: "system", text: data.error || "Analysis failed.", type: "error" }])
          } else {
            currentProgress = Math.min(currentProgress + Math.random() * 12, 92)
            setProgress(currentProgress)
          }
        }
      } catch (err) { console.error("Poll error:", err) }
    }, 3500)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (jobId && analysisLoading) { pollForResults(jobId) }
  }, [jobId, analysisLoading, pollForResults])

  // ─── Chat with policy ───
  const handleSend = async (overrideMsg?: string) => {
    const msg = typeof overrideMsg === "string" ? overrideMsg.trim() : query.trim()
    if (!msg || !jobId) return
    setQuery("")
    setChatLoading(true)
    setChatHistory(prev => [...prev, { role: "user", text: msg }])

    // Detect simulation intent
    const simKeywords = /^(simulate|sim:|what if|scenario:|what happens if)/i
    const isSimulation = simKeywords.test(msg)

    try {
      if (isSimulation) {
        const scenario = msg.replace(simKeywords, "").trim() || msg
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, scenario })
        })
        const data = await res.json()
        if (res.ok) {
          setChatHistory(prev => [...prev, { role: "simulation", result: data, scenario }])
        } else {
          setChatHistory(prev => [...prev, { role: "ai", text: `Simulation error: ${data.error}` } as ChatMsg])
        }
      } else {
        const historyToSend = chatHistory
          .filter(m => m.role === "user" || m.role === "ai" || m.role === "simulation")
          .slice(-10) // Limit to last 10 turns
          .map(m => ({
            role: m.role === "simulation" ? "ai" : m.role,
            text: m.role === "simulation" ? `[SIMULATION RESULT]\n${JSON.stringify(m.result)}` : (m.text || "")
          }))

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, message: msg, history: historyToSend })
        })
        const data = await res.json()
        if (res.ok) {
          setChatHistory(prev => [...prev, { role: "ai", text: data.reply } as ChatMsg])
        } else {
          setChatHistory(prev => [...prev, { role: "ai", text: `Error: ${data.error}` } as ChatMsg])
        }
      }
    } catch (e: unknown) {
      setChatHistory(prev => [...prev, { role: "system", type: "error", text: `System Error: ${(e as Error).message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // ─── Simulation ───
  const handleSimulate = async () => {
    if (!simScenario.trim() || !jobId) return
    const scenario = simScenario.trim()
    setSimLoading(true)
    setSimScenario("")
    setChatHistory(prev => [...prev, { role: "user", text: `Simulate: ${scenario}` }])

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, scenario })
      })
      const data = await res.json()
      if (res.ok) {
        setChatHistory(prev => [...prev, { role: "simulation", result: data, scenario }])
      } else {
        setChatHistory(prev => [...prev, { role: "ai", text: `Simulation failed: ${data.error}` }])
      }
    } catch (e: unknown) {
      setChatHistory(prev => [...prev, { role: "ai", text: `Error: ${(e as Error).message}` }])
    } finally {
      setSimLoading(false)
    }
  }

  // ─── New session ───
  const handleNewSession = () => {
    setFile(null); setJobId(null); setReport(null); setProgress(0)
    setChatHistory([]); setQuery(""); setError("")
    setSimScenario(""); setAnalysisLoading(false); setIsUploading(false)
  }

  // ─── Edit message ───
  const handleEditMessage = (idx: number, text: string) => {
    setQuery(text)
    setChatHistory(prev => prev.slice(0, idx))
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // ─── Export Snapshot ───
  const handleExportSnapshot = async () => {
    if (!snapshotRef.current) return
    try {
      const dataURL = await toPng(snapshotRef.current, { backgroundColor: '#0a0a0a', pixelRatio: 2 })
      const link = document.createElement('a')
      link.href = dataURL
      link.download = `Policy_Snapshot_${report?.metadata?.policyNumber || 'Export'}.png`
      link.click()
    } catch (e) {
      console.error("Failed to export snapshot", e)
    }
  }

  // ─── Helpers ───
  const riskScore = report?.riskScore || 0
  const riskColor = riskScore >= 70 ? "text-red-400" : riskScore >= 40 ? "text-amber-400" : "text-emerald-400"
  const riskBg = riskScore >= 70 ? "bg-red-500/10 border-red-500/20" : riskScore >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"

  return (
    <Fragment>
      {!hasStarted && <AppHeader />}
      <div className={`flex flex-col ${!hasStarted ? "h-[calc(100vh-56px)]" : "h-screen"} overflow-hidden`}>
        {/* Hidden file input for all attach buttons */}
        <input type="file" className="hidden" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} />

        {/* ═══════════ COMMAND BAR (UNIFIED) ═══════════ */}
        {hasStarted && (
          <div className="h-12 w-full bg-[#080808] border-b border-white/[0.04] px-3 sm:px-4 flex items-center justify-between shrink-0 z-50">

            {/* Left section: Logo & Context & Tabs */}
            <div className="flex items-center h-full gap-2 sm:gap-4 overflow-hidden truncate">
              {/* Logo */}
              <div className="flex items-center gap-2 shrink-0">
                <img src="/logo.png" alt="Flow AI Logo" className="w-5 h-5 object-contain" />
                <div className="hidden xs:flex flex-col">
                  <span className="font-extrabold text-zinc-100 tracking-tighter text-[13px] leading-tight flex items-center gap-1.5 whitespace-nowrap">
                    FLOW AI <span className="text-zinc-500 font-medium text-[11px] uppercase tracking-widest hidden xl:inline-block">| Policy Intelligence Engine</span>
                  </span>
                </div>
              </div>

              {/* Policy Context */}
              {isCompleted && file && (
                <div className="flex items-center gap-2 overflow-hidden truncate">
                  <div className="h-4 w-px bg-white/[0.06] hidden sm:block" />
                  <div className="flex items-center gap-1.5 overflow-hidden truncate">
                    {report?.metadata?.insurerName && (
                      <>
                        <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 truncate max-w-[80px] sm:max-w-[150px]">{report.metadata.insurerName}</span>
                        <div className="h-3 w-px bg-white/[0.06]" />
                      </>
                    )}
                    <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-[#c8ff00] truncate max-w-[100px] sm:max-w-[150px]">
                      {file.name}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right section */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 h-full">
              <a href="/consumer/policy" className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest hidden sm:block">
                Consumer View
              </a>

              {isCompleted && (
                <>
                  <div className="h-4 w-px bg-white/[0.06]" />
                  {/* CSR Badge - Smaller on Mobile */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500 hidden xs:block">CSR</span>
                    <span className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.2 sm:px-1.5 py-0.5 rounded ${((report?.metadata?.insurerReputation as any)?.csr || 0) >= 80 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {(report?.metadata?.insurerReputation as any)?.csr || 88}%
                    </span>
                  </div>

                  {/* Sidebar Toggle for Mobile */}
                  <button
                    onClick={() => setShowMobileSidebar(true)}
                    className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.1] text-zinc-400"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={handleNewSession}
                className="h-7 px-2.5 sm:px-3 flex items-center justify-center bg-[#c8ff00] hover:bg-[#d4ff33] text-black text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest transition-colors ml-1 shadow-[0_0_15px_rgba(200,255,0,0.15)]"
              >
                {/* Responsive Label */}
                <span className="hidden xs:block">NEW ANALYSIS</span>
                <span className="xs:hidden">NEW</span>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ TABS (Mobile Scrollable) ═══════════ */}
        {hasStarted && isCompleted && (
          <div className="w-full bg-[#080808] border-b border-white/[0.04] overflow-x-auto overflow-y-hidden scrollbar-hide shrink-0 scroll-smooth">
            <div className="flex items-center gap-2 px-4 h-9 min-w-max">
              {([
                { key: "analysis" as CenterTab, label: "ANALYSIS", icon: <MessageSquare className="w-3 h-3" /> },
                { key: "graph" as CenterTab, label: "GRAPH", icon: <Network className="w-3 h-3" /> },
                { key: "clauses" as CenterTab, label: "CLAUSES", icon: <FileText className="w-3 h-3" /> },
                { key: "heatmap" as CenterTab, label: "HEATMAP", icon: <Flame className="w-3 h-3" /> },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setCenterTab(t.key)}
                  className={`px-3 sm:px-4 h-full flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono font-bold tracking-widest transition-all duration-200 border-b-2 
                    ${centerTab === t.key
                      ? "border-[#c8ff00] text-[#c8ff00] bg-[#c8ff00]/5"
                      : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════ MAIN CONTENT ROW ═══════════ */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT PANEL: Chat & Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* ── Visualization Panels ── */}
            {isCompleted && centerTab !== "analysis" && (
              <div className="flex-1 overflow-hidden bg-[#0a0a0a]">
                {centerTab === "graph" && (
                  <div className="w-full h-full">
                    <PolicyNetworkGraph riskScore={report?.riskScore || 50} flags={report?.flags || []} data={report?.visualizations} theme="consumer" />
                  </div>
                )}
                {centerTab === "clauses" && (
                  <div className="w-full h-full">
                    <ClauseRelationshipMap data={report?.visualizations} theme="consumer" />
                  </div>
                )}
                {centerTab === "heatmap" && (
                  <div className="w-full h-full">
                    <RiskHeatmap onJumpToAnalysis={() => setCenterTab("analysis")} data={report?.visualizations} theme="consumer" />
                  </div>
                )}
              </div>
            )}

            {/* ── Analysis / Chat View ── */}
            {(!isCompleted || centerTab === "analysis") && (
              <div className="flex-1 overflow-y-auto">
                <div className={`mx-auto w-full ${hasStarted ? (isCompleted ? 'max-w-4xl px-3 sm:px-6' : 'max-w-3xl px-3 sm:px-4') : 'max-w-[1500px] px-2'}`}>

                  {/* ─── EMPTY STATE / AI CONSOLE LAYOUT ─── */}
                  {!hasStarted && (
                    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] animate-in fade-in duration-700 w-full max-w-[1000px] mx-auto px-6 py-4 relative">

                      {/* Cinematic Background Gradients */}
                      <div className="fixed inset-0 pointer-events-none -z-10">
                        <div className="absolute inset-0 bg-[#080808]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(200,255,0,0.05),transparent_70%)]" />
                      </div>

                      {/* ── System Header ── */}
                      <div className="w-full max-w-[640px] mb-8 text-center">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-white/[0.02] border border-white/[0.05] text-[9px] font-mono font-bold text-zinc-600 tracking-[0.16em] uppercase mb-6">
                          <span className="w-1 h-1 rounded-full bg-[#c8ff00]/40" /> PRO INTELLIGENCE CONSOLE
                        </div>
                        <h1 className="text-[2rem] md:text-[2.8rem] font-semibold text-white tracking-[-0.03em] leading-[1.08] mb-3">
                          Decode <span className="text-[#c8ff00]">Any Policy</span> Instantly
                        </h1>
                        <p className="text-zinc-600 text-[12px] font-mono">
                          Upload your policy for structural breakdown, risk detection, and deep AI analysis.
                        </p>
                      </div>

                      {/* ── Ingestion Panel — Central Console ── */}
                      <div className="w-full max-w-[560px] space-y-4">
                        <div
                          className={`relative border rounded-2xl p-10 text-center cursor-pointer transition-all duration-500 overflow-hidden group/drop
                          ${dragOver ? "border-[#c8ff00]/30 bg-[#c8ff00]/[0.02] shadow-[0_0_40px_rgba(200,255,0,0.05)]" : "border-white/[0.06] hover:border-[#c8ff00]/20 bg-[#0d0d0d]"}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                          <div className="flex flex-col items-center relative z-10">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 border transition-all duration-500
                            ${dragOver ? "bg-[#c8ff00]/[0.1] border-[#c8ff00]/30 shadow-[0_0_20px_rgba(200,255,0,0.2)]" : "bg-white/[0.03] border-white/[0.08]"}`}>
                              <Upload size={20} className={dragOver ? "text-[#c8ff00]" : "text-zinc-500"} />
                            </div>
                            <p className="text-[14px] font-mono text-zinc-400 mb-1 group-hover/drop:text-zinc-200 transition-colors">
                              Drop your insurance policy here
                            </p>
                            <p className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">PDF Only · Max 30MB</p>
                          </div>
                        </div>

                        {/* Process Pipeline (Simplified) */}
                        <div className="bg-[#0d0d0d]/40 border border-white/[0.04] rounded-xl px-6 py-4">
                          <div className="flex items-center justify-between mx-auto max-w-md">
                            {[
                              { icon: <Paperclip className="w-3.5 h-3.5" />, label: "INGEST" },
                              { icon: <Database className="w-3.5 h-3.5" />, label: "STRUCTURE" },
                              { icon: <Activity className="w-3.5 h-3.5" />, label: "ANALYZE" },
                            ].map((step, idx) => (
                              <Fragment key={idx}>
                                {idx > 0 && (
                                  <div className="flex-1 h-[1px] bg-zinc-800/50 mx-4" />
                                )}
                                <div className="flex flex-col items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/10 text-[#c8ff00]">
                                    {step.icon}
                                  </div>
                                  <span className="text-[8px] font-mono font-bold text-zinc-500 tracking-wider text-center">{step.label}</span>
                                </div>
                              </Fragment>
                            ))}
                          </div>
                        </div>

                        {/* AI Capability Grid (Compact) */}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          {[
                            { icon: <Search className="w-3 h-3 text-[#c8ff00]" />, title: "Liability limits" },
                            { icon: <AlertTriangle className="w-3 h-3 text-rose-400" />, title: "Strict copayments" },
                            { icon: <Zap className="w-3 h-3 text-amber-400" />, title: "Cost exposure" },
                            { icon: <Database className="w-3 h-3 text-[#c8ff00]" />, title: "Premium breakdown" },
                          ].map((item, idx) => (
                            <div key={idx}
                              onClick={() => { setQuery(item.title); textareaRef.current?.focus() }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.015] border border-white/[0.04] hover:border-white/[0.08] transition-colors cursor-pointer group">
                              <div className="w-5 h-5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {item.icon}
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors">{item.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── CHAT MESSAGES ─── */}
                  {hasStarted && (
                    <div className="py-6 space-y-1">
                      {chatHistory.map((msg, idx) => {

                        // ── System messages ──
                        if (msg.role === "system") {
                          return (
                            <div key={idx} className="flex justify-center py-3">
                              <div className={`flex items-center gap-2 text-[12px] font-mono font-medium px-3 py-1.5 rounded-full border ${msg.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                msg.type === "complete" ? "bg-[#c8ff00]/10 border-[#c8ff00]/20 text-[#c8ff00]" :
                                  msg.type === "upload" ? "bg-[#c8ff00]/10 border-[#c8ff00]/20 text-[#c8ff00]" :
                                    "bg-zinc-800/50 border-white/[0.06] text-zinc-400"
                                }`}>
                                {msg.type === "upload" && <Paperclip className="w-3 h-3" />}
                                {msg.type === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
                                {msg.type === "complete" && <CheckCircle2 className="w-3 h-3" />}
                                {msg.type === "error" && <AlertTriangle className="w-3 h-3" />}
                                {msg.text}
                              </div>
                            </div>
                          )
                        }

                        // ── User messages ──
                        if (msg.role === "user") {
                          return (
                            <div key={idx} className="flex justify-end py-2 group">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditMessage(idx, msg.text)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
                                  title="Edit message"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <div className="max-w-[90%] sm:max-w-[80%] bg-[#c8ff00]/[0.06] border border-[#c8ff00]/10 rounded-2xl rounded-br-md px-3 sm:px-4 py-2 sm:py-3 shadow-lg shadow-black/20">
                                  <p className="text-[13.5px] sm:text-[14px] font-mono text-zinc-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                </div>
                              </div>
                            </div>
                          )
                        }

                        // ── AI replies ──
                        if (msg.role === "ai") {
                          const hasExcelAction = msg.text.includes("[ACTION:EXPORT_EXCEL]")
                          const hasPdfAction = msg.text.includes("[ACTION:EXPORT_PDF]")

                          // Extract dynamic excel query if present
                          const dynamicExcelMatch = msg.text.match(/\[ACTION:DYNAMIC_EXCEL:\s*(?:"([^"]+)"|([^\]]+))\]/)
                          const dynamicExcelQuery = dynamicExcelMatch ? (dynamicExcelMatch[1] || dynamicExcelMatch[2]).trim() : null

                          // Extract dynamic pdf query if present
                          const dynamicPdfMatch = msg.text.match(/\[ACTION:DYNAMIC_PDF:\s*(?:"([^"]+)"|([^\]]+))\]/)
                          const dynamicPdfQuery = dynamicPdfMatch ? (dynamicPdfMatch[1] || dynamicPdfMatch[2]).trim() : null

                          // Extract dynamic word query if present
                          const dynamicWordMatch = msg.text.match(/\[ACTION:DYNAMIC_WORD:\s*(?:"([^"]+)"|([^\]]+))\]/)
                          const dynamicWordQuery = dynamicWordMatch ? (dynamicWordMatch[1] || dynamicWordMatch[2]).trim() : null

                          const cleanText = msg.text
                            .replace(/\[ACTION:EXPORT_EXCEL\]/g, "")
                            .replace(/\[ACTION:EXPORT_PDF\]/g, "")
                            .replace(/\[ACTION:DYNAMIC_EXCEL:[^\]]+\]/g, "")
                            .replace(/\[ACTION:DYNAMIC_PDF:[^\]]+\]/g, "")
                            .replace(/\[ACTION:DYNAMIC_WORD:[^\]]+\]/g, "")
                            .trim()

                          return (
                            <div key={idx} className="flex justify-start py-2">
                              <div className="flex gap-3 max-w-[85%]">
                                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                                  <Sparkles className="w-3.5 h-3.5 text-[#c8ff00]" />
                                </div>
                                <div className="space-y-3">
                                  <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-md px-3 sm:px-4 py-2 sm:py-3 shadow-xl shadow-black/20">
                                    <div className="text-[13.5px] sm:text-[14px] text-zinc-300 leading-[1.7] sm:leading-[1.8] font-mono">
                                      <TypewriterEffect text={cleanText} isLatest={idx === chatHistory.length - 1} />
                                    </div>
                                  </div>
                                  {(hasExcelAction || hasPdfAction || dynamicExcelQuery || dynamicPdfQuery || dynamicWordQuery) && (
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                      {hasExcelAction && (
                                        <a href={`/api/export/excel?jobId=${jobId}`} download>
                                          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[13px] font-semibold hover:bg-emerald-500/20 transition-colors">
                                            <Download className="w-4 h-4" /> Download Full Excel Report
                                          </button>
                                        </a>
                                      )}
                                      {dynamicExcelQuery && (
                                        <a href={`/api/export/dynamic?jobId=${jobId}&query=${encodeURIComponent(dynamicExcelQuery)}`} download>
                                          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[13px] font-semibold hover:bg-emerald-500/20 transition-colors">
                                            <Download className="w-4 h-4" /> Download Custom Excel
                                          </button>
                                        </a>
                                      )}
                                      {hasPdfAction && (
                                        <a href={`/api/export/pdf?jobId=${jobId}`} download>
                                          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00] text-[13px] font-semibold hover:bg-[#c8ff00]/20 transition-colors">
                                            <Download className="w-4 h-4" /> Download Standard PDF
                                          </button>
                                        </a>
                                      )}
                                      {dynamicPdfQuery && (
                                        <a href={`/api/export/dynamic-pdf?jobId=${jobId}&query=${encodeURIComponent(dynamicPdfQuery)}`} download>
                                          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00] text-[13px] font-mono font-semibold hover:bg-[#c8ff00]/20 transition-colors">
                                            <Download className="w-4 h-4" /> Download Custom PDF
                                          </button>
                                        </a>
                                      )}
                                      {dynamicWordQuery && (
                                        <a href={`/api/export/dynamic-word?jobId=${jobId}&query=${encodeURIComponent(dynamicWordQuery)}`} download>
                                          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00] text-[13px] font-semibold hover:bg-[#c8ff00]/20 transition-colors">
                                            <FileText className="w-4 h-4" /> Download Custom Word
                                          </button>
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        }

                        if (msg.role === "analysis") {
                          const r = msg.report
                          const m = r.metadata || {} as PolicyMetadata
                          const rs = r.riskScore || 0
                          const rc = rs >= 70 ? "text-red-400" : rs >= 40 ? "text-amber-400" : "text-emerald-400"
                          const rb = rs >= 70 ? "bg-red-500/10 border-red-500/20" : rs >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                          const riskLabel = rs >= 70 ? "High Risk" : rs >= 40 ? "Moderate Risk" : "Low Risk"

                          const validRows = (rows: { label: string, value: unknown }[]) => rows.map((row) => {
                            const isEmpty = !row.value || String(row.value) === "N/A" || String(row.value) === "null" || String(row.value).trim() === ""
                            return { label: row.label, value: (isEmpty ? "Not Specified" : String(row.value)) as string }
                          })

                          const personalInfo = validRows([{ label: "Policy Holder", value: m.policyHolderName }])
                          const policyDetails = validRows([
                            { label: "Policy Number", value: m.policyNumber },
                            { label: "Policy Type", value: m.policyType },
                            { label: "Insurer", value: m.insurerName },
                            { label: "Start Date", value: m.startDate },
                            { label: "Expiry Date", value: m.expiryDate },
                          ])
                          const financials = validRows([
                            { label: "Premium", value: m.premiumAmount },
                            { label: "Sum Insured", value: m.sumInsured },
                            { label: "Deductibles", value: m.deductibles },
                          ])

                          return (
                            <div key={idx} className="py-2.5">
                              <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                                  <Sparkles className="w-3.5 h-3.5 text-[#c8ff00]" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-3">
                                  {/* Compact risk badge - mobile only, desktop uses sidebar */}
                                  <div className="flex items-center gap-3 lg:hidden">
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${rb}`}>
                                      <BarChart3 className={`w-4 h-4 ${rc}`} />
                                      <span className={`text-lg font-bold ${rc}`}>{rs}</span>
                                      <span className="text-[11px] text-zinc-600">/100</span>
                                      <span className={`text-[11px] font-semibold ${rc} ml-1`}>{riskLabel}</span>
                                    </div>
                                  </div>

                                  {/* Flatter, embedded Policy Snapshot */}
                                  <div ref={snapshotRef} className="bg-[#0E1014] border border-white/[0.06] rounded-lg overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-white/[0.04] bg-[#111318] flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <Shield className="w-3.5 h-3.5 text-[#c8ff00]" />
                                        <span className="text-[11px] font-mono font-semibold text-zinc-300 uppercase tracking-widest">Policy Snapshot</span>
                                        <span className="text-[10px] font-mono text-zinc-600 border-l border-white/[0.06] pl-2.5 ml-1">AI Extracted</span>
                                      </div>
                                      <button onClick={handleExportSnapshot} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-[10px] font-mono font-bold text-zinc-400 hover:text-white transition-all">
                                        <Download size={12} /> Save Image
                                      </button>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                                      <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pb-1 border-b border-white/[0.04]">Policyholder</h4>
                                        {personalInfo.map((row, i) =>
                                          <div key={i} className="flex flex-col">
                                            <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase tracking-widest block mb-2">{row.label}</span>
                                            <p className={`text-[12px] font-mono font-black ${String(row.value) === 'Not Specified' ? 'text-zinc-700' : 'text-zinc-100'} leading-tight`}>{String(row.value)}</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pb-1 border-b border-white/[0.04]">Financials</h4>
                                        {financials.map((row, i) =>
                                          <div key={i} className="flex flex-col">
                                            <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase tracking-widest block mb-1.5">{row.label}</span>
                                            <p className={`text-[12px] font-mono font-bold ${String(row.value) === 'Not Specified' ? 'text-zinc-600' :
                                              row.label === 'Premium' ? 'text-emerald-500' : 'text-zinc-200'} leading-tight`}>
                                              {String(row.value)}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pb-1 border-b border-white/[0.04]">Details</h4>
                                        {policyDetails.map((row, i) =>
                                          <div key={i} className="flex flex-col">
                                            <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase tracking-widest block mb-1.5">{row.label}</span>
                                            <p className={`text-[12px] font-mono font-bold ${String(row.value) === 'Not Specified' ? 'text-zinc-600' : 'text-zinc-200'} leading-tight`}>{String(row.value)}</p>
                                          </div>
                                        )}
                                        {m.documentType && (
                                          <div className="p-4 border-t border-white/[0.04] bg-[#0d0d0d]">
                                            <div className="flex flex-col gap-2">
                                              <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase tracking-[0.16em]">Document Type</span>
                                              <div className="inline-flex">
                                                <span className="text-[10px] font-mono font-black text-[#c8ff00] bg-[#c8ff00]/10 border border-[#c8ff00]/20 px-2 py-0.5 rounded uppercase tracking-widest shadow-[0_0_10px_rgba(200,255,0,0.05)]">
                                                  {m.documentType || "Schedule"}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Insured Members Table (New) */}
                                    {m.insuredMembers && m.insuredMembers.length > 0 && (
                                      <div className="px-4 py-3 border-t border-white/[0.04] bg-white/[0.01]">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">Insured Members & PEDs</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                          {m.insuredMembers.map((member, i) => (
                                            <div key={i} className="flex flex-col p-2.5 bg-black/40 border border-white/[0.04] rounded-xl">
                                              <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[13px] font-semibold text-zinc-100">{member.name}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.05] rounded text-zinc-400">{member.relationship}</span>
                                              </div>
                                              <div className="flex flex-wrap gap-1.5">
                                                {member.ped && member.ped.length > 0 && member.ped[0] !== "None" ? (
                                                  member.ped.map((p, pi) => (
                                                    <span key={pi} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                                                      PED: {p}
                                                    </span>
                                                  ))
                                                ) : (
                                                  <span className="text-[10px] text-zinc-600 italic">No declared PEDs</span>
                                                )}
                                              </div>
                                              <div className="mt-2 flex items-center gap-2">
                                                <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full ${member.riskScore >= 70 ? 'bg-red-500' : member.riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${member.riskScore}%` }}
                                                  />
                                                </div>
                                                <span className={`text-[10px] font-bold ${member.riskScore >= 70 ? 'text-red-400' : member.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                  {member.riskScore}% Risk
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        }

                        // ── Simulation result ──
                        if (msg.role === "simulation") {
                          const sim = msg.result
                          return (
                            <div key={idx} className="flex justify-start py-2">
                              <div className="flex gap-3 max-w-[85%]">
                                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                                  <Activity className="w-3.5 h-3.5 text-[#c8ff00]" />
                                </div>
                                <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-md p-4 space-y-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Simulation Result</span>
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${sim.covered === "Yes" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                      sim.covered === "Conditional" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                        "bg-red-500/10 text-red-400 border border-red-500/20"
                                      }`}>{sim.covered}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2.5 bg-black/30 rounded-lg border border-white/[0.04]">
                                      <span className="block text-[10px] text-zinc-600 mb-0.5">Est. Payout</span>
                                      <span className="text-[13px] font-medium text-zinc-200">{sim.estimatedPayout || "N/A"}</span>
                                    </div>
                                    <div className="p-2.5 bg-black/30 rounded-lg border border-white/[0.04]">
                                      <span className="block text-[10px] text-zinc-600 mb-0.5">Out of Pocket</span>
                                      <span className="text-[13px] font-medium text-zinc-200">{sim.outOfPocket || "N/A"}</span>
                                    </div>
                                  </div>
                                  {sim.clauseReference && (
                                    <div className="p-2.5 bg-black/30 rounded-lg border border-white/[0.04]">
                                      <span className="block text-[10px] text-zinc-600 mb-0.5">Triggered Clause</span>
                                      <span className="text-[12px] text-zinc-400 italic leading-relaxed">{sim.clauseReference}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        }

                        return null
                      })}

                      {/* Smart Recommendations — inline in chat after analysis completes */}
                      {isCompleted && !chatLoading && (() => {
                        // Find the index of the last non-system message
                        const lastMsgIdx = chatHistory.length - 1
                        const lastMsg = chatHistory[lastMsgIdx]
                        // Show recommendations after AI responses or analysis
                        const showRecs = lastMsg && (lastMsg.role === "ai" || lastMsg.role === "analysis" || lastMsg.role === "simulation")
                        if (!showRecs) return null
                        return (
                          <div className="flex justify-start py-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
                            <div className="flex gap-3 max-w-[85%]">
                              <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#c8ff00]" />
                              </div>
                              <div className="space-y-2.5">
                                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Recommended Actions</span>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => handleSend("What are the key exclusions and limitations?")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#c8ff00]/20 bg-[#c8ff00]/5 hover:bg-[#c8ff00]/10 text-[12px] text-[#c8ff00] transition-colors"
                                  >
                                    <Search className="w-3 h-3" /> List Exclusions
                                  </button>
                                  <button
                                    onClick={() => handleSend("What does this policy cover and what are the limits?")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-[12px] text-emerald-300 transition-colors"
                                  >
                                    <Shield className="w-3 h-3" /> Check Coverage
                                  </button>
                                  <button
                                    onClick={() => { setQuery("sim: simulate a claim where "); textareaRef.current?.focus() }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-[12px] text-amber-300 transition-colors"
                                  >
                                    <Activity className="w-3 h-3" /> Simulate Claim
                                  </button>
                                  {/* Export Reports Dropdown */}
                                  <div className="relative" ref={exportDropdownRef}>
                                    <button
                                      onClick={() => setShowExportDropdown(prev => !prev)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-[12px] text-violet-300 transition-colors"
                                    >
                                      <Download className="w-3 h-3" /> Export Reports <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showExportDropdown && (
                                      <div className="absolute bottom-full mb-2 left-0 w-64 bg-[#1A1D24] border border-white/[0.08] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="px-3 py-2 border-b border-white/[0.04]">
                                          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Export Formats</span>
                                        </div>
                                        <div className="py-1">
                                          <a href={`/api/export/excel?jobId=${jobId}`} download onClick={() => setShowExportDropdown(false)}>
                                            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                              <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                                              </div>
                                              <div>
                                                <span className="text-[13px] text-zinc-200 font-medium block">Full Excel Report</span>
                                                <span className="text-[11px] text-zinc-500">Standard analysis spreadsheet</span>
                                              </div>
                                            </div>
                                          </a>
                                          <a href={`/api/export/pdf?jobId=${jobId}`} download onClick={() => setShowExportDropdown(false)}>
                                            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                              <div className="w-7 h-7 rounded-md bg-[#c8ff00]/10 border border-[#c8ff00]/20 flex items-center justify-center">
                                                <FileText className="w-3.5 h-3.5 text-[#c8ff00]" />
                                              </div>
                                              <div>
                                                <span className="text-[13px] text-zinc-200 font-medium block">Standard PDF Report</span>
                                                <span className="text-[11px] text-zinc-500">Full policy analysis document</span>
                                              </div>
                                            </div>
                                          </a>
                                          <div className="border-t border-white/[0.04] my-1" />
                                          <button
                                            onClick={() => { setShowExportDropdown(false); setQuery("Generate a tailored Excel report covering: "); textareaRef.current?.focus() }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
                                          >
                                            <div className="w-7 h-7 rounded-md bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center">
                                              <BarChart3 className="w-3.5 h-3.5 text-emerald-400/60" />
                                            </div>
                                            <div>
                                              <span className="text-[13px] text-zinc-300 font-medium block">Custom Excel Report</span>
                                              <span className="text-[11px] text-zinc-500">Specify scope and parameters</span>
                                            </div>
                                          </button>
                                          <button
                                            onClick={() => { setShowExportDropdown(false); setQuery("Generate a comprehensive PDF report outlining: "); textareaRef.current?.focus() }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
                                          >
                                            <div className="w-7 h-7 rounded-md bg-[#c8ff00]/5 border border-[#c8ff00]/10 flex items-center justify-center">
                                              <FileText className="w-3.5 h-3.5 text-[#c8ff00]/60" />
                                            </div>
                                            <div>
                                              <span className="text-[13px] text-zinc-300 font-medium block">Custom PDF Report</span>
                                              <span className="text-[11px] text-zinc-500">Specify scope and parameters</span>
                                            </div>
                                          </button>
                                          <button
                                            onClick={() => { setShowExportDropdown(false); setQuery("Generate a detailed Word document report for: "); textareaRef.current?.focus() }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
                                          >
                                            <div className="w-7 h-7 rounded-md bg-[#c8ff00]/5 border border-[#c8ff00]/10 flex items-center justify-center">
                                              <FileText className="w-3.5 h-3.5 text-[#c8ff00]/60" />
                                            </div>
                                            <div>
                                              <span className="text-[13px] text-zinc-300 font-medium block">Custom Word Report</span>
                                              <span className="text-[11px] text-zinc-500">Specify scope and parameters</span>
                                            </div>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Typing indicator */}
                      {chatLoading && (
                        <div className="flex justify-start py-2">
                          <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0">
                              <Sparkles className="w-3.5 h-3.5 text-[#c8ff00]" />
                            </div>
                            <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-md px-4 py-3">
                              <div className="flex gap-1.5 items-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Processing bar */}
                      {analysisLoading && (
                        <div className="flex justify-center py-12 my-6">
                          <div className="flex flex-col items-center gap-8 w-full max-w-[280px]">
                            <div className="relative flex items-center justify-center w-20 h-20">
                              {/* Neural lines expanding */}
                              <div className="absolute inset-0 rounded-full border border-white/[0.04] animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                              <div className="absolute inset-2 rounded-full border border-[#c8ff00]/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ animationDelay: "1s" }} />
                              <div className="absolute inset-4 rounded-full border border-white/[0.06] animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ animationDelay: "2s" }} />
                              <div className="w-12 h-12 rounded-[14px] bg-gradient-to-b from-[#1A1D24] to-[#14171C] border border-white/[0.08] shadow-[0_0_30px_rgba(200,255,0,0.1)] flex items-center justify-center relative z-10">
                                <img src="/logo.png" alt="Processing Logo" className="w-6 h-6 animate-pulse" />
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-2.5 min-h-[120px]">
                              <span className="text-[13px] font-medium text-zinc-200 tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both" style={{ animationDelay: "0ms" }}>Structuring Policy...</span>
                              {progress > 25 && <span className="text-[13px] font-medium text-zinc-400 tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">Analyzing Clauses...</span>}
                              {progress > 50 && <span className="text-[13px] font-medium text-zinc-500 tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">Mapping Risk...</span>}
                              {progress > 75 && <span className="text-[13px] font-medium text-zinc-600 tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">Simulating Exposure...</span>}
                            </div>
                            <div className="w-full relative mt-[-10px]">
                              <Progress value={progress} className="h-0.5 bg-white/[0.04] [&>div]:bg-[#c8ff00]/50" />
                              <div className="absolute -top-7 right-0 text-[10px] font-semibold text-zinc-500 tracking-widest">{Math.round(progress)}%</div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════ INPUT BAR (sticky bottom) ═══════════ */}
            {hasStarted && (
              <div className="border-t border-white/[0.04] bg-[#0E1116]/80 backdrop-blur-xl relative z-20">
                <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">


                  {/* Main input */}
                  <div className="relative group/input">
                    <div className={`absolute -inset-0.5 rounded-2xl bg-[#c8ff00]/20 blur opacity-0 transition-opacity duration-500 will-change-[opacity] ${query.length > 0 ? "opacity-100" : "group-focus-within/input:opacity-50"}`} />
                    <div className="relative flex items-end gap-2 bg-[#14171C] border border-white/[0.06] rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.2)] focus-within:border-[#c8ff00]/40 focus-within:bg-[#1A1D24]">
                      {/* Text input */}
                      <div className="flex-1 flex flex-col justify-center min-h-[32px] pb-[1px]">
                        {file && !hasStarted && (
                          <div className="flex items-center gap-1.5 bg-[#c8ff00]/10 border border-[#c8ff00]/20 rounded-md px-2 py-1 text-[10px] sm:text-[11px] text-[#c8ff00] mb-1 shrink-0 w-fit animate-in fade-in slide-in-from-bottom-1">
                            <FileText className="w-3 h-3" />
                            <span className="max-w-[120px] sm:max-w-[200px] truncate">{file.name}</span>
                            <button onClick={() => { setFile(null); setJobId(null) }} className="text-[#c8ff00]/50 hover:text-[#c8ff00] transition-colors ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <textarea
                          ref={textareaRef}
                          className="w-full bg-transparent border-none text-[13px] sm:text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none resize-none font-light leading-relaxed min-h-[24px] max-h-[120px] focus:ring-0 peer py-1"
                          placeholder={!jobId ? "Attach a PDF first..." : "Ask Flow AI..."}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleSend()
                            }
                          }}
                          rows={1}
                          disabled={!jobId}
                        />
                      </div>

                      {/* Send */}
                      <button
                        disabled={!canSubmit}
                        onClick={() => handleSend()}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 relative overflow-hidden ${canSubmit
                          ? "bg-[#c8ff00] hover:bg-[#c8ff00] text-white shadow-[0_0_15px_rgba(200,255,0,0.3)]"
                          : "bg-transparent text-zinc-700 pointer-events-none"
                          }`}
                      >
                        <div className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${chatLoading ? "-translate-y-8" : "translate-y-0"}`}>
                          <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.5} />
                        </div>
                        <div className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${chatLoading ? "translate-y-0" : "translate-y-8"}`}>
                          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        </div>
                      </button>
                    </div>
                  </div>



                  {/* Bottom info bar */}
                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex items-center gap-2">
                      {file && (
                        <span className="text-[11px] text-zinc-600 font-medium tracking-wide">
                          {file.name} · {(file.size / (1024 * 1024)).toFixed(1)}MB
                          {analysisLoading && " · Processing..."}
                          {isCompleted && " · Ready"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {hasStarted && (
                        <button onClick={handleNewSession} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium">
                          New Session
                        </button>
                      )}
                      <div className="flex items-center gap-2 group cursor-default">
                        <div className="relative flex h-2 w-2 items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></span>
                        </div>
                        <div className="flex items-center gap-1.5 group-hover:hidden transition-all duration-200">
                          <span className="text-[10px] text-zinc-300 font-medium">System Ready</span>
                          <span className="text-[10px] text-zinc-600 font-medium">v2.4.0</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-semibold hidden group-hover:inline-block transition-all duration-200 tracking-wide">Flow AI – Institutional Beta</span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-2 text-red-400 text-[12px] font-medium bg-red-500/10 border border-red-500/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════ RIGHT SIDEBAR ═══════════ */}
          {isCompleted && report && (
            <AnalysisSidebar
              report={report}
              jobId={jobId}
              onSend={handleSend}
              onSetQuery={setQuery}
              onFocusInput={() => textareaRef.current?.focus()}
              className="hidden lg:flex w-[320px] border-l border-white/[0.06] bg-[#0A0C10]"
            />
          )}
        </div>

        {/* ═══════════ MOBILE ANALYSIS DRAWER ═══════════ */}
        {
          showMobileSidebar && isCompleted && report && (
            <div className="fixed inset-0 z-[100] lg:hidden animate-in fade-in duration-300">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
              <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-[#0A0C10] shadow-2xl border-l border-white/[0.06] flex flex-col animate-in slide-in-from-right duration-500">
                <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.04] bg-black/20">
                  <span className="text-[11px] font-bold text-zinc-400 tracking-widest uppercase">Policy Analysis</span>
                  <button onClick={() => setShowMobileSidebar(false)} className="p-1.5 rounded-lg bg-white/[0.03] text-zinc-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                  <AnalysisSidebar
                    report={report}
                    jobId={jobId}
                    onSend={(msg) => { handleSend(msg); setShowMobileSidebar(false) }}
                    onSetQuery={(q) => { setQuery(q); setShowMobileSidebar(false); textareaRef.current?.focus() }}
                    onFocusInput={() => { setShowMobileSidebar(false); textareaRef.current?.focus() }}
                    className="w-full h-full bg-[#0A0C10]"
                  />
                </div>
              </div>
            </div>
          )
        }
      </div >

      {/* ═══════════ FREE LIMIT MODAL ═══════════ */}
      {
        showLimitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[#111111] border border-white/[0.08] rounded-3xl max-w-md w-full p-8 text-center shadow-[0_0_60px_rgba(200,255,0,0.1)] relative overflow-hidden transform animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#c8ff00]/50 via-[#c8ff00] to-[#c8ff00]/50"></div>
              <div className="w-16 h-16 rounded-2xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-[#c8ff00]" />
              </div>
              <h3 className="text-2xl font-bold text-zinc-100 mb-3 tracking-tight">Free Limit Reached</h3>
              <p className="text-zinc-400 text-[15px] mb-8 leading-relaxed px-2">
                You{"'"}ve utilized your free limit. Many such AI features can be helpful for you on our web based insurance AI native CRM Flow.
              </p>
              <div className="flex flex-col gap-3">
                <a href="https://aetherlabs.in" target="_blank" rel="noopener noreferrer" className="relative group flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-mono font-bold uppercase tracking-widest transition-all duration-300 active:scale-[0.98]">
                  Try Flow for Free
                  <ArrowUp className="w-4 h-4 rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
                <button onClick={() => setShowLimitModal(false)} className="w-full py-3 bg-[#c8ff00] hover:bg-[#d4ff33] text-black font-mono font-bold text-[12px] uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(200,255,0,0.2)]">
                  I Understand
                </button>
              </div>
            </div>
          </div>
        )
      }

      <EmailCollectionModal
        isOpen={showEmailModal}
        onOpenChange={setShowEmailModal}
        isSubmitting={isEmailSubmitting}
        onSubmit={async (email) => {
          setIsEmailSubmitting(true)
          try {
            const res = await fetch("/api/save-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email })
            })
            if (res.ok) {
              localStorage.setItem("aetherlabs_email", email)
              setUserEmail(email)
              setShowEmailModal(false)
            }
          } catch (e) {
            console.error("Failed to save email", e)
          } finally {
            setIsEmailSubmitting(false)
          }
        }}
      />
    </Fragment >
  )
}

