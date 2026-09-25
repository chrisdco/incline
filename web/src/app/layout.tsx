import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Sidebar, DesktopUserButton } from "@/components/sidebar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Incline Web",
  description: "Review your training: workouts, routines, progress and measurements.",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full bg-zinc-50 text-zinc-900 md:flex dark:bg-black dark:text-zinc-100">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <Sidebar />
          <div className="min-w-0 flex-1">
            <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
              >
                Skip to content
              </a>
              <div className="mb-4 flex justify-end">
                <DesktopUserButton />
              </div>
              <main id="main">{children}</main>
            </div>
          </div>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
