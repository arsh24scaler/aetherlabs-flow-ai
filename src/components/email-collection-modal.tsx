"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BrainCircuit, ChevronRight, Loader2, Sparkles, ShieldCheck, Mail, Lock } from "lucide-react"

interface EmailCollectionModalProps {
    isOpen: boolean
    onSubmit: (email: string) => void
    isSubmitting: boolean
}

export function EmailCollectionModal({ isOpen, onSubmit, isSubmitting }: EmailCollectionModalProps) {
    const [email, setEmail] = useState("")

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (email) {
            onSubmit(email)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop with sophisticated blur and noise */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-[#0E1116]/80 backdrop-blur-xl transition-all duration-500 overflow-hidden"
                    >
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

                        {/* Animated background blobs */}
                        <motion.div
                            animate={{
                                x: [0, 100, 0],
                                y: [0, 50, 0],
                                scale: [1, 1.2, 1]
                            }}
                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                            className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"
                        />
                        <motion.div
                            animate={{
                                x: [0, -80, 0],
                                y: [0, 100, 0],
                                scale: [1, 1.1, 1]
                            }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear", delay: 2 }}
                            className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[140px]"
                        />
                    </motion.div>

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-md overflow-hidden"
                    >
                        {/* Enhanced Glow Effects */}
                        <div className="absolute -top-[100px] -left-[100px] w-[200px] h-[200px] bg-indigo-500/20 blur-[100px] rounded-full" />
                        <div className="absolute -bottom-[100px] -right-[100px] w-[200px] h-[200px] bg-indigo-500/20 blur-[100px] rounded-full" />

                        {/* Main Modal Card */}
                        <div className="relative bg-[#14171C]/95 border border-white/[0.08] rounded-[28px] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden">
                            {/* Grid Background Pattern */}
                            <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
                                style={{
                                    backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)`,
                                    backgroundSize: '24px 24px'
                                }}
                            />

                            {/* Top Scanning Line Animation */}
                            <motion.div
                                animate={{
                                    left: ["-10%", "110%"],
                                    opacity: [0, 1, 0]
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                                className="absolute top-0 h-[1.5px] w-20 bg-gradient-to-r from-transparent via-indigo-400 to-transparent z-10"
                            />

                            <div className="flex flex-col items-center text-center space-y-7">
                                {/* Advanced Icon Display */}
                                <div className="relative">
                                    <motion.div
                                        animate={{
                                            boxShadow: ["0 0 0px rgba(99, 102, 241, 0)", "0 0 20px rgba(99, 102, 241, 0.3)", "0 0 0px rgba(99, 102, 241, 0)"]
                                        }}
                                        transition={{ duration: 4, repeat: Infinity }}
                                        className="relative flex items-center justify-center w-16 h-16 rounded-[20px] bg-gradient-to-b from-[#1C2028] to-[#14171C] border border-white/[0.1] group"
                                    >
                                        <BrainCircuit className="w-8 h-8 text-indigo-400 group-hover:scale-110 transition-transform duration-500" />

                                        {/* Pulsing rings */}
                                        <div className="absolute inset-0 rounded-[20px] border border-indigo-500/20 animate-ping opacity-40 scale-125" />
                                    </motion.div>

                                    {/* Floating particles (conceptual) */}
                                    <motion.div
                                        animate={{ y: [0, -10, 0], opacity: [0, 1, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                                        className="absolute -top-2 -right-2"
                                    >
                                        <Sparkles className="w-4 h-4 text-indigo-300/60" />
                                    </motion.div>
                                </div>

                                <div className="space-y-2.5">
                                    <h2 className="text-2xl font-semibold text-white tracking-tight leading-tight">
                                        Secure Analysis Locked
                                    </h2>
                                    <p className="text-zinc-400 text-sm leading-relaxed max-w-[280px] mx-auto font-light">
                                        Your policy intelligence report is ready. Enter your professional email to unlock and receive the full results.
                                    </p>
                                </div>

                                {/* Features list */}
                                <div className="grid grid-cols-2 gap-3 w-full py-2">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Secure Data</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                        <Lock className="w-3.5 h-3.5 text-indigo-400" />
                                        <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Private Access</span>
                                    </div>
                                </div>

                                <form onSubmit={handleSubmit} className="w-full space-y-4">
                                    <div className="relative group">
                                        <div className="absolute -inset-0.5 rounded-xl bg-indigo-500/20 opacity-0 group-focus-within:opacity-100 blur transition duration-500" />
                                        <div className="relative flex items-center">
                                            <Mail className="absolute left-4 w-4 h-4 text-zinc-500" />
                                            <input
                                                type="email"
                                                required
                                                placeholder="name@company.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3.5 bg-[#0E1116] border border-white/[0.08] rounded-xl text-zinc-100 text-sm placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all duration-300 font-light"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !email}
                                        className="relative group/btn w-full px-5 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:grayscale transition-all duration-300 shadow-[0_4px_25px_rgba(99,102,241,0.25)] active:scale-[0.98] flex items-center justify-center gap-2 overflow-hidden border border-indigo-400/20"
                                    >
                                        {/* Shine effect */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover/btn:translate-x-[150%] transition-transform duration-700 ease-in-out" />

                                        {isSubmitting ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                                        ) : (
                                            <>
                                                <span className="text-white text-sm font-semibold tracking-wide">Unlock Intelligence</span>
                                                <ChevronRight className="w-4 h-4 text-white group-hover/btn:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </form>

                                <div className="flex flex-col items-center gap-2 pt-2">
                                    <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">
                                        AetherLabs Nexus Protocol v2.4.0
                                    </p>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/[0.04] bg-white/[0.02]">
                                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] text-zinc-500 font-medium tracking-tight">Active Engine Connection</span>
                                    </div>
                                </div>
                            </div>

                            {/* Decorative Corner Glows */}
                            <div className="absolute top-0 left-0 w-8 h-8 pointer-events-none">
                                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-indigo-500/50 to-transparent" />
                                <div className="absolute top-0 left-0 w-[1px] h-full bg-gradient-to-b from-indigo-500/50 to-transparent" />
                            </div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none">
                                <div className="absolute bottom-0 right-0 w-full h-[1px] bg-gradient-to-l from-indigo-500/50 to-transparent" />
                                <div className="absolute bottom-0 right-0 w-[1px] h-full bg-gradient-to-t from-indigo-500/50 to-transparent" />
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
