/**
 * Quick start (2x1): one tap into a workout, or back into the one running.
 * Reference: Hevy "Quick access". Label, bold action, accent button.
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
  paddingAll,
  size,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { QuickStartProps } from '@/lib/widgets/build-extra';

const QuickStartWidget = (
  props: QuickStartProps,
  environment: { colorScheme?: 'light' | 'dark' },
) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  return (
    <Button
      {...({ target: `open:${props.url}` } as object)}
      colors={{ containerColor: c.card }}
      modifiers={[fillMaxSize(), cornerRadius(24)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Column modifiers={[weight(1)]}>
          <Text
            color={c.muted}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 12, fontWeight: '500' }}>
            {props.eyebrow}
          </Text>
          <Text color={c.foreground} maxLines={1} style={{ fontSize: 17, fontWeight: '700' }}>
            {props.title}
          </Text>
        </Column>
        <Box
          contentAlignment="center"
          modifiers={[size(36, 36), cornerRadius(999), background(c.primary)]}>
          <Text color={c.card} style={{ fontSize: 22, fontWeight: '600' }}>
            {props.resume ? '›' : '+'}
          </Text>
        </Box>
      </Row>
    </Button>
  );
};

export default createWidget<QuickStartProps>('QuickStart', QuickStartWidget, {
  eyebrow: 'Quick start',
  title: 'Start workout',
  url: 'incline:///start',
  resume: false,
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
