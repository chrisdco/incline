/**
 * Android home-screen widget (2x2) — "how is this week going?".
 *
 * Same rules as NextUp: the runtime only gets props, so the count, goal,
 * progress ratio, footer copy and both palettes arrive pre-formatted from
 * `src/lib/widgets/build-this-week.ts`.
 */
import { Box, Column, LinearProgressIndicator, Row, Text } from '@expo/ui/jetpack-compose';
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

import type { ThisWeekProps } from '@/lib/widgets/build-this-week';

const ThisWeekWidget = (props: ThisWeekProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Column
      verticalArrangement="spaceBetween"
      modifiers={[fillMaxSize(), background(c.background), cornerRadius(24), paddingAll(14)]}>
      <Column>
        <Box modifiers={[width(20), height(3), background(c.primary), cornerRadius(2)]} />
        <Text
          color={c.muted}
          style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2 }}
          modifiers={[padding(0, 10, 0, 0)]}>
          {props.eyebrow}
        </Text>
        <Row verticalAlignment="bottom" modifiers={[padding(0, 2, 0, 0)]}>
          <Text color={c.foreground} style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1 }}>
            {props.count}
          </Text>
          {props.goalLabel ? (
            <Text
              color={c.muted}
              style={{ fontSize: 15, fontWeight: '500' }}
              modifiers={[padding(2, 0, 0, 5)]}>
              {props.goalLabel}
            </Text>
          ) : null}
        </Row>
        {props.showProgress ? (
          <LinearProgressIndicator
            progress={props.progress}
            color={c.primary}
            trackColor={c.border}
            modifiers={[fillMaxWidth(), padding(0, 4, 0, 0), height(5)]}
          />
        ) : null}
      </Column>
      <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 10 }}>
        {props.footer}
      </Text>
    </Column>
  );
};

export default createWidget<ThisWeekProps>('ThisWeek', ThisWeekWidget, {
  eyebrow: 'THIS WEEK',
  count: '0',
  goalLabel: '/4',
  progress: 0,
  showProgress: true,
  footer: 'Open Incline once to sync this widget',
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
