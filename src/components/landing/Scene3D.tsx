"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

/* ═══════════════════════════════════════════════
   MONOLITH — hoverable, scalable, parallax-aware
   ═══════════════════════════════════════════════ */
function Monolith({
    position,
    args,
    speed,
    side,
    hoveredCard,
    mouse,
}: {
    position: [number, number, number]
    args: [number, number, number]
    speed: number
    side: "left" | "center" | "right"
    hoveredCard: "left" | "right" | "center" | null
    mouse: { x: number; y: number }
}) {
    const ref = useRef<THREE.Mesh>(null)
    const y0 = position[1]
    const materialRef = useRef<THREE.MeshStandardMaterial>(null)

    // Target scale based on hover
    const baseScale = useRef(new THREE.Vector3(1, 1, 1))
    const currentScale = useRef(new THREE.Vector3(1, 1, 1))

    useFrame(({ clock }) => {
        if (!ref.current) return
        const t = clock.elapsedTime

        // Floating motion
        ref.current.position.y = y0 + Math.sin(t * speed) * 0.15
        ref.current.rotation.y += 0.0003

        // Mouse parallax — monoliths move slower than camera (depth feel)
        const parallaxStrength = 0.06
        ref.current.position.x =
            position[0] + mouse.x * parallaxStrength * (position[2] * 0.05)
        ref.current.position.z =
            position[2] + mouse.y * parallaxStrength * 0.3

        // Hover-responsive scaling
        let targetScaleY = 1
        let targetEmissive = 0.08

        if (hoveredCard === "left" && side === "left") {
            targetScaleY = 1.08
            targetEmissive = 0.16
        } else if (hoveredCard === "right" && side === "right") {
            targetScaleY = 1.08
            targetEmissive = 0.16
        } else if (hoveredCard === "left" && side === "right") {
            targetScaleY = 0.95
            targetEmissive = 0.04
        } else if (hoveredCard === "right" && side === "left") {
            targetScaleY = 0.95
            targetEmissive = 0.02
        } else if (hoveredCard && side === "center") {
            targetScaleY = 1.03
            targetEmissive = 0.12
        }

        // Smooth lerp scale
        currentScale.current.y += (targetScaleY - currentScale.current.y) * 0.02
        ref.current.scale.set(1, currentScale.current.y, 1)

        // Smooth emissive transition
        if (materialRef.current) {
            const currentIntensity = materialRef.current.emissiveIntensity
            materialRef.current.emissiveIntensity +=
                (targetEmissive - currentIntensity) * 0.03
        }
    })

    return (
        <mesh ref={ref} position={position}>
            <boxGeometry args={args} />
            <meshStandardMaterial
                ref={materialRef}
                color="#0e0e12"
                roughness={0.1}
                metalness={0.92}
                emissive="#2d1b69"
                emissiveIntensity={0.08}
            />
        </mesh>
    )
}

/* ═══════════════════════════════════════════════
   PARTICLE LAYER — multi-depth dust system
   ═══════════════════════════════════════════════ */
function ParticleLayer({
    count,
    size,
    color,
    opacity,
    spread,
    driftSpeed,
    parallaxFactor,
    mouse,
}: {
    count: number
    size: number
    color: string
    opacity: number
    spread: [number, number, number]
    driftSpeed: number
    parallaxFactor: number
    mouse: { x: number; y: number }
}) {
    const ref = useRef<THREE.Points>(null)

    const geometry = useMemo(() => {
        const positions = new Float32Array(count * 3)
        for (let i = 0; i < count * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * spread[0]
            positions[i + 1] = (Math.random() - 0.5) * spread[1]
            positions[i + 2] = (Math.random() - 0.5) * spread[2]
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
        )
        return geo
    }, [count, spread])

    useFrame(({ clock }) => {
        if (!ref.current) return
        const t = clock.elapsedTime

        // Slow upward drift
        const posAttr = ref.current.geometry.attributes
            .position as THREE.BufferAttribute
        for (let i = 0; i < count; i++) {
            let y = posAttr.getY(i)
            y += driftSpeed
            if (y > spread[1] / 2) y = -spread[1] / 2
            posAttr.setY(i, y)
        }
        posAttr.needsUpdate = true

        // Global rotation
        ref.current.rotation.y = t * 0.004

        // Mouse parallax — particles react MORE than monoliths (closer feel)
        ref.current.position.x = mouse.x * parallaxFactor
        ref.current.position.y = -mouse.y * parallaxFactor * 0.5
    })

    return (
        <points ref={ref} geometry={geometry}>
            <pointsMaterial
                size={size}
                color={color}
                transparent
                opacity={opacity}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    )
}

/* ═══════════════════════════════════════════════
   CAMERA RIG — mouse parallax + hover shift
   ═══════════════════════════════════════════════ */
function CameraRig({
    mouse,
    hoveredCard,
}: {
    mouse: { x: number; y: number }
    hoveredCard: "left" | "right" | "center" | null
}) {
    const targetPos = useRef({ x: 0, y: 2.8, z: 9 })

    useFrame(({ camera, clock }) => {
        const t = clock.elapsedTime

        // Base floating motion
        const baseX = Math.sin(t * 0.06) * 0.5
        const baseY = 2.8 + Math.sin(t * 0.1) * 0.25
        const baseZ = 9 + Math.sin(t * 0.05) * 0.3

        // Mouse parallax offset (inverted — move mouse left, camera shifts right)
        const mouseOffsetX = -mouse.x * 0.2
        const mouseOffsetY = mouse.y * 0.12

        // Hover shift — camera leans toward hovered card
        const hoverShiftX =
            hoveredCard === "left" ? -0.4 : hoveredCard === "right" ? 0.4 : 0

        // Smooth targets
        targetPos.current.x = baseX + mouseOffsetX + hoverShiftX
        targetPos.current.y = baseY + mouseOffsetY
        targetPos.current.z = baseZ

        // Smooth follow
        camera.position.x += (targetPos.current.x - camera.position.x) * 0.02
        camera.position.y += (targetPos.current.y - camera.position.y) * 0.02
        camera.position.z += (targetPos.current.z - camera.position.z) * 0.02

        // Look target also shifts slightly with hover
        const lookX = hoveredCard === "left" ? -0.3 : hoveredCard === "right" ? 0.3 : 0
        camera.lookAt(lookX, 0.3, -3)
    })

    return null
}

/* ═══════════════════════════════════════════════
   DYNAMIC LIGHTING — responds to hover
   ═══════════════════════════════════════════════ */
function DynamicLighting({
    hoveredCard,
}: {
    hoveredCard: "left" | "right" | "center" | null
}) {
    const leftLightRef = useRef<THREE.PointLight>(null)
    const rightLightRef = useRef<THREE.PointLight>(null)
    const topLightRef = useRef<THREE.PointLight>(null)

    useFrame(() => {
        if (!leftLightRef.current || !rightLightRef.current || !topLightRef.current)
            return

        // Left side light reacts to left hover
        const leftTarget = hoveredCard === "left" ? 1.6 : 0.5
        leftLightRef.current.intensity +=
            (leftTarget - leftLightRef.current.intensity) * 0.03

        // Right side light reacts to right hover
        const rightTarget = hoveredCard === "right" ? 1.6 : 0.5
        rightLightRef.current.intensity +=
            (rightTarget - rightLightRef.current.intensity) * 0.03

        // Top accent light
        const topTarget = hoveredCard ? 0.25 : 0.12
        topLightRef.current.intensity +=
            (topTarget - topLightRef.current.intensity) * 0.03
    })

    return (
        <>
            <ambientLight intensity={0.06} />
            {/* Main purple rim light */}
            <directionalLight
                position={[6, 10, -6]}
                intensity={0.45}
                color="#7c3aed"
            />
            {/* Secondary fill */}
            <directionalLight
                position={[-5, 7, 4]}
                intensity={0.18}
                color="#6d28d9"
            />
            {/* Back rim light — defines monolith silhouette edges */}
            <directionalLight
                position={[0, 3, -12]}
                intensity={0.25}
                color="#4c1d95"
            />
            <pointLight
                ref={leftLightRef}
                position={[-6, 3, 3]}
                intensity={0.5}
                color="#3b82f6"
                distance={25}
            />
            <pointLight
                ref={rightLightRef}
                position={[6, 3, 3]}
                intensity={0.5}
                color="#7c3aed"
                distance={25}
            />
            <pointLight
                ref={topLightRef}
                position={[0, 8, -4]}
                intensity={0.12}
                color="#a78bfa"
                distance={28}
            />
        </>
    )
}

/* ═══════════════════════════════════════════════
   SCENE CONTENT — assembled scene graph
   ═══════════════════════════════════════════════ */
function SceneContent({
    hoveredCard,
    mouse,
}: {
    hoveredCard: "left" | "right" | "center" | null
    mouse: { x: number; y: number }
}) {
    const groupRef = useRef<THREE.Group>(null)
    const targetX =
        hoveredCard === "left" ? -0.5 : hoveredCard === "right" ? 0.5 : 0

    useFrame(() => {
        if (!groupRef.current) return
        groupRef.current.position.x +=
            (targetX - groupRef.current.position.x) * 0.012
    })

    const monolithProps = { hoveredCard, mouse }

    return (
        <>
            {/* Environment */}
            <fog attach="fog" args={["#050510", 6, 30]} />
            <color attach="background" args={["#050510"]} />

            {/* Dynamic Lighting */}
            <DynamicLighting hoveredCard={hoveredCard} />

            {/* Monolith Group — shifts toward hovered card */}
            <group ref={groupRef}>
                {/* Left cluster */}
                <Monolith position={[-5.5, 0, -3]} args={[1, 4.2, 0.4]} speed={0.14} side="left" {...monolithProps} />
                <Monolith position={[-3.8, 1.8, -6.5]} args={[0.55, 3.2, 0.45]} speed={0.19} side="left" {...monolithProps} />
                <Monolith position={[-7.5, -0.3, -5.5]} args={[0.75, 5.5, 0.55]} speed={0.11} side="left" {...monolithProps} />
                <Monolith position={[-2.2, -1, -9.5]} args={[1.1, 2.8, 0.5]} speed={0.17} side="left" {...monolithProps} />

                {/* Center */}
                <Monolith position={[0, 0.8, -8]} args={[1.4, 3.8, 0.7]} speed={0.09} side="center" {...monolithProps} />
                <Monolith position={[0.8, -0.5, -12]} args={[0.5, 2.2, 0.35]} speed={0.21} side="center" {...monolithProps} />

                {/* Right cluster */}
                <Monolith position={[5.5, 0.5, -4]} args={[0.7, 4.8, 0.5]} speed={0.16} side="right" {...monolithProps} />
                <Monolith position={[3.8, 1.2, -7.5]} args={[0.85, 3, 0.4]} speed={0.24} side="right" {...monolithProps} />
                <Monolith position={[7.5, -0.3, -6.5]} args={[0.95, 3.8, 0.65]} speed={0.12} side="right" {...monolithProps} />
                <Monolith position={[2.8, -0.8, -10.5]} args={[0.55, 2.4, 0.3]} speed={0.19} side="right" {...monolithProps} />
            </group>

            {/* ── Multi-layer Particle System ── */}

            {/* Layer 1 — Closest, largest, fewest, reacts most to mouse */}
            <ParticleLayer
                count={50}
                size={0.06}
                color="#a78bfa"
                opacity={0.25}
                spread={[25, 18, 20]}
                driftSpeed={0.003}
                parallaxFactor={0.35}
                mouse={mouse}
            />

            {/* Layer 2 — Mid-depth, medium count */}
            <ParticleLayer
                count={140}
                size={0.035}
                color="#7c3aed"
                opacity={0.2}
                spread={[35, 22, 35]}
                driftSpeed={0.002}
                parallaxFactor={0.18}
                mouse={mouse}
            />

            {/* Layer 3 — Farthest, smallest, most numerous, reacts least */}
            <ParticleLayer
                count={250}
                size={0.018}
                color="#6366f1"
                opacity={0.15}
                spread={[50, 30, 50]}
                driftSpeed={0.001}
                parallaxFactor={0.06}
                mouse={mouse}
            />

            {/* Ground plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.8, 0]}>
                <planeGeometry args={[120, 120]} />
                <meshStandardMaterial color="#030308" roughness={1} metalness={0} />
            </mesh>

            {/* Camera Rig */}
            <CameraRig mouse={mouse} hoveredCard={hoveredCard} />
        </>
    )
}

/* ═══════════════════════════════════════════════
   EXPORTED CANVAS
   ═══════════════════════════════════════════════ */
export default function Scene3D({
    hoveredCard,
    mouse,
}: {
    hoveredCard: "left" | "right" | "center" | null
    mouse: { x: number; y: number }
}) {
    return (
        <Canvas
            camera={{ position: [0, 2.8, 9], fov: 48 }}
            style={{ position: "absolute", inset: 0 }}
            gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
            }}
            dpr={[1, 1.5]}
        >
            <SceneContent hoveredCard={hoveredCard} mouse={mouse} />
        </Canvas>
    )
}
