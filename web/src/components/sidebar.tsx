 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Activity,
  ClipboardList,
  Download,
  Dumbbell,
  FileText,
  Layers,
  LayoutDashboard,
  Ruler,
  Settings,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV: { href: string; label: string; exact?: boolean; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/routines", label: "Routines", icon: ClipboardList },
  { href: "/programs", label: "Programs", icon: Layers },
  { href: "/exercises", label: "Exercises", icon: Activity },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/measurements", label: "Measurements", icon: Ruler },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/export", label: "Export", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 px-5 pt-6 pb-2">
          <span className="text-xl font-extrabold tracking-tight">Incline</span>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">WEB</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium",
                  active ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                )}
              >
                <Icon size={17} strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4">
          <p className="text-xs text-zinc-500">Log on mobile — review here.</p>
        </div>
      </aside>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-lg font-extrabold tracking-tight">Incline</span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] items-center rounded-lg px-3 py-1.5 text-sm whitespace-nowrap",
                  active ? "bg-zinc-100 font-semibold dark:bg-zinc-800" : "text-zinc-500",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}

export function DesktopUserButton() {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <ThemeToggle />
      <UserButton />
    </div>
  );
}
