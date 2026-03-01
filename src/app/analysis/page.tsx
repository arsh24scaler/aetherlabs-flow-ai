import { Suspense } from "react"
import { AnalysisDashboard } from "@/components/analysis-dashboard"

export default function AnalysisPage() {
  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      <Suspense fallback={<div className="text-center p-20 animate-pulse font-mono">Loading Dashboard...</div>}>
        <AnalysisDashboard />
      </Suspense>
    </div>
  )
}
