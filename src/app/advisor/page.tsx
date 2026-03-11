"use client";
import React, { lazy, Suspense } from "react";
import { Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

const AdvisorTab = lazy(() => import("@/components/consumer/advisor-tab"));

export default function AdvisorPage() {
    return (
        <>
            <AppHeader />
            <div className="flex flex-col h-[calc(100dvh-56px)] bg-[#080808] overflow-hidden">
                {/* Full-width ARIA workstation */}
                <Suspense
                    fallback={
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#c8ff00]/10 border border-[#c8ff00]/20 flex items-center justify-center">
                                    <Sparkles size={20} className="text-[#c8ff00] animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <span className="text-[11px] font-mono font-bold text-zinc-400 tracking-widest uppercase block">
                                        Initializing ARIA
                                    </span>
                                    <span className="text-[9px] font-mono text-zinc-700 mt-1 block">
                                        AI Risk & Insurance Advisory Engine
                                    </span>
                                </div>
                            </div>
                        </div>
                    }
                >
                    <AdvisorTab />
                </Suspense>
            </div>
        </>
    );
}
