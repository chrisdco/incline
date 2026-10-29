/**
 * Android home-screen widget (4x2) — "what should I train next?".
 *
 * Reference (Hevy "Routine of the day" + "Weekly stats", Lyfta "Weekly
 * progress"): plain card; left = what to train, right = this week's volume
 * with the change vs last week. Small muted label above a bold value, no
 * brand chrome.
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
  fillMaxHeight,
  fillMaxSize,
  padding,
  paddingAll,
  weight,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { NextUpProps } from '@/lib/widgets/build-next-up';

const NextUpWidget = (props: NextUpProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Row modifiers={[fillMaxSize(), background(c.card), cornerRadius(24), paddingAll(16)]}>
      <Column verticalArrangement="spaceBetween" modifiers={[weight(1), fillMaxHeight()]}>
        <Column>
          <Text color={c.muted} style={{ fontSize: 12, fontWeight: '500' }}>
            {props.eyebrow}
          </Text>
          <Text
            color={c.foreground}
            maxLines={2}
            overflow="ellipsis"
            modifiers={[padding(0, 2, 0, 2)]}
            style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3 }}>
            {props.title}
          </Text>
          <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 12 }}>
            {props.detail}
          </Text>
        </Column>
        <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 11 }}>
          {props.streakLabel ? `${props.streakLabel} · ${props.footer}` : props.footer}
        </Text>
      </Column>
      <Box modifiers={[width(1), fillMaxHeight(), background(c.border)]} />
      <Column modifiers={[padding(14, 0, 0, 0)]}>
        <Text color={c.muted} style={{ fontSize: 12, fontWeight: '500' }}>
          Volume
        </Text>
        <Text color={c.foreground} maxLines={1} style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3 }}>
          {props.volume}
        </Text>
        <Text color={c.muted} maxLines={1} style={{ fontSize: 11 }}>
          This week
        </Text>
        {props.volumeDelta ? (
          <Text
            color={props.volumeUp ? c.primary : c.muted}
            maxLines={1}
            style={{ fontSize: 12, fontWeight: '600' }}
            modifiers={[padding(0, 8, 0, 0)]}>
            {`${props.volumeDelta} vs last`}
          </Text>
        ) : null}
      </Column>
    </Row>
  );
};

export default createWidget<NextUpProps>('NextUp', NextUpWidget, {
  eyebrow: 'Ready',
  title: 'Incline',
  detail: 'Open Incline once to sync',
  streakLabel: null,
  footer: 'Next workout and weekly volume',
  volume: '—',
  volumeDelta: null,
  volumeUp: true,
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
