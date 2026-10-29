/**
 * Month (4x2): calendar of trained days + this month's workouts, duration
 * and volume, each with the change vs the same point last month.
 * Reference: Hevy "Chart and stats", Lyfta "Monthly progress". Better: the
 * comparison is to-date (day 12 vs day 12), so mid-month never reads as a drop.
 *
 * Isolated widget runtime: props only, no module scope (see next-up.tsx).
 * The whole card is a Button whose `open:` target launches the deep link
 * (patches/expo-widgets@58.0.22.patch).
 */
import { Box, Button, Column, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxHeight,
  fillMaxSize,
  fillMaxWidth,
  padding,
  paddingAll,
  size,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { MonthProps } from '@/lib/widgets/build-extra';

const MonthWidget = (props: MonthProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Button
      {...({ target: 'open:incline:///calendar' } as object)}
      colors={{ containerColor: c.card }}
      modifiers={[fillMaxSize(), cornerRadius(24)]}>
      <Row modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Column modifiers={[weight(1.25), fillMaxHeight()]}>
          <Text
            color={c.foreground}
            style={{ fontSize: 15, fontWeight: '700' }}
            modifiers={[padding(0, 0, 0, 4)]}>
            {props.title}
          </Text>
          <Row horizontalArrangement="spaceBetween" modifiers={[fillMaxWidth()]}>
            {props.weekdayLetters.map((l, i) => (
              <Box key={i} contentAlignment="center" modifiers={[size(18, 12)]}>
                <Text color={c.muted} style={{ fontSize: 8, fontWeight: '600' }}>
                  {l}
                </Text>
              </Box>
            ))}
          </Row>
          {props.weeks.map((week, w) => (
            <Row
              key={w}
              horizontalArrangement="spaceBetween"
              modifiers={[fillMaxWidth(), padding(0, 1, 0, 0)]}>
              {week.map((d, i) => (
                <Box
                  key={i}
                  contentAlignment="center"
                  modifiers={[
                    size(18, 18),
                    cornerRadius(999),
                    ...(d.trained ? [background(c.primary)] : []),
                  ]}>
                  <Text
                    color={d.trained ? c.card : d.isToday ? c.primary : c.foreground}
                    style={{
                      fontSize: 9,
                      fontWeight: d.trained || d.isToday ? '700' : '500',
                    }}>
                    {d.label}
                  </Text>
                </Box>
              ))}
            </Row>
          ))}
        </Column>
        <Column
          verticalArrangement="spaceBetween"
          modifiers={[weight(1), fillMaxHeight(), padding(14, 2, 0, 2)]}>
          {props.stats.map((s, i) => (
            <Column key={i}>
              <Row verticalAlignment="bottom">
                <Text color={c.foreground} maxLines={1} style={{ fontSize: 15, fontWeight: '700' }}>
                  {s.value}
                </Text>
                {s.delta ? (
                  <Text
                    color={s.up ? c.primary : c.muted}
                    maxLines={1}
                    style={{ fontSize: 10, fontWeight: '600' }}
                    modifiers={[padding(5, 0, 0, 1)]}>
                    {s.delta}
                  </Text>
                ) : null}
              </Row>
              <Text color={c.muted} style={{ fontSize: 10 }}>
                {s.label}
              </Text>
            </Column>
          ))}
        </Column>
      </Row>
    </Button>
  );
};

export default createWidget<MonthProps>('Month', MonthWidget, {
  title: 'This month',
  weekdayLetters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  weeks: [],
  stats: [
    { value: '0', label: 'Workouts', delta: '', up: true },
    { value: '0m', label: 'Duration', delta: '', up: true },
    { value: '—', label: 'Volume', delta: '', up: true },
  ],
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
