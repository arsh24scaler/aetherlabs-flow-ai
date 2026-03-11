"use client";
import { Award, AlertTriangle, TrendingUp } from "lucide-react";

interface InsurerRecord {
  name: string;
  sector: string;
  csr: number;
  complaints?: number;
  complaintZone?: "green" | "yellow" | "red";
  solvency?: string;
  goldenCombo?: boolean;
}

export default function InsurerReputation({ insurer }: { insurer: InsurerRecord | null }) {
  if (!insurer) return null;

  const csrColor = insurer.csr >= 95 ? "text-emerald-400" : insurer.csr >= 85 ? "text-amber-400" : "text-red-400";
  const zoneEmoji = insurer.complaintZone === "green" ? "🟢" : insurer.complaintZone === "yellow" ? "🟡" : "🔴";

  return (
    <div className="border border-white/[0.04] rounded-xl p-4 bg-[#0d0d0d] shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award size={12} className="text-indigo-400" />
          <h3 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">
            Insurer<br />Reputation
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest leading-none">IRDAI FY</p>
          <p className="text-[10px] font-mono font-bold text-zinc-400 mt-1">2024-25</p>
        </div>
      </div>

      <p className="text-[13px] font-mono font-bold text-zinc-100 mb-4">{insurer.name}</p>

      <div className="grid grid-cols-2 min-[450px]:grid-cols-3 gap-2">
        <div className="bg-[#121212] border border-white/[0.04] rounded-lg p-2.5 sm:p-3 flex flex-col items-center justify-center text-center">
          <TrendingUp size={12} className={`${csrColor} mb-2`} />
          <p className={`text-[14px] sm:text-[15px] font-mono font-bold ${csrColor}`}>{insurer.csr}%</p>
          <p className="text-[7px] sm:text-[8px] font-mono text-zinc-500 uppercase tracking-widest mt-1 leading-tight">Claim<br />Settlement</p>
        </div>

        {insurer.complaints !== undefined && (
          <div className="bg-[#121212] border border-white/[0.04] rounded-lg p-2.5 sm:p-3 flex flex-col items-center justify-center text-center">
            <AlertTriangle size={12} className="text-zinc-500 mb-2" />
            <div className="flex items-center gap-1.5">
              <span className="text-[8px]">{zoneEmoji}</span>
              <p className="text-[14px] sm:text-[15px] font-mono font-bold text-zinc-200">{insurer.complaints}</p>
            </div>
            <p className="text-[7px] sm:text-[8px] font-mono text-zinc-500 uppercase tracking-widest mt-1 leading-tight">Complaints<br />/10K</p>
          </div>
        )}

        {insurer.solvency && (
          <div className="bg-[#121212] border border-white/[0.04] rounded-lg p-2.5 sm:p-3 flex flex-col items-center justify-center text-center col-span-2 xs:col-span-1">
            <Award size={12} className="text-zinc-500 mb-2" />
            <p className="text-[14px] sm:text-[15px] font-mono font-bold text-zinc-200">{insurer.solvency}</p>
            <p className="text-[7px] sm:text-[8px] font-mono text-zinc-500 uppercase tracking-widest mt-1 leading-tight">Solvency</p>
          </div>
        )}
      </div>

      {insurer.goldenCombo && (
        <div className="mt-3 flex items-start gap-2 bg-amber-500/[0.04] border border-amber-500/20 rounded-lg p-3">
          <span className="text-sm shrink-0">🏆</span>
          <p className="text-[9px] font-mono text-amber-500/90 leading-snug">
            <strong className="text-amber-400 font-bold block mb-0.5">Golden Combo Insurer</strong>
            High CSR, Low Complaints, Strong Solvency.
          </p>
        </div>
      )}
    </div>
  );
}
