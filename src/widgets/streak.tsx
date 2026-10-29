/**
 * Streak (2x1): consecutive weeks with a workout.
 * Reference: Hevy / Lyfta "Streak" — big number, unit, flame. Better: the
 * caption says what keeps it alive ("Train this week to keep it").
 *
 * Isolated widget runtime: props only, no module scope (see next-up.tsx).
 * The whole card is a Button whose `open:` target launches the deep link
 * (patches/expo-widgets@58.0.22.patch).
 */
import { Button, Column, Row, Text } from '@expo/ui/jetpack-compose';
import {
  cornerRadius,
  fillMaxSize,
  padding,
  paddingAll,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { StreakProps } from '@/lib/widgets/build-extra';

const StreakWidget = (props: StreakProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Button
      {...({ target: 'open:incline:///progress' } as object)}
      colors={{ containerColor: c.card }}
      modifiers={[fillMaxSize(), cornerRadius(24)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Column modifiers={[weight(1)]}>
          <Text color={c.muted} style={{ fontSize: 12, fontWeight: '500' }}>
            Streak
          </Text>
          <Row verticalAlignment="bottom">
            <Text
              color={c.foreground}
              style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>
              {props.value}
            </Text>
            <Text
              color={c.muted}
              style={{ fontSize: 13, fontWeight: '500' }}
              modifiers={[padding(4, 0, 0, 4)]}>
              {props.unit}
            </Text>
          </Row>
          <Text color={c.muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 10 }}>
            {props.caption}
          </Text>
        </Column>
        <Text style={{ fontSize: 26 }} color={props.active ? '#F97316' : c.border}>
          {props.active ? '🔥' : '○'}
        </Text>
      </Row>
    </Button>
  );
};

export default createWidget<StreakProps>('Streak', StreakWidget, {
  value: '0',
  unit: 'weeks',
  caption: 'Open Incline once to sync',
  active: false,
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
