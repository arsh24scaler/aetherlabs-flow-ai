import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow AI - Policy Intelligence Engine",
  description: "Decode insurance policies instantly with Flow AI.",
  icons: {
    icon: [
      { url: "/logo.png?v=2" },
      { url: "/favicon.ico?v=2" }
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#0E1116] text-zinc-100 flex flex-col font-sans relative overflow-x-hidden`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {/* Subtle animated noise grain */}
          <div className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', animation: 'noise-dance 1s infinite steps(2)' }} />

          {/* Extremely faint animated network mesh in background */}
          <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.02] flex items-center justify-center">
            <div className="w-[200vw] h-[200vh] border-[1px] border-zinc-100/10 [background-size:40px_40px] [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] animate-mesh-pan" />
          </div>

          <main className="flex-1 overflow-x-hidden relative z-10">
            {children}
          </main>

          {/* Footer watermark */}
          <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-[0.03] grayscale -z-50 select-none">
            <img src="/logo.png" alt="AetherLabs Logo" className="w-10 h-10" />
            <span className="text-4xl font-bold tracking-widest uppercase">AetherLabs</span>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
