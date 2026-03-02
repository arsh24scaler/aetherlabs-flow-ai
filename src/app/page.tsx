"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Paperclip, ArrowUp, FileText, ChevronRight, MessageSquare,
  Loader2, X, Download, AlertTriangle, CheckCircle2, BrainCircuit,
  Activity, Shield, Clock, Building2, DollarSign, BarChart3, Sparkles, Pencil, Zap
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import ReactMarkdown from "react-markdown"
import { toPng } from "html-to-image"
import { AetherLabsIcon } from "@/components/AetherLabsIcon"
import { EmailCollectionModal } from "@/components/email-collection-modal"

// ─────────────── Types ───────────────
interface PolicyMetadata {
  policyNumber?: string; premiumAmount?: string; insurerName?: string;
  policyType?: string; policyHolderName?: string; startDate?: string;
  expiryDate?: string; sumInsured?: string; deductibles?: string;
  suggestedQuestions?: string[];
  [key: string]: unknown
}
interface ReportData {
  jobId: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  riskScore?: number; flags?: string[]; metadata?: PolicyMetadata; error?: string
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
        p: ({ node, ...props }) => <p className="mb-3 last:mb-0 whitespace-pre-wrap" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1 mb-3 last:mb-0" {...props} />,
        li: ({ node, ...props }) => <li className="text-zinc-300" {...props} />
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
};

// ─────────────── Main Component ───────────────
export default function Home() {
  // File + Job state
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const snapshotRef = useRef<HTMLDivElement>(null)

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

  // Email Modal state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)

  // Derived
  const isCompleted = report?.status === "COMPLETED"
  const hasStarted = chatHistory.length > 0
  const canSubmit = !!jobId && query.trim().length > 0 && !chatLoading

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px"
    }
  }, [query])

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
      setChatHistory(prev => [...prev, { role: "system", text: "Policy uploaded. Analyzing in background — you can start asking questions now.", type: "processing" }])
    } catch (err: unknown) {
      setError((err as Error).message)
      setIsUploading(false)
      setChatHistory(prev => [...prev, { role: "system", text: (err as Error).message, type: "error" }])
    }
  }

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
            setChatHistory(prev => [
              ...prev,
              { role: "system", text: "Analysis complete.", type: "complete" },
              { role: "analysis", report: data }
            ])
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
          setChatHistory(prev => [...prev, { role: "ai", text: `Simulation error: ${data.error}` }])
        }
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, message: msg })
        })
        const data = await res.json()
        if (res.ok) {
          setChatHistory(prev => [...prev, { role: "ai", text: data.reply }])
        } else {
          setChatHistory(prev => [...prev, { role: "ai", text: `Error: ${data.error}` }])
        }
      }
    } catch (e: unknown) {
      setChatHistory(prev => [...prev, { role: "ai", text: `System Error: ${(e as Error).message}` }])
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
    <>
      <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

        {/* ═══════════ CONVERSATION AREA ═══════════ */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 w-full">

            {/* ─── EMPTY STATE / HERO ─── */}
            {!hasStarted && (
              <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)] pt-12 animate-in fade-in duration-700">
                <div className="text-center space-y-4 mb-10">
                  <h1 className="text-4xl md:text-5xl lg:text-5xl font-semibold text-zinc-100 tracking-tight leading-tight max-w-3xl mx-auto">
                    Decode Insurance Policies <br />
                    with Structured <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-indigo-200 to-zinc-100 bg-[length:200%_auto] animate-[gradient-shimmer_8s_ease_infinite]">Intelligence.</span>
                  </h1>

                  <div className="text-zinc-500 text-[15px] font-light tracking-wide max-lg mx-auto flex flex-col items-center gap-2.5 mt-8">
                    <span className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both text-zinc-400" style={{ animationDelay: "150ms" }}>Attach a policy PDF.</span>
                    <span className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both text-zinc-400" style={{ animationDelay: "300ms" }}>Ask questions.</span>
                    <span className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both text-zinc-400" style={{ animationDelay: "450ms" }}>Run simulations.</span>
                    <span className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both text-zinc-400" style={{ animationDelay: "600ms" }}>Export structured reports.</span>
                  </div>
                </div>

                {/* Quick action pills */}
                <div className="flex flex-wrap justify-center gap-3 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 fill-mode-both" style={{ animationDelay: "800ms" }}>
                  {["What does this policy cover?", "Analyze liability limits", "Check flood exclusions", "Generate me a premium-breakdown excel report"].map((label, idx) => (
                    <button
                      key={label}
                      onClick={() => setQuery(label)}
                      className="px-4 py-2.5 rounded-full border border-white/[0.04] bg-[#14171C] hover:bg-[#1A1D24] shadow-[0_4px_10px_rgba(0,0,0,0.1)] hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:border-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 text-[13px] text-zinc-400 hover:text-zinc-200 font-medium tracking-wide group animate-[float_4s_ease-in-out_infinite]"
                      style={{ animationDelay: `${(idx * 0.4).toFixed(2)}s` }}
                    >
                      {label}
                    </button>
                  ))}
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
                        <div className={`flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full border ${msg.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          msg.type === "complete" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            msg.type === "upload" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300" :
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
                          <div className="max-w-[80%] bg-indigo-500/15 border border-indigo-500/20 rounded-2xl rounded-br-md px-4 py-3">
                            <p className="text-[14px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
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
                    const dynamicExcelMatch = msg.text.match(/\[ACTION:DYNAMIC_EXCEL:\s*"([^"]+)"\]/)
                    const dynamicExcelQuery = dynamicExcelMatch ? dynamicExcelMatch[1] : null

                    // Extract dynamic pdf query if present
                    // Extract dynamic pdf query if present
                    const dynamicPdfMatch = msg.text.match(/\[ACTION:DYNAMIC_PDF:\s*"([^"]+)"\]/)
                    const dynamicPdfQuery = dynamicPdfMatch ? dynamicPdfMatch[1] : null

                    // Extract dynamic word query if present
                    const dynamicWordMatch = msg.text.match(/\[ACTION:DYNAMIC_WORD:\s*"([^"]+)"\]/)
                    const dynamicWordQuery = dynamicWordMatch ? dynamicWordMatch[1] : null

                    const cleanText = msg.text
                      .replace(/\[ACTION:EXPORT_EXCEL\]/g, "")
                      .replace(/\[ACTION:EXPORT_PDF\]/g, "")
                      .replace(/\[ACTION:DYNAMIC_EXCEL:\s*"[^"]+"\]/g, "")
                      .replace(/\[ACTION:DYNAMIC_PDF:\s*"[^"]+"\]/g, "")
                      .replace(/\[ACTION:DYNAMIC_WORD:\s*"[^"]+"\]/g, "")
                      .trim()

                    return (
                      <div key={idx} className="flex justify-start py-2">
                        <div className="flex gap-3 max-w-[85%]">
                          <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                          <div className="space-y-3">
                            <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-md px-4 py-3">
                              <div className="text-[14px] text-zinc-300 leading-[1.8] font-light">
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
                                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[13px] font-semibold hover:bg-indigo-500/20 transition-colors">
                                      <Download className="w-4 h-4" /> Download Standard PDF
                                    </button>
                                  </a>
                                )}
                                {dynamicPdfQuery && (
                                  <a href={`/api/export/dynamic-pdf?jobId=${jobId}&query=${encodeURIComponent(dynamicPdfQuery)}`} download>
                                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[13px] font-semibold hover:bg-indigo-500/20 transition-colors">
                                      <Download className="w-4 h-4" /> Download Custom PDF
                                    </button>
                                  </a>
                                )}
                                {dynamicWordQuery && (
                                  <a href={`/api/export/dynamic-word?jobId=${jobId}&query=${encodeURIComponent(dynamicWordQuery)}`} download>
                                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[13px] font-semibold hover:bg-blue-500/20 transition-colors">
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
                    const fl = r.flags || []
                    const rc = rs >= 70 ? "text-red-400" : rs >= 40 ? "text-amber-400" : "text-emerald-400"
                    const rb = rs >= 70 ? "bg-red-500/10 border-red-500/20" : rs >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                    const riskLabel = rs >= 70 ? "High Risk" : rs >= 40 ? "Moderate Risk" : "Low Risk"

                    // Display missing fields as "Not Specified" rather than dropping them
                    const validRows = (rows: { label: string, value: unknown }[]) => rows.map((row) => {
                      const isEmpty = !row.value || String(row.value) === "N/A" || String(row.value) === "null" || String(row.value).trim() === ""
                      return { label: row.label, value: isEmpty ? "Not Specified" : row.value }
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

                    const hasSnapshotData = personalInfo.length > 0 || policyDetails.length > 0 || financials.length > 0

                    return (
                      <div key={idx} className="py-4">
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                          <div className="flex-1 space-y-4 min-w-0">

                            {/* Header row with risk score */}
                            <div className="flex items-center gap-3">
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${rb}`}>
                                <BarChart3 className={`w-4 h-4 ${rc}`} />
                                <span className={`text-lg font-bold ${rc}`}>{rs}</span>
                                <span className="text-[11px] text-zinc-600">/100</span>
                                <span className={`text-[11px] font-semibold ${rc} ml-1`}>{riskLabel}</span>
                              </div>
                              {m.policyType && (
                                <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                  {String(m.policyType)}
                                </span>
                              )}
                            </div>

                            {/* Beautiful Policy Snapshot Card */}
                            {hasSnapshotData && (
                              <div className="flex justify-start">
                                <div className="relative group w-full">
                                  <button
                                    onClick={handleExportSnapshot}
                                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center px-3 py-1.5 rounded-md bg-[#222222] border border-white/[0.08] hover:bg-zinc-800 text-[11px] text-zinc-300 font-medium"
                                    title="Export as Image"
                                  >
                                    <Download className="w-3 h-3 mr-1.5" /> Save Image
                                  </button>
                                  <div ref={snapshotRef} className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl relative">
                                    {/* Decorative faint glow */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/[0.03] rounded-full blur-[80px] pointer-events-none" />
                                    <div className="px-5 py-4 border-b border-white/[0.04] bg-gradient-to-r from-indigo-500/10 via-[#111111] to-[#111111] flex items-center gap-2.5">
                                      <Shield className="w-4 h-4 text-indigo-400" />
                                      <span className="text-[13px] font-semibold text-zinc-200 uppercase tracking-widest">Policy Snapshot</span>
                                      <span className="text-[11px] text-zinc-500 ml-2 border-l border-white/[0.1] pl-3">AetherLabs AI Extracted</span>
                                    </div>
                                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                      {personalInfo.length > 0 && (
                                        <div className="space-y-3">
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.04] pb-1 cursor-default">Personal Information</h4>
                                          <div className="space-y-2.5">
                                            {personalInfo.map((row, i) => (
                                              <div key={i} className="flex flex-col">
                                                <span className="text-[11px] text-zinc-500 font-medium">{row.label}</span>
                                                <span className="text-[13.5px] text-zinc-100 font-semibold">{String(row.value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {financials.length > 0 && (
                                        <div className="space-y-3">
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.04] pb-1 cursor-default">Financials</h4>
                                          <div className="space-y-2.5">
                                            {financials.map((row, i) => (
                                              <div key={i} className="flex flex-col">
                                                <span className="text-[11px] text-zinc-500 font-medium">{row.label}</span>
                                                <span className="text-[13.5px] text-emerald-400 font-semibold">{String(row.value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {policyDetails.length > 0 && (
                                        <div className="space-y-3 md:col-span-2">
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.04] pb-1 cursor-default">Policy Details</h4>
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {policyDetails.map((row, i) => (
                                              <div key={i} className="flex flex-col">
                                                <span className="text-[11px] text-zinc-500 font-medium">{row.label}</span>
                                                <span className="text-[12px] text-zinc-200 mt-0.5">{String(row.value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Risk Flags */}
                            {fl.length > 0 && (
                              <div className="bg-[#111111] border border-amber-500/10 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Risk Flags</span>
                                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">{fl.length}</span>
                                </div>
                                <ul className="space-y-2">
                                  {fl.map((f, i) => (
                                    <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-[7px] shrink-0" />
                                      <span className="text-amber-400/90">{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Export buttons */}
                            <div className="flex items-center gap-2">
                              <a href={`/api/export/excel?jobId=${jobId}`} download>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-[#111111] hover:bg-zinc-800 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors">
                                  <Download className="w-3 h-3" /> Excel
                                </button>
                              </a>
                              <a href={`/api/export/pdf?jobId=${jobId}`} download>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-[#111111] hover:bg-zinc-800 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors">
                                  <Download className="w-3 h-3" /> PDF Report
                                </button>
                              </a>
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
                            <Activity className="w-3.5 h-3.5 text-indigo-400" />
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

                {/* Typing indicator */}
                {chatLoading && (
                  <div className="flex justify-start py-2">
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
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
                        <div className="absolute inset-2 rounded-full border border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ animationDelay: "1s" }} />
                        <div className="absolute inset-4 rounded-full border border-white/[0.06] animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ animationDelay: "2s" }} />
                        <div className="w-12 h-12 rounded-[14px] bg-gradient-to-b from-[#1A1D24] to-[#14171C] border border-white/[0.08] shadow-[0_0_30px_rgba(99,102,241,0.15)] flex items-center justify-center relative z-10">
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
                        <Progress value={progress} className="h-0.5 bg-white/[0.04] [&>div]:bg-indigo-500/50" />
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

        {/* ═══════════ INPUT BAR (sticky bottom) ═══════════ */}
        <div className="border-t border-white/[0.04] bg-[#0E1116]/80 backdrop-blur-xl relative z-20">
          <div className="max-w-3xl mx-auto px-4 py-4">

            {/* Quick Actions / Suggestions */}
            {isCompleted && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setQuery("sim: simulate a claim where "); textareaRef.current?.focus() }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-[12px] text-emerald-300 transition-colors"
                  >
                    <Activity className="w-3 h-3 text-emerald-400" />
                    Simulate Claim
                  </button>
                  {report?.metadata?.suggestedQuestions?.slice(0, 3).map((sq: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sq)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-[12px] text-indigo-300 transition-colors text-left"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate max-w-[200px]">{sq}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main input */}
            <div className="relative group/input">
              <div className={`absolute -inset-0.5 rounded-2xl bg-indigo-500/20 blur opacity-0 transition-opacity duration-500 will-change-[opacity] ${query.length > 0 ? "opacity-100" : "group-focus-within/input:opacity-50"}`} />
              <div className="relative flex items-end gap-2 bg-[#14171C] border border-white/[0.06] rounded-2xl px-3 py-2.5 transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.2)] focus-within:border-indigo-500/40 focus-within:bg-[#1A1D24]">
                {/* Attach */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 relative overflow-hidden ${file ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20" : "bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    }`}
                >
                  <Paperclip className={`w-[18px] h-[18px] transition-transform duration-500 ${isUploading ? "-translate-y-8 opacity-0" : "translate-y-0 opacity-100"}`} />
                  <Loader2 className={`w-[18px] h-[18px] absolute inset-0 m-auto animate-spin transition-all duration-500 ${isUploading ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"}`} />
                </button>
                <input type="file" className="hidden" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} />

                {/* Text input */}
                <div className="flex-1 flex flex-col justify-center min-h-[36px] pb-[1px]">
                  {file && !hasStarted && (
                    <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-1 text-[11px] text-indigo-300 mb-1 shrink-0 w-fit animate-in fade-in slide-in-from-bottom-1">
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[150px] truncate">{file.name}</span>
                      <button onClick={() => { setFile(null); setJobId(null) }} className="text-indigo-400/50 hover:text-indigo-300 transition-colors ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    className="w-full bg-transparent border-none text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none resize-none font-light leading-relaxed min-h-[22px] max-h-[160px] custom-scrollbar focus:ring-0 peer"
                    placeholder={!jobId ? "Attach a PDF first to start..." : "Ask about coverage, risks, clauses..."}
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
                    ? "bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
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
      </div>

      {/* ═══════════ EMAIL COLLECTION MODAL (AI AESTHETIC) ═══════════ */}
      <EmailCollectionModal
        isOpen={showEmailModal}
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
    </>
  )
}
