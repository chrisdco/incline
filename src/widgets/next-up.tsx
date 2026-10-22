/**
 * Android home-screen widget (4x2) — "what should I train next?".
 *
 * Rendered by the isolated widget runtime: no hooks, no timers and no module
 * scope (only what arrives in props), and on Android `environment` carries
 * `colorScheme` alone. That is why every string and both palettes are
 * formatted app-side in `src/lib/widgets/build-next-up.ts` and unit-tested
 * there.
 *
 * The initial props below are a placeholder shown until the app posts its
 * first snapshot — `refreshWidgets()` runs on app start/foreground, so a
 * freshly added widget fills in as soon as Incline is opened once.
 *
 * Android widgets cannot launch the app on tap with expo-widgets (buttons only
 * update props), so this surface is intentionally display-only.
 */
import { Box, Column, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { NextUpProps } from '@/lib/widgets/build-next-up';

const NextUpWidget = (props: NextUpProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Column
      verticalArrangement="spaceBetween"
      modifiers={[fillMaxSize(), background(c.background), cornerRadius(24), paddingAll(16)]}>
      <Column>
        <Box modifiers={[width(20), height(3), background(c.primary), cornerRadius(2)]} />
        <Row
          horizontalArrangement="spaceBetween"
          verticalAlignment="center"
          modifiers={[fillMaxWidth(), padding(0, 10, 0, 0)]}>
          <Text color={c.muted} style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2 }}>
            {props.eyebrow}
          </Text>
          {props.streakLabel ? (
            <Row modifiers={[background(c.card), cornerRadius(999), padding(8, 3, 8, 3)]}>
              <Text color={c.primary} style={{ fontSize: 10, fontWeight: '600' }}>
                {props.streakLabel}
              </Text>
            </Row>
          ) : null}
        </Row>
        <Text
          color={c.foreground}
          maxLines={1}
          overflow="ellipsis"
          modifiers={[padding(0, 12, 0, 2)]}
          style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
          {props.title}
        </Text>
        <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 13 }}>
          {props.detail}
        </Text>
      </Column>
      <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 11 }}>
        {props.footer}
      </Text>
    </Column>
  );
};

export default createWidget<NextUpProps>('NextUp', NextUpWidget, {
  eyebrow: 'READY',
  title: 'Incline',
  detail: 'Open Incline once to sync this widget',
  streakLabel: null,
  footer: 'Next workout and weekly progress',
  light: {
    background: '#f9f9fb',
    card: '#ffffff',
    foreground: '#09090b',
    muted: '#62626a',
    primary: '#6D5DF6',
    border: '#e4e4e7',
  },
  dark: {
    background: '#0c0c0e',
    card: '#151519',
    foreground: '#fafafa',
    muted: '#afafb6',
    primary: '#8B7CFF',
    border: '#242428',
  },
});
