"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { motion, AnimatePresence } from "framer-motion"
import { EmailCollectionModal } from "@/components/email-collection-modal"

const Scene3D = dynamic(() => import("@/components/landing/Scene3D"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#050510]" />,
})

/* ─── 3D Card Tilt Hook ─── */
function useTilt(intensity = 4) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, scale: 1 })
  const rafId = useRef(0)
  const target = useRef({ rotateX: 0, rotateY: 0 })
  const current = useRef({ rotateX: 0, rotateY: 0 })
  const isHovered = useRef(false)

  useEffect(() => {
    const animate = () => {
      current.current.rotateX += (target.current.rotateX - current.current.rotateX) * 0.08
      current.current.rotateY += (target.current.rotateY - current.current.rotateY) * 0.08
      setTilt({
        rotateX: current.current.rotateX,
        rotateY: current.current.rotateY,
        scale: isHovered.current ? 1.018 : 1,
      })
      rafId.current = requestAnimationFrame(animate)
    }
    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!cardRef.current) return
      const rect = cardRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      target.current = {
        rotateX: -y * intensity,
        rotateY: x * intensity,
      }
    },
    [intensity]
  )

  const onMouseEnter = useCallback(() => {
    isHovered.current = true
  }, [])

  const onMouseLeave = useCallback(() => {
    isHovered.current = false
    target.current = { rotateX: 0, rotateY: 0 }
  }, [])

  const style: React.CSSProperties = {
    transform: `perspective(800px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${tilt.scale})`,
    transition: 'scale 0.7s ease-out',
    transformStyle: 'preserve-3d' as const,
    willChange: 'transform',
  }

  return { cardRef, style, onMouseMove, onMouseEnter, onMouseLeave }
}

export default function LandingPage() {
  const [hoveredCard, setHoveredCard] = useState<"left" | "right" | "center" | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const router = useRouter()
  const leftTilt = useTilt(4)
  const rightTilt = useTilt(4)
  const centerTilt = useTilt(4)
  const rafRef = useRef<number>(0)
  const mouseTarget = useRef({ x: 0, y: 0 })
  const mouseCurrent = useRef({ x: 0, y: 0 })

  // Email Capture State
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // Check for existing email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem("aetherlabs_email")
    if (savedEmail) setIsSaved(true)
  }, [])

  const handleRouteClick = (route: string) => {
    if (isSaved) {
      router.push(route)
    } else {
      setPendingRoute(route)
      setShowEmailModal(true)
    }
  }

  const handleSaveEmail = async (emailToSave: string) => {
    setIsSubmitting(true)
    try {
      await fetch("/api/save-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToSave }),
      })
      localStorage.setItem("aetherlabs_email", emailToSave)
      setIsSaved(true)
      setShowEmailModal(false)
      if (pendingRoute) {
        router.push(pendingRoute)
      }
    } catch (err) {
      console.error("Failed to save email:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      mouseTarget.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      }
    },
    []
  )

  useEffect(() => {
    const animate = () => {
      mouseCurrent.current.x +=
        (mouseTarget.current.x - mouseCurrent.current.x) * 0.04
      mouseCurrent.current.y +=
        (mouseTarget.current.y - mouseCurrent.current.y) * 0.04
      setMouse({ ...mouseCurrent.current })
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#050510] overflow-y-auto overflow-x-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* ── 3D Background ── */}
      <div className="fixed inset-0">
        <Scene3D hoveredCard={hoveredCard} mouse={mouse} />
      </div>

      {/* ── Gradient overlays for depth ── */}
      <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-t from-[#050510] via-transparent to-[#050510]/40" />
      <div className="fixed inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,#050510_75%)]" />

      {/* ── Vignette ── */}
      <div className="fixed inset-0 z-[1] pointer-events-none shadow-[inset_0_0_200px_rgba(0,0,0,0.5)]" />

      {/* ── UI Overlay ── */}
      <div className="relative z-[2] min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-12 md:py-16">
        {/* Title Block */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 md:mb-14 lg:mb-16"
        >
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.6em" }}
            animate={{ opacity: 0.7, letterSpacing: "0.4em" }}
            transition={{ duration: 2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-[11px] md:text-[13px] uppercase text-zinc-500 font-semibold mb-6"
          >
            FLOW AI
          </motion.p>
          <h1 className="text-[2rem] sm:text-4xl md:text-[3.2rem] lg:text-[4rem] font-extralight text-white tracking-[-0.025em] leading-[1.1]">
            Enter the Intelligence Layer
          </h1>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 mx-auto w-20 h-[1px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"
          />
        </motion.div>

        {/* Cards */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 1.6,
            delay: 0.35,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 w-full max-w-[1100px]"
        >
          {/* ── Professional Console ── */}
          <div
            ref={leftTilt.cardRef}
            className="group relative cursor-pointer"
            onMouseEnter={() => { setHoveredCard("left"); leftTilt.onMouseEnter() }}
            onMouseLeave={() => { setHoveredCard(null); leftTilt.onMouseLeave() }}
            onMouseMove={leftTilt.onMouseMove}
            onClick={() => handleRouteClick("/pro/workspace")}
            style={leftTilt.style}
          >
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-purple-500/25 via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-[1px]" />
            <div className="absolute -inset-4 rounded-3xl bg-purple-500/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl" />

            <div className="relative p-6 sm:p-7 md:p-8 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] transition-all duration-700 ease-out group-hover:bg-white/[0.045] group-hover:border-white/[0.12] group-hover:shadow-[0_0_80px_rgba(124,58,237,0.07)] h-full flex flex-col">
              <h2 className="text-lg md:text-xl font-semibold text-zinc-100 mb-2 tracking-tight">
                Professional Console
              </h2>
              <p className="text-[13px] text-zinc-500 mb-6 leading-relaxed">
                For brokers, agents, underwriters and risk teams.
              </p>
              <ul className="space-y-3 flex-1">
                {["Analyze policies", "Detect hidden risks", "Run claim simulations"].map((item, i) => (
                  <li key={item} className="flex items-center gap-3 text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors duration-500" style={{ transitionDelay: `${i * 50}ms` }}>
                    <span className="w-[5px] h-[5px] rounded-full bg-purple-500/40 group-hover:bg-purple-400/80 group-hover:shadow-[0_0_6px_rgba(168,85,247,0.4)] transition-all duration-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-7 pt-5 border-t border-white/[0.04] flex items-center gap-2 text-[11px] tracking-widest uppercase text-zinc-700 group-hover:text-zinc-400 transition-colors duration-500 font-medium">
                <span>Enter</span>
                <svg className="w-3.5 h-3.5 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </div>

          {/* ── Personal Console ── */}
          <div
            ref={rightTilt.cardRef}
            className="group relative cursor-pointer"
            onMouseEnter={() => { setHoveredCard("right"); rightTilt.onMouseEnter() }}
            onMouseLeave={() => { setHoveredCard(null); rightTilt.onMouseLeave() }}
            onMouseMove={rightTilt.onMouseMove}
            onClick={() => handleRouteClick("/consumer/policy")}
            style={rightTilt.style}
          >
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-blue-500/25 via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-[1px]" />
            <div className="absolute -inset-4 rounded-3xl bg-blue-500/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl" />

            <div className="relative p-6 sm:p-7 md:p-8 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] transition-all duration-700 ease-out group-hover:bg-white/[0.045] group-hover:border-white/[0.12] group-hover:shadow-[0_0_80px_rgba(59,130,246,0.07)] h-full flex flex-col">
              <h2 className="text-lg md:text-xl font-semibold text-zinc-100 mb-2 tracking-tight">
                Personal Console
              </h2>
              <p className="text-[13px] text-zinc-500 mb-6 leading-relaxed">
                Understand your insurance policies instantly.
              </p>
              <ul className="space-y-3 flex-1">
                {["Understand coverage", "Compare policies", "Ask AI anything"].map((item, i) => (
                  <li key={item} className="flex items-center gap-3 text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors duration-500" style={{ transitionDelay: `${i * 50}ms` }}>
                    <span className="w-[5px] h-[5px] rounded-full bg-blue-500/40 group-hover:bg-blue-400/80 group-hover:shadow-[0_0_6px_rgba(96,165,250,0.4)] transition-all duration-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-7 pt-5 border-t border-white/[0.04] flex items-center gap-2 text-[11px] tracking-widest uppercase text-zinc-700 group-hover:text-zinc-400 transition-colors duration-500 font-medium">
                <span>Enter</span>
                <svg className="w-3.5 h-3.5 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </div>

          {/* ── ARIA – AI Advisor ── */}
          <div
            ref={centerTilt.cardRef}
            className="group relative cursor-pointer"
            onMouseEnter={() => { setHoveredCard("center"); centerTilt.onMouseEnter() }}
            onMouseLeave={() => { setHoveredCard(null); centerTilt.onMouseLeave() }}
            onMouseMove={centerTilt.onMouseMove}
            onClick={() => handleRouteClick("/advisor")}
            style={centerTilt.style}
          >
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-[#c8ff00]/30 via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-[1px]" />
            <div className="absolute -inset-4 rounded-3xl bg-[#c8ff00]/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-xl" />

            <div className="relative p-6 sm:p-7 md:p-8 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] transition-all duration-700 ease-out group-hover:bg-white/[0.045] group-hover:border-[#c8ff00]/15 group-hover:shadow-[0_0_80px_rgba(200,255,0,0.05)] h-full flex flex-col">
              {/* NEW badge */}
              <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-[#c8ff00]/10 border border-[#c8ff00]/20">
                <span className="text-[9px] font-bold text-[#c8ff00] tracking-widest uppercase">New</span>
              </div>

              <h2 className="text-lg md:text-xl font-semibold text-zinc-100 mb-2 tracking-tight">
                ✦ ARIA – AI Advisor
              </h2>
              <p className="text-[13px] text-zinc-500 mb-6 leading-relaxed">
                AI-powered insurance needs assessment & advisory.
              </p>
              <ul className="space-y-3 flex-1">
                {["Risk profile scoring", "Coverage gap analysis", "Personalized recommendations"].map((item, i) => (
                  <li key={item} className="flex items-center gap-3 text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors duration-500" style={{ transitionDelay: `${i * 50}ms` }}>
                    <span className="w-[5px] h-[5px] rounded-full bg-[#c8ff00]/40 group-hover:bg-[#c8ff00]/80 group-hover:shadow-[0_0_6px_rgba(200,255,0,0.4)] transition-all duration-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-7 pt-5 border-t border-white/[0.04] flex items-center gap-2 text-[11px] tracking-widest uppercase text-zinc-700 group-hover:text-[#c8ff00]/70 transition-colors duration-500 font-medium">
                <span>Try ARIA</span>
                <svg className="w-3.5 h-3.5 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom branding */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.5, delay: 1 }}
          className="mt-12 md:mt-16 flex items-center gap-3"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </div>
            <span className="text-[10px] text-zinc-600 font-medium tracking-wider uppercase">
              System Online
            </span>
          </div>
          <span className="text-zinc-800 text-[10px]">•</span>
          <span className="text-[10px] text-zinc-700 font-medium tracking-wider">
            v2.4.0
          </span>
        </motion.div>
      </div>

      <EmailCollectionModal
        isOpen={showEmailModal}
        onOpenChange={setShowEmailModal}
        onSubmit={handleSaveEmail}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
