"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Download, AlertTriangle, MessageSquare, Briefcase, FileText, CheckCircle2, XCircle } from "lucide-react"

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

  // Chat state
  const [chatMessage, setChatMessage] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

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

    return () => clearInterval(intervalId)
  }, [jobId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

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

  const handleChat = async () => {
    if (!chatMessage.trim()) return
    const currentMsg = chatMessage
    setChatMessage("")
    setChatLoading(true)
    setChatHistory(prev => [...prev, { role: 'user', text: currentMsg }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, message: currentMsg })
      })
      const data = await res.json()
      if (res.ok) {
        setChatHistory(prev => [...prev, { role: 'ai', text: data.reply }])
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${data.error}` }])
      }
    } catch (e: unknown) {
      const error = e as Error
      setChatHistory(prev => [...prev, { role: 'ai', text: `System Error: ${error.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="space-y-6 fade-in duration-500 animate-in pt-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Intelligence Report</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <FileText className="w-4 h-4" /> {metadataJSON.policyNumber || "Policy Document"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/export/excel?jobId=${jobId}`} download>
                <Download className="w-4 h-4 mr-2" /> Excel List
            </a>
          </Button>
          <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700" asChild>
            <a href={`/api/export/word?jobId=${jobId}`} download>
                <Download className="w-4 h-4 mr-2" /> Word Report
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col - Data */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Risk Score</CardDescription>
                <CardTitle className={`text-3xl ${riskScore > 70 ? 'text-destructive' : riskScore > 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                  {riskScore}
                  <span className="text-sm text-muted-foreground">/100</span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Premium</CardDescription>
                <CardTitle className="text-xl break-words">{metadataJSON.premiumAmount || "N/A"}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardDescription>Insurer</CardDescription>
                <CardTitle className="text-xl flex items-center gap-2 truncate">
                  <Briefcase className="w-5 h-5 text-muted-foreground" />
                  {metadataJSON.insurerName || "Unknown"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Extracted Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-sm">
                <div>
                  <dt className="text-muted-foreground font-medium">Policy Type</dt>
                  <dd className="font-medium mt-1">{metadataJSON.policyType}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Policy Holder</dt>
                  <dd className="font-medium mt-1">{metadataJSON.policyHolderName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Start Date</dt>
                  <dd className="font-medium mt-1">{metadataJSON.startDate}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Expiry / Renewal</dt>
                  <dd className="font-medium mt-1">{metadataJSON.expiryDate}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground font-medium">Sum Insured Limit</dt>
                  <dd className="font-medium mt-1">{metadataJSON.sumInsured || "Not Stated"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground font-medium">Deductibles</dt>
                  <dd className="font-medium mt-1">{metadataJSON.deductibles}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" /> Risk Flags & Exclusions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {flags.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle2 className="w-5 h-5" /> No critical risk flags detected.
                </div>
              ) : (
                <ul className="space-y-2">
                  {flags.map((flag: string, idx: number) => (
                    <li key={idx} className="flex gap-3 bg-destructive/5 p-3 rounded-md text-sm leading-relaxed border border-destructive/10">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col - Interact Tools */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-blue-50/50 dark:bg-blue-900/10 border-b">
              <CardTitle className="text-lg text-blue-700 dark:text-blue-400">Claim Simulator</CardTitle>
              <CardDescription>Describe a scenario to see if you are covered and estimate payouts.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Input 
                   placeholder="e.g. Tree fell on my garage and broke roof." 
                   value={simScenario} 
                   onChange={e => setSimScenario(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleSimulate()}
                />
                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleSimulate} disabled={simLoading || !simScenario}>
                  {simLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Simulate Claim"}
                </Button>
              </div>

              {sim && (
                <div className="bg-secondary p-4 rounded-lg text-sm space-y-3 border shadow-inner">
                   <div className="flex justify-between items-start">
                     <span className="font-semibold text-muted-foreground">Coverage Status:</span>
                     <Badge variant={sim.covered === 'Yes' ? 'default' : sim.covered === 'Conditional' ? 'secondary' : 'destructive'}>
                       {sim.covered}
                     </Badge>
                   </div>
                   <div className="grid grid-cols-2 gap-4 mt-2">
                     <div>
                       <span className="block text-xs text-muted-foreground mb-1">AI Payout Est.</span>
                       <span className="font-medium">{sim.estimatedPayout || 'N/A'}</span>
                     </div>
                     <div>
                       <span className="block text-xs text-muted-foreground mb-1">Out of Pocket</span>
                       <span className="font-medium text-destructive">{sim.outOfPocket || 'N/A'}</span>
                     </div>
                   </div>
                   <div className="pt-2 border-t text-xs text-muted-foreground">
                     <span className="block font-semibold mb-1">Relevant Clause:</span>
                     <span className="italic">{sim.clauseReference || 'None referenced'}</span>
                   </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col h-[400px]">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Ask Flow AI
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
               <ScrollArea className="flex-1 p-4 space-y-4">
                 {chatHistory.length === 0 ? (
                    <div className="text-center h-full flex items-center justify-center text-sm text-muted-foreground italic opacity-70">
                      Ask any question about deductibles, renewals, or obscure clauses. Max 10 messages.
                    </div>
                 ) : (
                    <div className="space-y-4">
                      {chatHistory.map((c, i) => (
                        <div key={i} className={`flex ${c.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`text-sm py-2 px-3 rounded-2xl max-w-[85%] ${
                             c.role === 'user' 
                               ? 'bg-blue-600 text-primary-foreground rounded-tr-sm' 
                               : 'bg-muted rounded-tl-sm border border-border'
                          }`}>
                            {c.text}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                         <div className="flex justify-start">
                            <div className="text-sm py-2 px-3 bg-muted rounded-2xl rounded-tl-sm max-w-[85%] border border-border flex items-center gap-2">
                               <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                            </div>
                         </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                 )}
               </ScrollArea>
            </CardContent>
            <CardFooter className="p-3 border-t">
               <div className="flex w-full items-center gap-2">
                 <Input 
                   placeholder="Ask a question..." 
                   value={chatMessage} 
                   onChange={e => setChatMessage(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleChat()}
                   disabled={chatLoading}
                 />
                 <Button size="sm" onClick={handleChat} disabled={chatLoading || !chatMessage.trim()}>Send</Button>
               </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
