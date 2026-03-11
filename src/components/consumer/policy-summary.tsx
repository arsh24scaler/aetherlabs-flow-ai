"use client";
import { useState } from "react";
import { Shield, AlertTriangle, FileText, Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface PolicyOverview {
  policyType: string;
  premium: string;
  coverageAmount: string;
  deductible: string;
  policyDuration: string;
  insurerName: string;
  policyNumber: string;
  startDate: string;
  expiryDate: string;
}

interface ConsumerSummaryData {
  policyOverview: PolicyOverview;
  whatIsCovered: string[];
  whatIsNotCovered: string[];
  importantConditions: string[];
  questionsToAskAgent: string[];
  renewalInfo: { expiryDate: string; daysUntilExpiry: number | null };
  documentType?: string;
  insuredMembers?: Array<{ name: string; relationship: string; ped: string[]; riskScore: number }>;
}

export default function PolicySummary({ summary }: { summary: ConsumerSummaryData }) {
  const [openSection, setOpenSection] = useState<string>("overview");
  const o = summary.policyOverview;

  const toggle = (s: string) => setOpenSection(openSection === s ? "" : s);

  const Section = ({ id, title, icon: Icon, color, children }: {
    id: string; title: string; icon: LucideIcon; color: string; children: React.ReactNode;
  }) => (
    <div className="border border-white/[0.05] rounded-xl overflow-hidden mb-2.5 bg-black/20 shadow-sm">
      <button onClick={() => toggle(id)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors`}>
        <div className={`w-6 h-6 rounded-lg ${color.replace('text-', 'bg-')}/10 flex items-center justify-center`}>
          <Icon size={14} className={color} />
        </div>
        <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-zinc-300 flex-1">{title}</span>
        {openSection === id ? <ChevronDown size={14} className="text-zinc-600" /> : <ChevronRight size={14} className="text-zinc-600" />}
      </button>
      {openSection === id && <div className="px-4 pb-4 pt-1 border-t border-white/[0.03]">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-2">
      <Section id="overview" title="Policy Overview" icon={FileText} color="text-indigo-400">
        <div className="grid grid-cols-2 min-[440px]:grid-cols-3 gap-x-4 gap-y-3 pt-1">
          {[
            ["Type", o.policyType], ["Insurer", o.insurerName], ["Premium", o.premium],
            ["Coverage", o.coverageAmount], ["Deductible", o.deductible], ["Duration", o.policyDuration],
            ["Policy #", o.policyNumber], ["Start", o.startDate], ["Expiry", o.expiryDate],
          ].map(([label, val]) => (
            <div key={label} className="overflow-hidden">
              <span className="text-zinc-600 text-[9px] font-mono uppercase tracking-widest block mb-0.5">{label}</span>
              <p className="text-zinc-200 font-mono font-bold text-[11px] truncate">{val || "—"}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="covered" title={`What's Covered (${summary.whatIsCovered.length})`} icon={CheckCircle2} color="text-emerald-400">
        <ul className="space-y-2">
          {summary.whatIsCovered.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/70">
              <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="notcovered" title={`What's NOT Covered (${summary.whatIsNotCovered.length})`} icon={XCircle} color="text-red-400">
        <ul className="space-y-2">
          {summary.whatIsNotCovered.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/70">
              <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="conditions" title={`Important Conditions (${summary.importantConditions.length})`} icon={AlertTriangle} color="text-amber-400">
        <ul className="space-y-2">
          {summary.importantConditions.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/70">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      {summary.renewalInfo?.expiryDate && (
        <Section id="renewal" title="Renewal Info" icon={Clock} color="text-blue-400">
          <div className="text-sm text-white/70">
            <p>Expiry: <span className="text-white font-medium">{summary.renewalInfo.expiryDate}</span></p>
            {summary.renewalInfo.daysUntilExpiry !== null && (
              <p className="mt-1">
                <span className={`font-medium ${summary.renewalInfo.daysUntilExpiry < 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {summary.renewalInfo.daysUntilExpiry} days until expiry
                </span>
              </p>
            )}
          </div>
        </Section>
      )}

      <Section id="questions" title={`Questions to Ask Agent (${summary.questionsToAskAgent.length})`} icon={Shield} color="text-purple-400">
        <ol className="space-y-2 list-decimal list-inside">
          {summary.questionsToAskAgent.map((q, i) => (
            <li key={i} className="text-sm text-white/70">{q}</li>
          ))}
        </ol>
      </Section>

      {summary.insuredMembers && summary.insuredMembers.length > 0 && (
        <Section id="members" title={`Insured Members (${summary.insuredMembers.length})`} icon={Shield} color="text-emerald-400">
          <div className="space-y-3 pt-1">
            {summary.insuredMembers.map((member, i) => (
              <div key={i} className="p-3.5 bg-white/[0.02] border border-white/[0.05] rounded-xl shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="font-mono font-bold text-[12px] text-zinc-100">{member.name}</span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{member.relationship}</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase border ${member.riskScore >= 70 ? 'bg-red-500/10 text-red-500 border-red-500/20' : member.riskScore >= 40 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                    {member.riskScore}% RISK
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {member.ped && member.ped.length > 0 && member.ped[0] !== "None" ? (
                    member.ped.map((p, pi) => (
                      <span key={pi} className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.05] text-zinc-400 font-mono">
                        PED: {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-[9px] font-mono text-zinc-600 italic">No declared PEDs</span>
                  )}
                </div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${member.riskScore >= 70 ? 'bg-red-500' : member.riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    initial={{ width: 0 }} animate={{ width: `${member.riskScore}%` }} transition={{ duration: 1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
