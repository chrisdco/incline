import { useRef, useState, type ComponentRef } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Linking, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  ArrowUp,
  BarChart3,
  CalendarRange,
  Dumbbell,
  Gauge,
  History,
  Mic,
  Plus,
  SlidersHorizontal,
  Square,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { useHoldToTalk, type VoiceProblem } from '@/ai/voice';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Tappable } from '@/components/ui/tappable';
import { cn } from '@/lib/cn';
import { motionDuration } from '@/styles/motion';

type MenuItem = { label: string; icon: LucideIcon } & ({ text: string } | { href: Href });

/** Quick questions drop into the input; tools open their screen. Attach (exercise, workout, routine) joins in Phase 2. */
const ASK: MenuItem[] = [
  { label: 'My last workout', text: 'How did my last workout go?', icon: History },
  { label: 'My best lifts', text: 'What are my best lifts?', icon: Trophy },
  { label: 'This week', text: 'How is my training this week?', icon: BarChart3 },
  { label: 'Muscle balance', text: 'Which muscles am I undertraining?', icon: Dumbbell },
];
const TOOLS: MenuItem[] = [
  { label: 'Build a plan', href: '/(app)/plan-builder' as Href, icon: CalendarRange },
  { label: 'Adjust my program', href: '/(app)/program-adjust' as Href, icon: SlidersHorizontal },
  { label: 'Deload check', href: '/(app)/deload' as Href, icon: Gauge },
];

const VOICE_PROBLEM: Record<VoiceProblem, string> = {
  permission: 'Microphone access is off',
  unavailable: "Speech recognition isn't available on this phone",
  failed: "Couldn't catch that, try again",
};

/** Gap between the composer and the menu above it. */
const MENU_GAP = 8;
const MENU_W = 248;

/** Where the menu anchors: the composer's top-left, in window coordinates. */
type Anchor = { x: number; y: number };

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <Tappable
      onPress={onPress}
      pressedOpacity={0.55}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5">
      <Icon icon={item.icon} size={18} color="muted-foreground" />
      <Body className="flex-1">{item.label}</Body>
    </Tappable>
  );
}

/** While holding: what to do next, and where speech is recognised when it isn't on the phone. */
function voiceNote(listening: boolean, onDevice: boolean, footnote?: string): string | undefined {
  if (!listening) return footnote;
  return onDevice ? 'Release to send' : "Release to send · speech is recognised by your phone's speech service";
}

/**
 * Ask's composer, shared by idle and threads: `+`, the input, and send/Stop.
 * `+` opens a small menu right above it (ChatGPT/Claude style), not a
 * sheet: quick questions and tools now, attachments in Phase 2. With an
 * empty input the send button is a mic: hold to talk, release to send
 * (ASK-UI.md "Voice"); builds without the speech module show no mic.
 *
 * `floating` makes it a solid pill with a shadow, for screens where content
 * scrolls beneath it (EdgeBlur blurs what passes under it).
 */
export function AskComposer({
  value,
  onChangeText,
  onSend,
  running,
  onStop,
  placeholder = 'Ask about your training',
  footnote,
  floating,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSend: (t: string) => void;
  running?: boolean;
  onStop?: () => void;
  placeholder?: string;
  footnote?: string;
  floating?: boolean;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const shell = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const canSend = !!value.trim();
  const { toast } = useToast();
  const voice = useHoldToTalk({
    onPartial: onChangeText,
    onFinal: onSend,
    onProblem: (p) =>
      toast({
        title: VOICE_PROBLEM[p],
        variant: 'warning',
        ...(p === 'permission' ? { action: { label: 'Settings', onPress: () => void Linking.openSettings() } } : null),
      }),
  });
  const showMic = voice.available && !running && (!canSend || voice.listening);

  const openMenu = () => shell.current?.measureInWindow((x, y) => setAnchor({ x, y }));
  const close = () => setAnchor(null);
  const pick = (item: MenuItem) => {
    close();
    if ('text' in item) onChangeText(item.text);
    else router.push(item.href);
  };

  return (
    <View>
      <View
        ref={shell}
        className={cn(
          'flex-row items-end gap-2 rounded-3xl border p-1.5',
          floating ? 'border-divider bg-surface2 shadow-lg' : 'border-input bg-surface1',
        )}>
        <Tappable
          onPress={openMenu}
          pressedOpacity={0.55}
          accessibilityRole="button"
          accessibilityLabel="Add to your question"
          accessibilityState={{ expanded: !!anchor }}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface3">
          <Icon icon={Plus} size={20} color="foreground" />
        </Tappable>
        <Input
          className="max-h-32 min-h-10 flex-1 border-0 bg-transparent px-1 py-2"
          value={value}
          onChangeText={onChangeText}
          placeholder={voice.listening ? 'Listening…' : placeholder}
          multiline
          maxLength={1000}
          accessibilityLabel="Your question"
        />
        {showMic ? (
          <Pressable
            onPressIn={() => void voice.start()}
            onPressOut={voice.stop}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Hold to talk"
            accessibilityHint="Release to send"
            className={cn(
              'h-10 w-10 items-center justify-center rounded-full',
              voice.listening ? 'scale-110 bg-primary' : 'bg-surface3',
            )}>
            <Icon icon={Mic} size={18} color={voice.listening ? 'primary-foreground' : 'foreground'} />
          </Pressable>
        ) : (
        <Tappable
          onPress={() => (running ? onStop?.() : onSend(value))}
          disabled={!running && !canSend}
          pressedOpacity={0.55}
          accessibilityRole="button"
          accessibilityLabel={running ? 'Stop answering' : 'Send'}
          className={cn('h-10 w-10 items-center justify-center rounded-full bg-primary', !running && !canSend && 'opacity-40')}>
          <Icon icon={running ? Square : ArrowUp} size={running ? 14 : 18} color="primary-foreground" />
        </Tappable>
        )}
      </View>
      {voiceNote(voice.listening, voice.onDevice, footnote) ? (
        <Caption className="mt-1.5 text-center">{voiceNote(voice.listening, voice.onDevice, footnote)}</Caption>
      ) : null}

      <Modal visible={!!anchor} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable className="flex-1" onPress={close} accessibilityRole="button" accessibilityLabel="Close menu">
          {anchor ? (
            <Animated.View
              entering={ZoomIn.duration(motionDuration.enter).easing(Easing.out(Easing.cubic))}
              exiting={FadeOut.duration(motionDuration.exit)}
              accessibilityRole="menu"
              className="absolute rounded-2xl border border-divider bg-surface2 p-1.5 shadow-lg"
              style={{ left: anchor.x, bottom: height - anchor.y + MENU_GAP, width: MENU_W, transformOrigin: 'bottom left' }}>
              {/* Swallows taps so the backdrop doesn't close the menu under a row. */}
              <Pressable>
                {ASK.map((item) => (
                  <MenuRow key={item.label} item={item} onPress={() => pick(item)} />
                ))}
                <View className="mx-3 my-1 h-px bg-divider" />
                {TOOLS.map((item) => (
                  <MenuRow key={item.label} item={item} onPress={() => pick(item)} />
                ))}
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
