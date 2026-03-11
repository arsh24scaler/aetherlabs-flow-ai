"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Loader2, X, ShieldCheck, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"

interface EmailCollectionModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (email: string) => void
    isSubmitting: boolean
}

export function EmailCollectionModal({ isOpen, onOpenChange, onSubmit, isSubmitting }: EmailCollectionModalProps) {
    const [email, setEmail] = useState("")

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (email && email.includes("@")) {
            onSubmit(email)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog open={isOpen} onOpenChange={onOpenChange}>
                    <DialogContent showCloseButton={false} className="max-w-md w-[calc(100%-2rem)] bg-[#0c0c16]/95 backdrop-blur-3xl border-white/[0.08] shadow-[0_0_100px_rgba(139,92,246,0.15)] rounded-[2.5rem] p-0 overflow-hidden border">
                        {/* Premium Background Elements */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.08)_0%,transparent_70%)] animate-pulse" />
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-purple-500/[0.03] to-transparent" />
                        </div>

                        <div className="relative z-10 p-8 sm:p-10 flex flex-col items-center text-center">
                            {/* Close button */}
                            <button
                                onClick={() => onOpenChange(false)}
                                className="absolute top-6 right-6 p-2.5 rounded-full bg-white/[0.03] hover:bg-white/[0.1] border border-white/10 transition-all hover:scale-110 active:scale-95 group"
                            >
                                <X className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                            </button>

                            {/* Icon Container */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="mb-8 relative"
                            >
                                <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full" />
                                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 flex items-center justify-center shadow-2xl overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <Send className="w-7 h-7 text-white/90" />
                                </div>
                            </motion.div>

                            {/* Text Content */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2, duration: 0.6 }}
                            >
                                <DialogHeader className="flex flex-col items-center text-center p-0">
                                    <DialogTitle className="text-2xl sm:text-3xl font-light text-white tracking-tight mb-3">
                                        Exclusive Access
                                    </DialogTitle>
                                    <DialogDescription className="text-[14px] text-zinc-400 leading-relaxed font-light mb-8 max-w-[280px] mx-auto">
                                        Verify your identity to connect with the <span className="text-purple-400 font-medium">Flow Intelligence Network</span>.
                                    </DialogDescription>
                                </DialogHeader>
                            </motion.div>

                            {/* Form */}
                            <motion.form
                                onSubmit={handleSubmit}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3, duration: 0.6 }}
                                className="w-full space-y-4"
                            >
                                <div className="group relative">
                                    <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/30 to-blue-500/30 rounded-2xl blur-[2px] opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                                    <div className="relative">
                                        <Input
                                            autoFocus
                                            type="email"
                                            placeholder="Work email address"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="h-14 bg-black/40 border-white/10 rounded-2xl text-white placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:border-purple-500/50 transition-all text-sm px-5"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-20 group-focus-within:opacity-50 transition-opacity">
                                            <span className="text-[10px] uppercase font-bold tracking-tighter text-white">Secure</span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isSubmitting || !email.includes("@")}
                                    className="w-full h-14 rounded-2xl bg-white text-black hover:bg-zinc-200 font-bold transition-all duration-300 shadow-[0_10px_30px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <span className="tracking-tight px-2">Initialize Connection</span>
                                            <div className="w-6 h-6 rounded-lg bg-black/5 flex items-center justify-center">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                </svg>
                                            </div>
                                        </>
                                    )}
                                </Button>

                                <div className="pt-6 grid grid-cols-2 gap-3 w-full opacity-40 hover:opacity-100 transition-opacity duration-500">
                                    <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                        <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Secure</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                        <Lock className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Private</span>
                                    </div>
                                </div>
                            </motion.form>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </AnimatePresence>
    )
}
