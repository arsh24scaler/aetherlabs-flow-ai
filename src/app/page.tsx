"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { FileText, UploadCloud, ShieldCheck, Activity, BrainCircuit, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function Home() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string>("")
  const [jobId, setJobId] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0]
      if (selected.type !== "application/pdf") {
        setError("Only PDF files are supported.")
        return
      }
      if (selected.size > 25 * 1024 * 1024) {
        setError("File size exceeds 25MB limit.")
        return
      }
      setFile(selected)
      setError("")
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload document")
      }

      setJobId(data.jobId)
      // Redirect to the analysis view with the jobId
      router.push(`/analysis?jobId=${data.jobId}`)
    } catch (err: any) {
      setError(err.message)
      setIsUploading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-20 flex flex-col items-center">
      <div className="text-center space-y-4 mb-16 max-w-3xl">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground">
          Decode Insurance Policies <br className="hidden md:block"/> with <span className="text-blue-600 dark:text-blue-500">Precision.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Upload any insurance policy PDF. Our AI Engine instantly extracts critical coverage details, flags hidden risks, and simulates out-of-pocket costs.
        </p>
      </div>

      <div className="w-full max-w-2xl">
        <Card className="border-2 border-dashed border-muted shadow-sm hover:border-blue-500/50 transition-colors">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-6">
            {!isUploading && !jobId ? (
                <>
                    <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                    <UploadCloud className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                    <h3 className="text-xl font-semibold">Upload your Policy</h3>
                    <p className="text-sm text-muted-foreground mt-2">PDF files up to 25MB are supported.</p>
                    </div>
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />
                    {file ? (
                        <div className="bg-muted px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium">
                            <FileText className="w-4 h-4" /> {file.name}
                        </div>
                    ) : null}

                    <div className="flex gap-4">
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                            Choose File
                        </Button>
                        <Button disabled={!file} onClick={handleUpload}>
                            Analyze Policy
                        </Button>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </>
            ) : (
                <div className="py-12 flex flex-col items-center space-y-4">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                    <h3 className="text-xl font-semibold">Uploading & Processing...</h3>
                    <p className="text-sm text-muted-foreground text-center">
                        Initializing AI Engine and extracting text. You will be redirected shortly.
                    </p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 text-center">
        <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-muted rounded-xl">
                <BrainCircuit className="w-6 h-6 text-foreground" />
            </div>
            <h4 className="font-semibold text-lg">Instant Extraction</h4>
            <p className="text-sm text-muted-foreground">Smart parsing pulls key metadata, coverage limits, and deductibles instantly.</p>
        </div>
        <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-muted rounded-xl">
                <ShieldCheck className="w-6 h-6 text-foreground" />
            </div>
            <h4 className="font-semibold text-lg">Risk Detection</h4>
            <p className="text-sm text-muted-foreground">Identifies hidden exclusions and flags non-standard clauses to protect you.</p>
        </div>
        <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-muted rounded-xl">
                <Activity className="w-6 h-6 text-foreground" />
            </div>
            <h4 className="font-semibold text-lg">Scenario Simulator</h4>
            <p className="text-sm text-muted-foreground">Ask "What if I get into a fender bender?" and predict exact out-of-pocket costs.</p>
        </div>
      </div>
    </div>
  )
}
