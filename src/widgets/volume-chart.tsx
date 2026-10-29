/**
 * Volume (2x2): last 7 days total + one bar per day, today emphasised.
 * Reference: Hevy "Volume" chart widget.
 *
 * Isolated widget runtime: props only, no module scope (see next-up.tsx).
 * The whole card is a Button whose `open:` target launches the deep link
 * (patches/expo-widgets@58.0.22.patch).
 */
import { Box, Button, Column, Row, Text } from '@expo/ui/jetpack-compose';
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

import type { VolumeChartProps } from '@/lib/widgets/build-extra';

const VolumeChartWidget = (
  props: VolumeChartProps,
  environment: { colorScheme?: 'light' | 'dark' },
) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Button
      {...({ target: 'open:incline:///progress' } as object)}
      colors={{ containerColor: c.card }}
      modifiers={[fillMaxSize(), cornerRadius(24)]}>
      <Column verticalArrangement="spaceBetween" modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Column>
          <Text color={c.muted} style={{ fontSize: 12, fontWeight: '500' }}>
            Volume
          </Text>
          <Text
            color={c.foreground}
            maxLines={1}
            style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
            {props.total}
          </Text>
          <Text color={c.muted} style={{ fontSize: 11 }}>
            {props.caption}
          </Text>
        </Column>
        <Row
          horizontalArrangement="spaceBetween"
          verticalAlignment="bottom"
          modifiers={[fillMaxWidth()]}>
          {props.bars.map((b, i) => (
            <Column key={i} horizontalAlignment="center">
              <Box
                modifiers={[
                  width(12),
                  height(Math.max(3, Math.round(b.ratio * 44))),
                  cornerRadius(4),
                  background(b.ratio > 0 ? c.primary : c.border),
                ]}
              />
              <Text
                color={b.isToday ? c.foreground : c.muted}
                style={{ fontSize: 9, fontWeight: b.isToday ? '700' : '500' }}
                modifiers={[padding(0, 3, 0, 0)]}>
                {b.letter}
              </Text>
            </Column>
          ))}
        </Row>
      </Column>
    </Button>
  );
};

export default createWidget<VolumeChartProps>('VolumeChart', VolumeChartWidget, {
  total: '—',
  caption: 'Last 7 days',
  bars: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter) => ({
    ratio: 0,
    letter,
    isToday: false,
  })),
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
