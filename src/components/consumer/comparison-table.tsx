"use client";
import { Swords, Trophy, CheckCircle2, XCircle } from "lucide-react";

interface ComparisonData {
  dimensions: string[];
  policies: Array<{
    insurerName: string;
    policyType: string;
    values: Record<string, string>;
  }>;
  aiJudgment: string;
  winner: string;
  winnerReason: string;
}

export default function ComparisonTable({ comparison }: { comparison: ComparisonData | null }) {
  if (!comparison) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
        <Swords size={14} className="text-indigo-400" /> Quote Battle Mode
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left p-3 text-white/40 text-xs uppercase">Dimension</th>
              {comparison.policies.map((p, i) => (
                <th key={i} className="text-left p-3 text-white/80 font-medium">
                  <div>{p.insurerName}</div>
                  <div className="text-xs text-white/40 font-normal">{p.policyType}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.dimensions.map((dim) => (
              <tr key={dim} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="p-3 text-white/50 text-xs font-medium">{dim}</td>
                {comparison.policies.map((p, i) => {
                  const val = p.values[dim] || "—";
                  const isWinner = p.insurerName === comparison.winner;
                  return (
                    <td key={i} className={`p-3 text-white/70 ${isWinner ? "bg-emerald-500/5" : ""}`}>
                      {val.toLowerCase().includes("none") || val === "—"
                        ? <span className="flex items-center gap-1"><XCircle size={12} className="text-red-400" />{val}</span>
                        : val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-white/90">AI Recommendation</span>
        </div>
        <p className="text-sm text-white/70 mb-2">{comparison.aiJudgment}</p>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">{comparison.winner}</span>
          <span className="text-xs text-white/40">— {comparison.winnerReason}</span>
        </div>
      </div>
    </div>
  );
}
