/**
 * Android home-screen widget (2x2) — "how is this week going?".
 *
 * Reference (Hevy "Last workouts", Lyfta streak calendar): plain card, one
 * headline number, Mon–Sun dots (filled = trained, ring = today). No brand
 * chrome, no progress bar — the dots are the progress.
 *
 * Same rules as NextUp: the runtime only gets props, so copy, days and both
 * palettes arrive pre-formatted from `src/lib/widgets/build-this-week.ts`.
 */
import { Box, Column, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  border,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  padding,
  paddingAll,
  size,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { ThisWeekProps } from '@/lib/widgets/build-this-week';

const ThisWeekWidget = (props: ThisWeekProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Column
      verticalArrangement="spaceBetween"
      modifiers={[fillMaxSize(), background(c.card), cornerRadius(24), paddingAll(14)]}>
      <Column>
        <Text color={c.muted} style={{ fontSize: 12, fontWeight: '500' }}>
          {props.eyebrow}
        </Text>
        <Row verticalAlignment="bottom" modifiers={[padding(0, 2, 0, 0)]}>
          <Text color={c.foreground} style={{ fontSize: 32, fontWeight: '700', letterSpacing: -1 }}>
            {props.count}
          </Text>
          <Text
            color={c.muted}
            maxLines={1}
            style={{ fontSize: 13, fontWeight: '500' }}
            modifiers={[padding(6, 0, 0, 6)]}>
            {props.countLabel}
          </Text>
        </Row>
      </Column>
      <Column>
        <Row horizontalArrangement="spaceBetween" modifiers={[fillMaxWidth()]}>
          {props.days.map((d, i) => (
            <Column key={i} horizontalAlignment="center">
              <Box
                modifiers={[
                  size(16, 16),
                  cornerRadius(999),
                  background(d.trained ? c.primary : c.border),
                  ...(d.isToday && !d.trained ? [border(2, c.primary)] : []),
                ]}
              />
              <Text
                color={d.isToday ? c.foreground : c.muted}
                style={{ fontSize: 10, fontWeight: d.isToday ? '700' : '500' }}
                modifiers={[padding(0, 3, 0, 0)]}>
                {d.letter}
              </Text>
            </Column>
          ))}
        </Row>
        <Text
          color={c.muted}
          maxLines={1}
          overflow="ellipsis"
          style={{ fontSize: 11 }}
          modifiers={[padding(0, 6, 0, 0)]}>
          {props.footer}
        </Text>
      </Column>
    </Column>
  );
};

export default createWidget<ThisWeekProps>('ThisWeek', ThisWeekWidget, {
  eyebrow: 'This week',
  count: '0',
  countLabel: 'of 4 workouts',
  days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter) => ({ letter, trained: false, isToday: false })),
  footer: 'Open Incline once to sync',
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
