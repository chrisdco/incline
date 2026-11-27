import { LinearGradient } from 'expo-linear-gradient';
import { Activity } from 'lucide-react-native';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon as Glyph } from '@/components/common/icon';
import type { WhatsNewItem } from '@/contracts/releases/whats-new';
import { hexToRgba, usePrimaryHex } from '@/lib/theme';

import { WHATS_NEW_ICONS } from './icons';

/** Fixed aspect so every card in the carousel is the same height (RELEASES.md). */
export const ART_ASPECT = 2;

/** Small stable hash so each item keeps its own layout across opens. */
function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Card art for What's new v2: an accent-tinted gradient, two soft rings and
 * a dot field placed by the item id, and the item's icon on a raised tile.
 * Drawn in-app (no images), so it follows the user's accent and theme and
 * adds nothing to an OTA. Decorative only: hidden from screen readers.
 */
export function WhatsNewArt({ item }: { item: WhatsNewItem }) {
  const primary = usePrimaryHex();
  const Icon = WHATS_NEW_ICONS[item.icon] ?? Activity;
  const s = seed(item.id);
  // ViewBox is 200×100 (ART_ASPECT); rings sit on the right half, away from the icon.
  const r1 = { cx: 130 + (s % 50), cy: 20 + ((s >> 6) % 60), r: 34 + ((s >> 12) % 22) };
  const r2 = { cx: 110 + ((s >> 3) % 70), cy: 30 + ((s >> 9) % 50), r: 14 + ((s >> 15) % 14) };
  const dotsLeft = (s >> 18) % 2 === 0;
  const dots: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) dots.push({ x: (dotsLeft ? 112 : 150) + col * 8, y: 62 + row * 8 });
  }

  return (
    <View
      className="w-full overflow-hidden rounded-2xl"
      style={{ aspectRatio: ART_ASPECT }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <LinearGradient
        colors={[hexToRgba(primary, 0.26), hexToRgba(primary, 0.06)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <Svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute' }}>
        <Circle {...r1} fill="none" stroke={hexToRgba(primary, 0.28)} strokeWidth={1.5} />
        <Circle {...r2} fill={hexToRgba(primary, 0.14)} />
        {dots.map((d) => (
          <Circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={1.1} fill={hexToRgba(primary, 0.35)} />
        ))}
      </Svg>
      <View className="flex-1 justify-center px-5">
        <View className="size-14 items-center justify-center rounded-2xl bg-card shadow-sm">
          <Glyph icon={Icon} size={28} color="primary" />
        </View>
      </View>
    </View>
  );
}
