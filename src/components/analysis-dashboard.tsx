"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Download, AlertTriangle, MessageSquare, Briefcase, FileText, CheckCircle2, XCircle, BrainCircuit, Activity } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

interface PolicyMetadata {
  policyNumber?: string;
  premiumAmount?: string;
  insurerName?: string;
  policyType?: string;
  policyHolderName?: string;
  startDate?: string;
  expiryDate?: string;
  sumInsured?: string;
  deductibles?: string;
  [key: string]: unknown; // fallback for other fields
}

interface ReportData {
  jobId: string
  status: JobStatus
  riskScore?: number
  flags?: string[]
  metadataJSON?: PolicyMetadata
  error?: string
}

export function AnalysisDashboard() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)

  // Simulation state
  const [simScenario, setSimScenario] = useState("")
  const [simLoading, setSimLoading] = useState(false)
  const [simResult, setSimResult] = useState<unknown>(null)

  useEffect(() => {
    if (!jobId) {
      setLoading(false)
      return
    }

    // Initial progress
    let currentProgress = 10

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`)
        const data = await res.json()

        if (res.ok) {
          setReport(data)
          if (data.status === "COMPLETED") {
            setProgress(100)
            setLoading(false)
            clearInterval(intervalId)
          } else if (data.status === "FAILED") {
            setLoading(false)
            clearInterval(intervalId)
          } else {
            // Processing/Pending
            currentProgress = Math.min(currentProgress + Math.random() * 15, 90)
            setProgress(currentProgress)
          }
        }
      } catch (err) {
        console.error("Poller error", err)
      }
    }

    pollStatus()
    const intervalId = setInterval(pollStatus, 4000)

  }, [jobId])

  if (!jobId) {
    return <div className="text-center font-mono py-20 text-muted-foreground">No Job ID provided. Return to home to upload a PDF.</div>
  }

  if (loading || report?.status === "PENDING" || report?.status === "PROCESSING") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
        <div className="text-center space-y-4 max-w-sm w-full">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
          <h2 className="text-2xl font-semibold tracking-tight">Analyzing Policy</h2>
          <p className="text-muted-foreground">Extracting intelligence, scoring risk profiles, and analyzing exclusions. Hang tight.</p>
          <Progress value={progress} className="w-full h-2" />
        </div>
      </div>
    )
  }

  if (report?.status === "FAILED") {
    return (
      <Card className="max-w-xl mx-auto border-destructive/50 bg-destructive/10">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <XCircle className="w-6 h-6" /> Processing Failed
          </CardTitle>
          <CardDescription>We encountered an issue while analyzing this document.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-mono bg-background p-4 rounded-md border">{report?.error || "Unknown error occurred"}</p>
        </CardContent>
      </Card>
    )
  }

  const { metadataJSON = {}, riskScore = 0, flags = [] } = report || {}

  const handleSimulate = async () => {
    if (!simScenario.trim()) return
    setSimLoading(true)
    setSimResult(null)
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, scenario: simScenario })
      })
      const data = await res.json()
      if (res.ok) setSimResult(data)
      else alert(data.error || 'Simulation failed')
    } catch (e: unknown) {
      const error = e as Error
      alert(error.message)
    } finally {
      setSimLoading(false)
    }
  }

  const sim = simResult as {
    covered: string;
    estimatedPayout?: string;
    outOfPocket?: string;
    clauseReference?: string;
  } | null;

  return (
    <div className="space-y-8 fade-in duration-500 animate-in pt-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-white/10 rounded-lg bg-zinc-900 shadow-sm">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Analysis complete</h1>
          </div>
          <p className="text-zinc-500 font-light tracking-wide mt-1 max-w-2xl">
            {metadataJSON.policyNumber || "Document parsed and structured."} • {metadataJSON.policyHolderName || "Unknown Assured"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" asChild>
            <a href={`/api/export/excel?jobId=${jobId}`} download>
              <Download className="w-4 h-4 mr-2" /> Export Data
            </a>
          </Button>
          <Button variant="default" size="sm" className="bg-zinc-100 text-zinc-900 hover:bg-white font-medium" asChild>
            <a href={`/api/export/word?jobId=${jobId}`} download>
              <Download className="w-4 h-4 mr-2" /> Download Report
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Structural Data */}
        <div className="lg:col-span-7 space-y-8">

          {/* Policy Metadata */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase">Policy Metadata</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-white/5 bg-[#111111]">
                <span className="block text-[12px] text-zinc-500 mb-1">Risk Score</span>
                <span className="text-xl font-medium text-zinc-100">{riskScore}/100</span>
              </div>
              <div className="p-4 rounded-xl border border-white/5 bg-[#111111]">
                <span className="block text-[12px] text-zinc-500 mb-1">Premium</span>
                <span className="text-[15px] font-medium text-zinc-100 break-words">{metadataJSON.premiumAmount || "N/A"}</span>
              </div>
              <div className="p-4 rounded-xl border border-white/5 bg-[#111111] md:col-span-2">
                <span className="block text-[12px] text-zinc-500 mb-1">Insurer</span>
                <span className="text-[15px] font-medium text-zinc-100 truncate block">{metadataJSON.insurerName || "Unknown"}</span>
              </div>
            </div>
          </section>

          {/* Coverage Summary */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase">Coverage Summary</h3>
            <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
                <div className="p-5 space-y-1">
                  <span className="block text-[12px] text-zinc-500">Sum Insured Limit</span>
                  <span className="block text-[15px] font-medium text-zinc-100">{metadataJSON.sumInsured || "Not Stated"}</span>
                </div>
                <div className="p-5 space-y-1">
                  <span className="block text-[12px] text-zinc-500">Deductibles</span>
                  <span className="block text-[15px] font-medium text-zinc-100">{metadataJSON.deductibles || "Not Stated"}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x border-t divide-white/5 border-white/5">
                <div className="p-5 space-y-1">
                  <span className="block text-[12px] text-zinc-500">Start Date</span>
                  <span className="block text-[15px] font-medium text-zinc-100">{metadataJSON.startDate || "N/A"}</span>
                </div>
                <div className="p-5 space-y-1">
                  <span className="block text-[12px] text-zinc-500">Expiry / Renewal</span>
                  <span className="block text-[15px] font-medium text-zinc-100">{metadataJSON.expiryDate || "N/A"}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Key Clauses */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase">Key Clauses</h3>
            <div className="rounded-xl border border-white/5 bg-[#111111] p-6 space-y-6 text-[14px]">
              <div className="space-y-1">
                <span className="text-zinc-400">Policy Type</span>
                <p className="text-zinc-100 font-medium">{metadataJSON.policyType || "Unknown Type"}</p>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="space-y-1">
                <span className="text-zinc-400">Insured Entity</span>
                <p className="text-zinc-100 font-medium">{metadataJSON.policyHolderName || "Not specified"}</p>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column - Intelligence */}
        <div className="lg:col-span-5 space-y-8">

          {/* AI Summary */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-indigo-400" /> Executive Summary
            </h3>
            <div className="p-5 rounded-xl border border-white/5 bg-[#111111]">
              <p className="text-[14px] text-zinc-300 leading-relaxed font-light">
                This document represents a {metadataJSON.policyType || 'standard'} insurance policy issued by {metadataJSON.insurerName || 'the insurer'}.
                Coverage limits sit at {metadataJSON.sumInsured || 'an unstated amount'}, accompanied by standard deductibles.
                Our reasoning engine indicates a risk score of {riskScore}/100 based on clause evaluations. Monitor key exclusions regarding structural limits.
              </p>
            </div>
          </section>

          {/* Risk Flags */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Risk Flags
            </h3>
            <div className="rounded-xl border border-amber-500/10 bg-[#111111] p-5">
              {flags.length === 0 ? (
                <div className="flex items-center gap-2 text-zinc-400 text-[14px]">
                  <CheckCircle2 className="w-4 h-4 text-zinc-500" /> No critical risk flags detected during pass.
                </div>
              ) : (
                <ul className="space-y-3">
                  {flags.map((flag: string, idx: number) => (
                    <li key={idx} className="flex gap-3 text-[14px] leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                      <span className="text-amber-500/90">{flag}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Scenario Simulator */}
          <section className="space-y-4">
            <h3 className="text-[13px] font-semibold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" /> Scenario Simulator
            </h3>
            <div className="rounded-xl border border-white/5 bg-[#111111] p-5 space-y-5">
              <div className="space-y-3">
                <label className="text-[13px] text-zinc-400">Describe an event to simulate coverage logic.</label>
                <div className="flex gap-2">
                  <Input
                    className="bg-black/50 border-white/10 text-[14px] h-10 placeholder:text-zinc-600 focus-visible:ring-indigo-500/30"
                    placeholder="e.g. Broken roof caused by fallen tree."
                    value={simScenario}
                    onChange={e => setSimScenario(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSimulate()}
                  />
                  <Button
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 h-10 px-4 transition-colors"
                    onClick={handleSimulate}
                    disabled={simLoading || !simScenario}
                  >
                    {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run"}
                  </Button>
                </div>
              </div>

              {sim && (
                <div className="pt-4 border-t border-white/5 space-y-4 slide-in-from-top-2 animate-in duration-300">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-zinc-400">Status</span>
                    <span className={`text-[13px] font-medium px-2.5 py-1 rounded-md ${sim.covered === 'Yes' ? 'bg-zinc-800 text-zinc-100' :
                      sim.covered === 'Conditional' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                      {sim.covered}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[12px] text-zinc-500 mb-1">Estimated Payout</span>
                      <span className="text-[14px] font-medium text-zinc-100">{sim.estimatedPayout || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-zinc-500 mb-1">Out of Pocket</span>
                      <span className="text-[14px] font-medium text-zinc-100">{sim.outOfPocket || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-black/40 rounded-lg border border-white/5 text-[12px]">
                    <span className="block text-zinc-500 mb-1">Triggered Clause</span>
                    <span className="text-zinc-300 italic">{sim.clauseReference || 'None discovered'}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
