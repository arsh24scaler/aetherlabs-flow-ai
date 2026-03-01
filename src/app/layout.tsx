import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sparkles } from "lucide-react";

// (Create a tiny client component for the ThemeToggle or inline if possible. We should create a separate component for toggle).
import { ThemeToggle } from "@/components/theme-toggle";

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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground flex flex-col`}
      >
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto max-w-6xl flex h-16 items-center justify-between px-4">
                    <div className="flex flex-row items-center gap-2 font-bold text-xl tracking-tight cursor-pointer">
                        <Sparkles className="w-5 h-5 text-blue-500" />
                        <span>Flow AI</span>
                        <span className="text-muted-foreground font-medium text-sm ml-2 hidden sm:inline-block">Policy Intelligence Engine</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <p className="text-xs text-muted-foreground mr-2 font-mono hidden md:block">by AetherLabs</p>
                        <ThemeToggle />
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
