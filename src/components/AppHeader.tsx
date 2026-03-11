"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"

export function AppHeader() {
    const pathname = usePathname()
    const isWorkspace = pathname.startsWith("/consumer") || pathname.startsWith("/pro") || pathname.startsWith("/advisor")

    return (
        <header className={`sticky top-0 z-50 w-full border-b border-white/[0.03] backdrop-blur-xl relative ${isWorkspace ? "bg-[#080808]" : "bg-[#0E1116]/80"}`}>
            <div className="mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
                <Link href="/" className="flex items-center gap-2 shrink-0 group">
                    <img src="/logo.png" alt="Flow AI Logo" className="w-5 h-5 object-contain" />
                    <span className="font-extrabold text-zinc-100 tracking-tighter text-[16px] sm:text-[19px]">Flow AI</span>
                    <div className="w-[1px] h-4 bg-zinc-800/60 mx-1 hidden lg:block" />
                    <span className="text-zinc-500 font-medium text-[13px] hidden lg:block tracking-wide opacity-80">
                        Policy Intelligence Engine
                    </span>
                </Link>

                <nav className="flex items-center bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] backdrop-blur-md">
                    <Link
                        href="/pro/workspace"
                        className={`px-3 py-1.5 rounded-lg transition-all text-[11px] sm:text-[13px] font-bold tracking-tight ${pathname.startsWith("/pro")
                            ? "text-white bg-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                            : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        Pro
                    </Link>
                    <Link
                        href="/consumer/policy"
                        className={`px-3 py-1.5 rounded-lg transition-all text-[11px] sm:text-[13px] font-bold tracking-tight ${pathname.startsWith("/consumer")
                            ? "text-white bg-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                            : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        Consumer
                    </Link>
                    <Link
                        href="/advisor"
                        className={`px-3 py-1.5 rounded-lg transition-all text-[11px] sm:text-[13px] font-bold tracking-tight ${pathname.startsWith("/advisor")
                            ? "text-[#c8ff00] bg-[#c8ff00]/[0.08] shadow-[0_2px_10px_rgba(200,255,0,0.1)]"
                            : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        ✦ ARIA
                    </Link>
                </nav>
            </div>
        </header>
    )
}
