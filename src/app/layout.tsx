import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sparkles, UserCircle } from "lucide-react";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <header className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md">
            <div className="container mx-auto max-w-6xl flex h-14 items-center justify-between px-6">
              <div className="flex items-center gap-3 cursor-pointer">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <span className="font-semibold text-zinc-100 tracking-tight text-[15px]">Flow AI</span>
                <div className="w-[1px] h-4 bg-zinc-800 mx-1 hidden sm:block"></div>
                <span className="text-zinc-500 font-medium text-[13px] hidden sm:block tracking-wide">Policy Intelligence Engine</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-zinc-500 font-medium hidden md:block tracking-wide">by AetherLabs</span>
                <div className="w-8 h-8 rounded-full bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                  <UserCircle className="w-5 h-5" />
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
