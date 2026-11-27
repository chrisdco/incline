import { HeartPulse, LayoutGrid, LogIn, Mic, Settings, Share2, ShieldCheck, Sparkles, TrendingUp, Wrench, type LucideIcon } from 'lucide-react-native';

import type { WhatsNewIcon } from '@/contracts/releases/whats-new';

/** Contract icon keys → lucide (web keeps its own map with the same keys). */
export const WHATS_NEW_ICONS: Record<WhatsNewIcon, LucideIcon> = {
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
