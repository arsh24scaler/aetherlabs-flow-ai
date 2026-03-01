"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Paperclip, ArrowUp, FileText, ChevronRight, MessageSquare,
  Loader2, X, Download, AlertTriangle, CheckCircle2, BrainCircuit,
  Activity, Shield, Clock, Building2, DollarSign, BarChart3, Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

// ─────────────── Types ───────────────
interface PolicyMetadata {
  policyNumber?: string; premiumAmount?: string; insurerName?: string;
  policyType?: string; policyHolderName?: string; startDate?: string;
  expiryDate?: string; sumInsured?: string; deductibles?: string;
  [key: string]: unknown
}
interface ReportData {
  jobId: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  riskScore?: number; flags?: string[]; metadataJSON?: PolicyMetadata; error?: string
}
interface SimResult { covered: string; estimatedPayout?: string; outOfPocket?: string; clauseReference?: string }

type ChatMsg =
  | { role: "user"; text: string }
  | { role: "ai"; text: string }
  | { role: "system"; text: string; type: "upload" | "processing" | "complete" | "error" }
  | { role: "analysis"; report: ReportData }
  | { role: "simulation"; result: SimResult; scenario: string }

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
  const handleSend = async () => {
    if (!query.trim() || !jobId) return
    const msg = query.trim()
    setQuery("")
    setChatLoading(true)
    setChatHistory(prev => [...prev, { role: "user", text: msg }])

    try {
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

  // ─── Helpers ───
  const riskScore = report?.riskScore || 0
  const riskColor = riskScore >= 70 ? "text-red-400" : riskScore >= 40 ? "text-amber-400" : "text-emerald-400"
  const riskBg = riskScore >= 70 ? "bg-red-500/10 border-red-500/20" : riskScore >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">

      {/* ═══════════ CONVERSATION AREA ═══════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 w-full">

          {/* ─── EMPTY STATE / HERO ─── */}
          {!hasStarted && (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] animate-in fade-in duration-500">
              <div className="text-center space-y-3 mb-10">
                <h1 className="text-3xl md:text-4xl font-semibold text-zinc-100 tracking-tight">
                  Policy Intelligence Engine
                </h1>
                <p className="text-zinc-500 text-[16px] font-light tracking-wide max-w-lg mx-auto">
                  Attach a policy PDF to begin. Ask questions, run simulations, and export reports — all in one canvas.
                </p>
              </div>

              {/* Quick action pills */}
              <div className="flex flex-wrap justify-center gap-2 mb-10">
                {["What does this policy cover?", "Analyze liability limits", "Check flood exclusions", "Simulate a claim"].map((label) => (
                  <button
                    key={label}
                    onClick={() => setQuery(label)}
                    className="px-4 py-2 rounded-full border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-all text-[13px] text-zinc-500 hover:text-zinc-300 font-medium tracking-wide"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="w-full max-w-md">
                <h3 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3 px-1">Recent</h3>
                <div className="space-y-1">
                  <div className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.02] cursor-pointer transition-colors border border-transparent hover:border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/15">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-zinc-300">Commercial_GL_2023.pdf</p>
                        <p className="text-[11px] text-zinc-600">Analyzed 2 hours ago</p>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.02] cursor-pointer transition-colors border border-transparent hover:border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/15">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-zinc-300">Cyber Policy Risk Assessment</p>
                        <p className="text-[11px] text-zinc-600">Clause 4.2 deep-dive</p>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
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
                    <div key={idx} className="flex justify-end py-2">
                      <div className="max-w-[80%] bg-indigo-500/15 border border-indigo-500/20 rounded-2xl rounded-br-md px-4 py-3">
                        <p className="text-[14px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  )
                }

                // ── AI replies ──
                if (msg.role === "ai") {
                  return (
                    <div key={idx} className="flex justify-start py-2">
                      <div className="flex gap-3 max-w-[85%]">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl rounded-tl-md px-4 py-3">
                          <p className="text-[14px] text-zinc-300 leading-[1.8] whitespace-pre-wrap font-light">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  )
                }

                // ── Analysis Card ──
                if (msg.role === "analysis") {
                  const r = msg.report
                  const m = r.metadataJSON || {} as PolicyMetadata
                  const rs = r.riskScore || 0
                  const fl = r.flags || []
                  const rc = rs >= 70 ? "text-red-400" : rs >= 40 ? "text-amber-400" : "text-emerald-400"
                  const rb = rs >= 70 ? "bg-red-500/10 border-red-500/20" : rs >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"

                  return (
                    <div key={idx} className="py-4">
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <div className="flex-1 space-y-4 min-w-0">

                          {/* Metric row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className={`p-3 rounded-xl border ${rb}`}>
                              <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Risk</span>
                              <span className={`text-lg font-semibold ${rc}`}>{rs}<span className="text-[11px] text-zinc-600">/100</span></span>
                            </div>
                            <div className="p-3 rounded-xl border border-white/[0.06] bg-[#111111]">
                              <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Premium</span>
                              <span className="text-[13px] font-medium text-zinc-200">{m.premiumAmount || "N/A"}</span>
                            </div>
                            <div className="p-3 rounded-xl border border-white/[0.06] bg-[#111111]">
                              <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Insurer</span>
                              <span className="text-[12px] font-medium text-zinc-200 truncate block">{m.insurerName || "N/A"}</span>
                            </div>
                            <div className="p-3 rounded-xl border border-white/[0.06] bg-[#111111]">
                              <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Sum Insured</span>
                              <span className="text-[12px] font-medium text-zinc-200">{m.sumInsured || "N/A"}</span>
                            </div>
                          </div>

                          {/* Summary */}
                          <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2.5">
                              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Summary</span>
                            </div>
                            <p className="text-[13px] text-zinc-400 leading-[1.8] font-light">
                              <span className="text-zinc-200 font-medium">{m.policyType || "Standard"}</span> policy by <span className="text-zinc-200 font-medium">{m.insurerName || "insurer"}</span>.
                              Coverage at <span className="text-zinc-200 font-medium">{m.sumInsured || "unstated"}</span>, deductibles of <span className="text-zinc-200 font-medium">{m.deductibles || "standard terms"}</span>.
                              Effective {m.startDate || "N/A"} to {m.expiryDate || "N/A"}.
                              Risk score <span className={`font-semibold ${rc}`}>{rs}/100</span>.
                            </p>
                          </div>

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
                            <a href={`/api/export/word?jobId=${jobId}`} download>
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
                <div className="flex justify-center py-3">
                  <div className="flex items-center gap-3 bg-zinc-800/30 border border-white/[0.04] rounded-full px-4 py-2">
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    <div className="w-24">
                      <Progress value={progress} className="h-1" />
                    </div>
                    <span className="text-[11px] text-zinc-500">{Math.round(progress)}%</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ INPUT BAR (sticky bottom) ═══════════ */}
      <div className="border-t border-white/[0.04] bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4 py-3">

          {/* Simulation bar — only visible after analysis is done */}
          {isCompleted && (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 bg-[#111111] border border-white/[0.06] rounded-xl px-3 py-2">
                <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <input
                  className="flex-1 bg-transparent border-none text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none font-light"
                  placeholder="Simulate a scenario (e.g. roof damage from storm)"
                  value={simScenario}
                  onChange={e => setSimScenario(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSimulate()}
                />
                <button
                  disabled={simLoading || !simScenario.trim()}
                  onClick={handleSimulate}
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors px-2"
                >
                  {simLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Run"}
                </button>
              </div>
            </div>
          )}

          {/* Main input */}
          <div className="flex items-end gap-2">
            {/* Attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${file ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20" : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-white/[0.06]"
                }`}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input type="file" className="hidden" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} />

            {/* Text input */}
            <div className="flex-1 bg-[#111111] border border-white/[0.06] rounded-xl px-4 py-2.5 flex items-end gap-2 focus-within:border-indigo-500/30 transition-colors">
              {file && !hasStarted && (
                <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-1 text-[11px] text-indigo-300 mb-0.5 shrink-0">
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[100px] truncate">{file.name}</span>
                  <button onClick={() => { setFile(null); setJobId(null) }} className="text-indigo-400/50 hover:text-indigo-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent border-none text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none resize-none font-light leading-relaxed min-h-[24px] max-h-[160px]"
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
              onClick={handleSend}
              className="w-9 h-9 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white
                flex items-center justify-center transition-all duration-200 shrink-0 shadow-sm"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* Bottom info bar */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2">
              {file && (
                <span className="text-[11px] text-zinc-600">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(1)}MB
                  {analysisLoading && " · Processing..."}
                  {isCompleted && " · Ready"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasStarted && (
                <button onClick={handleNewSession} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                  New Session
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shadow-[0_0_4px_rgba(16,185,129,0.3)]" />
                <span className="text-[10px] text-zinc-700">v2.4.0</span>
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
  )
}
