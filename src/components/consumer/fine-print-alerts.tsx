"use client";
import { AlertTriangle, AlertOctagon } from "lucide-react";

interface FinePrintAlert {
  severity: "warning" | "critical";
  clause: string;
  explanation: string;
  whyItMatters: string;
}

export default function FinePrintAlerts({ alerts }: { alerts: FinePrintAlert[] }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
        <AlertOctagon size={14} className="text-amber-400" /> Fine Print Detector
      </h3>
      {alerts.map((alert, i) => (
        <div key={i} className={`border rounded-lg p-4 ${
          alert.severity === "critical"
            ? "border-red-500/40 bg-red-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {alert.severity === "critical"
              ? <AlertOctagon size={16} className="text-red-400" />
              : <AlertTriangle size={16} className="text-amber-400" />}
            <span className={`text-xs font-bold uppercase tracking-wider ${
              alert.severity === "critical" ? "text-red-400" : "text-amber-400"
            }`}>{alert.severity}</span>
          </div>
          <p className="text-sm text-white/60 italic mb-2 border-l-2 border-white/10 pl-3">
            &ldquo;{alert.clause}&rdquo;
          </p>
          <p className="text-sm text-white/80 mb-1">
            <span className="font-medium text-white/90">What this means: </span>{alert.explanation}
          </p>
          <p className="text-sm text-white/60">
            <span className="font-medium text-amber-400/80">⚡ Why it matters: </span>{alert.whyItMatters}
          </p>
        </div>
      ))}
    </div>
  );
}
