/**
 * Android ongoing notification — the running rest timer on the lock screen
 * and in the shade.
 *
 * Reference (Android system media / Clock timer notifications, not the app
 * theme): app header with the live count-down chronometer, a small muted
 * "Rest · Exercise" label, one large line, a muted "Next: Set 3 · 80 kg × 8"
 * line, then plain text actions "Skip" and "+30s" bottom-right. No card, no
 * brand colours; system greys picked from `colorScheme`.
 *
 * The countdown ticks natively: `countdownTo` is read by the patched
 * `CustomNotificationBuilder` (patches/expo-widgets@58.0.22.patch), which sets
 * a count-down chronometer and a matching `timeoutAfter`, so no JS runs per
 * second and the notification removes itself when rest ends. RemoteViews has
 * no countdown component exposed by expo-widgets, so the large body line is
 * the end time ("Until 2:32 PM") rather than a second ticking clock.
 *
 * Runs in the isolated widget runtime: no hooks, no imports at runtime, only
 * props. Button `onClick` return values are merged into props by the native
 * receiver even while the app process is dead; the app listener then applies
 * the same action to `rest-timer-store` when JS is alive (see
 * `src/lib/rest-ongoing/notify.android.ts`).
 */
import { Column, Row, Text, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { createCustomNotification } from 'expo-widgets';

import type { RestOngoingProps } from '@/lib/rest-ongoing/build';

const RestNotification = createCustomNotification<RestOngoingProps>(
  'RestTimer',
  (props, environment) => {
    'widget';
    const dark = environment.colorScheme === 'dark';
    const fg = dark ? '#E3E3E3' : '#1F1F1F';
    const muted = dark ? '#C4C7C5' : '#444746';
    const added = props.added ?? 0;
    const last = props.endsLabels.length - 1;
    const ends = props.finished ? 'Rest skipped' : props.endsLabels[Math.min(added, last)];

    const label = (
      <Text color={muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 13 }}>
        {props.label}
      </Text>
    );
    const next = props.next ? (
      <Text color={muted} maxLines={1} overflow="ellipsis" style={{ fontSize: 14 }}>
        {props.next}
      </Text>
    ) : null;

    return {
      collapsed: (
        <Column modifiers={[fillMaxWidth()]}>
          {label}
          {/* ~48 dp under the header: two lines. The chronometer is in the header. */}
          <Text color={fg} maxLines={1} overflow="ellipsis" style={{ fontSize: 15 }}>
            {props.finished ? ends : (props.next ?? ends)}
          </Text>
        </Column>
      ),
      expanded: (
        <Column modifiers={[fillMaxWidth()]}>
          {label}
          <Text
            color={fg}
            maxLines={1}
            modifiers={[padding(0, 2, 0, 2)]}
            style={{ fontSize: 28, fontWeight: '400' }}>
            {ends}
          </Text>
          {next}
          {props.finished ? null : (
            <Row horizontalArrangement="end" modifiers={[fillMaxWidth(), padding(0, 4, 0, 0)]}>
              <TextButton
                {...({ target: 'rest-skip' } as object)}
                colors={{ contentColor: fg }}
                onClick={() => ({ finished: true })}>
                <Text color={fg}>Skip</Text>
              </TextButton>
              <TextButton
                {...({ target: 'rest-add' } as object)}
                colors={{ contentColor: fg }}
                onClick={() =>
                  added >= last ? {} : { countdownTo: props.countdownTo + 30000, added: added + 1 }
                }>
                <Text color={fg}>+30s</Text>
              </TextButton>
            </Row>
          )}
        </Column>
      ),
    };
  },
);

export default RestNotification;
