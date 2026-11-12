import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppColorScheme } from '@/lib/use-color-scheme';
import { brandTheme } from '@/styles/tokens';

/** The brand gradient (tokens `BRAND`) as a fill; children draw on top. */
export function BrandGradient({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const brand = brandTheme(useAppColorScheme());
  return (
    <LinearGradient colors={brand.colors} locations={brand.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}
