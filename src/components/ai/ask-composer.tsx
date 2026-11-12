import { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp, BarChart3, CalendarRange, Dumbbell, History, Plus, Square, Trophy } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';
import { ListGroup, ListRow, SectionLabel } from '@/components/layout';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { BLUR_METHOD, blurTint, type BlurTarget } from '@/components/ui/edge-blur';
import { Tappable } from '@/components/ui/tappable';
import { cn } from '@/lib/cn';
import { useAppColorScheme } from '@/lib/use-color-scheme';

/** Quick questions the + sheet drops into the composer (attach a workout/exercise joins these in Phase 2). */
const ABOUT = [
  { label: 'My last workout', text: 'How did my last workout go?', icon: History },
  { label: 'My best lifts', text: 'What are my best lifts?', icon: Trophy },
  { label: 'This week', text: 'How is my training this week?', icon: BarChart3 },
  { label: 'Muscle balance', text: 'Which muscles am I undertraining?', icon: Dumbbell },
] as const;

const TOOLS: { title: string; href: Href }[] = [
  { title: 'Build a plan', href: '/(app)/plan-builder' as Href },
  { title: 'Adjust my program', href: '/(app)/program-adjust' as Href },
  { title: 'Deload check', href: '/(app)/deload' as Href },
];

/**
 * Ask's composer, shared by idle and threads: `+` (quick questions and
 * tools now; attachments in Phase 2), the input, and send/Stop. Voice joins
 * as hold-to-talk in Phase 5 (ASK-UI.md).
 *
 * With `blurTarget` it floats: a frosted pill over the content (the
 * `BlurTargetView` it sits above), lifted by a shadow, not docked to the edge.
 */
export function AskComposer({
  value,
  onChangeText,
  onSend,
  running,
  onStop,
  placeholder = 'Ask about your training',
  footnote,
  blurTarget,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSend: (t: string) => void;
  running?: boolean;
  onStop?: () => void;
  placeholder?: string;
  footnote?: string;
  blurTarget?: BlurTarget;
}) {
  const scheme = useAppColorScheme();
  const router = useRouter();
  const [plus, setPlus] = useState(false);
  const canSend = !!value.trim();

  return (
    <View className={blurTarget ? 'rounded-3xl shadow-lg' : undefined}>
      <View
        className={cn(
          'flex-row items-end gap-2 overflow-hidden rounded-3xl border p-1.5',
          blurTarget ? 'border-hairline bg-surface1/70' : 'border-input bg-surface1',
        )}>
        {blurTarget ? (
          <BlurView intensity={40} tint={blurTint(scheme)} blurTarget={blurTarget} blurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} />
        ) : null}
        <Tappable
          onPress={() => setPlus(true)}
          pressedOpacity={0.55}
          accessibilityRole="button"
          accessibilityLabel="Add to your question"
          className="h-10 w-10 items-center justify-center rounded-full">
          <Icon icon={Plus} size={20} color="muted-foreground" />
        </Tappable>
        <Input
          className="max-h-32 min-h-10 flex-1 border-0 bg-transparent px-0 py-2"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          multiline
          maxLength={1000}
          accessibilityLabel="Your question"
        />
        <Tappable
          onPress={() => (running ? onStop?.() : onSend(value))}
          disabled={!running && !canSend}
          pressedOpacity={0.55}
          accessibilityRole="button"
          accessibilityLabel={running ? 'Stop answering' : 'Send'}
          className={cn('h-10 w-10 items-center justify-center rounded-full bg-primary', !running && !canSend && 'opacity-40')}>
          <Icon icon={running ? Square : ArrowUp} size={running ? 14 : 18} color="primary-foreground" />
        </Tappable>
      </View>
      {footnote ? <Caption className="mt-1.5 text-center">{footnote}</Caption> : null}

      <Sheet open={plus} onOpenChange={setPlus} title="Ask about" mode="fit">
        <View className="gap-5 pb-4">
          <ListGroup>
            {ABOUT.map((a) => (
              <ListRow
                key={a.label}
                icon={<Icon icon={a.icon} size={18} color="muted-foreground" />}
                title={a.label}
                onPress={() => {
                  setPlus(false);
                  onChangeText(a.text);
                }}
              />
            ))}
          </ListGroup>
          <View>
            <SectionLabel>Tools</SectionLabel>
            <ListGroup>
              {TOOLS.map((t) => (
                <ListRow
                  key={t.title}
                  icon={<Icon icon={CalendarRange} size={18} color="muted-foreground" />}
                  title={t.title}
                  onPress={() => {
                    setPlus(false);
                    router.push(t.href);
                  }}
                />
              ))}
            </ListGroup>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
