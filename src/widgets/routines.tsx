/**
 * Routines (4x3): up to six routines, most recently trained first; a tap
 * opens that routine ready to start. Reference: Hevy "Last routines".
 *
 * Isolated widget runtime: props only, no module scope (see next-up.tsx).
 * Each tile is its own Button with an `open:` target
 * (patches/expo-widgets@58.0.22.patch); the card itself is not clickable.
 */
import { Box, Button, Column, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  border,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { RoutinesProps } from '@/lib/widgets/build-extra';

const RoutinesWidget = (props: RoutinesProps, environment: { colorScheme?: 'light' | 'dark' }) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Column modifiers={[fillMaxSize(), background(c.card), cornerRadius(24), paddingAll(14)]}>
      <Text
        color={c.foreground}
        style={{ fontSize: 15, fontWeight: '700' }}
        modifiers={[padding(0, 0, 0, 8)]}>
        {props.title}
      </Text>
      {props.empty ? (
        <Text color={c.muted} style={{ fontSize: 12 }}>
          {props.empty}
        </Text>
      ) : null}
      {props.rows.map((row, r) => (
        <Row key={r} modifiers={[fillMaxWidth(), padding(0, r === 0 ? 0 : 8, 0, 0)]}>
          {row.map((item, i) =>
            item.url ? (
              <Box key={i} modifiers={[weight(1), padding(i === 0 ? 0 : 8, 0, 0, 0)]}>
                <Button
                  {...({ target: `open:${item.url}` } as object)}
                  colors={{ containerColor: c.background }}
                  modifiers={[fillMaxWidth(), height(52), cornerRadius(14), border(1, c.border)]}>
                  <Box
                    contentAlignment="centerStart"
                    modifiers={[fillMaxSize(), padding(12, 0, 12, 0)]}>
                    <Text
                      color={c.foreground}
                      maxLines={2}
                      overflow="ellipsis"
                      style={{ fontSize: 13, fontWeight: '600' }}>
                      {item.name}
                    </Text>
                  </Box>
                </Button>
              </Box>
            ) : (
              <Box key={i} modifiers={[weight(1), height(52)]} />
            ),
          )}
        </Row>
      ))}
    </Column>
  );
};

export default createWidget<RoutinesProps>('Routines', RoutinesWidget, {
  title: 'Routines',
  rows: [],
  empty: 'Open Incline once to sync',
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
