import { Activity, HeartPulse, LayoutGrid, LogIn, Mic, Settings, Share2, ShieldCheck, Sparkles, TrendingUp, Wrench, type LucideIcon } from "lucide-react";

import { changelog, levelOf, WHATS_NEW, type WhatsNewIcon } from "../../../src/contracts/releases/whats-new";
import { Badge, Card, SectionTitle } from "@/components/ui";

const ICONS: Record<WhatsNewIcon, LucideIcon> = {
  trending: TrendingUp,
  heart: HeartPulse,
  mic: Mic,
  share: Share2,
  widget: LayoutGrid,
  sparkles: Sparkles,
  sign_in: LogIn,
  shield: ShieldCheck,
  settings: Settings,
  wrench: Wrench,
};

/** Always the newest build (RELEASES.md); never names one, so it doesn't go stale. */
const APP_URL = "https://hgzihfjzfwdemjaeledc.supabase.co/functions/v1/app-release";

/**
 * Dashboard "What's new": the same pack as the app's carousel
 * (src/contracts/releases). Swipeable row with snap on phones, a grid on
 * wide screens. Newest 6 cards (notes stay in the list below); then the
 * last few days of the changelog, the same `changelog()` as the app.
 */
export function WhatsNew() {
  const items = [...WHATS_NEW].filter((i) => levelOf(i) !== "note").sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 6);
  const recent = changelog().slice(0, 3);
  if (!items.length) return null;
  return (
    <Card>
      <SectionTitle
        action={
          <a href={APP_URL} className="text-sm font-medium text-teal-700 dark:text-teal-300" rel="noopener">
            Get the Android app
          </a>
        }>
        What&apos;s new
      </SectionTitle>
      <ul
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 motion-safe:scroll-smooth md:grid md:grid-cols-3 md:overflow-visible"
        aria-label="Recent updates">
        {items.map((i) => {
          const Icon = ICONS[i.icon] ?? Activity;
          return (
            <li
              key={i.id}
              className="flex w-[80%] shrink-0 snap-start flex-col gap-2 rounded-xl border border-zinc-200 p-4 sm:w-[55%] md:w-auto dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700 dark:text-teal-300">
                  <Icon size={18} aria-hidden />
                </span>
                <Badge tone="accent">{i.native ? "New in the app" : "New"}</Badge>
              </div>
              <p className="font-semibold">{i.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{i.body}</p>
            </li>
          );
        })}
      </ul>
      {recent.length ? (
        <div className="mt-4 flex flex-col gap-3" aria-label="Recent changes">
          {recent.map((d) => (
            <div key={d.date}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {d.items.map((i) => (
                  <li key={i.id} className="text-sm">
                    <span className="font-medium">{i.title}</span>
                    <span className="text-zinc-600 dark:text-zinc-400"> · {i.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
