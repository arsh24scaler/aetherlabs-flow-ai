"use client";
import { ShieldAlert } from "lucide-react";

interface CoverageGap {
  gap: string;
  icon: string;
  whyItMatters: string;
  suggestedAddOn: string;
}

export default function CoverageGaps({ gaps }: { gaps: CoverageGap[] }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
        <ShieldAlert size={14} className="text-orange-400" /> Coverage Gaps Detected
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {gaps.map((gap, i) => (
          <div key={i} className="border border-orange-500/20 bg-orange-500/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{gap.icon}</span>
              <span className="text-sm font-semibold text-white/90">{gap.gap}</span>
            </div>
            <p className="text-xs text-white/60 mb-2">{gap.whyItMatters}</p>
            <div className="bg-white/5 rounded px-3 py-1.5 text-xs">
              <span className="text-emerald-400 font-medium">Fix: </span>
              <span className="text-white/70">{gap.suggestedAddOn}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
