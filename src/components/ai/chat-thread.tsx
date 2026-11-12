import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ArrowUp, Square } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Tappable } from '@/components/ui/tappable';
import { useAppAuth } from '@/auth/use-app-auth';
import { useChatRun } from '@/ai/use-chat-run';
import type { ChatMessageRecord, ChatPart, SourcePart } from '@/contracts/ai/chat';
import { textOf } from '@/contracts/ai/chat';
import { chatMessagesQuery } from '@/lib/query-keys';
import { cn } from '@/lib/cn';

import { SourceChip } from './markers';
import { SuggestionChip } from './suggestion-chip';

/**
 * One Ask thread (AI-CHAT Phase 1). Anatomy, after the assistant-chat
 * convention (ChatGPT / Claude apps): the user's turn is a right-aligned
 * tinted bubble; the answer is plain text on the page, never a bubble, with
 * what it read as source chips underneath; while working, one muted line
 * names the read in progress ("Looking at your records…"). Composer pinned
 * at the bottom; send becomes Stop while answering.
 */

const STARTERS = ["How's my bench going?", 'What are my best lifts?', 'Which muscles am I undertraining?'];

/** Tool name → the working line shown while it runs. */
const WORKING: Record<string, string> = {
  get_exercise_history: 'Looking at that exercise…',
  get_personal_records: 'Looking at your records…',
  get_training_summary: 'Counting your sets per muscle…',
  list_workouts: 'Looking at your recent workouts…',
  get_workout: 'Opening that workout…',
  list_routines: 'Looking at your routines…',
  get_routine: 'Opening that routine…',
  get_profile: 'Checking your profile…',
  search_exercises: 'Searching exercises…',
};

type Row =
  | { key: string; kind: 'user'; text: string }
  | { key: string; kind: 'assistant'; parts: readonly ChatPart[]; live: boolean };

function rowsFor(messages: readonly ChatMessageRecord[], pendingUser: string | null, live: readonly ChatPart[], running: boolean): Row[] {
  const rows: Row[] = messages.map((m) =>
    m.role === 'user' ? { key: m.id, kind: 'user', text: textOf(m.parts) } : { key: m.id, kind: 'assistant', parts: m.parts, live: false },
  );
  if (pendingUser) rows.push({ key: 'pending-user', kind: 'user', text: pendingUser });
  if (running) rows.push({ key: 'live', kind: 'assistant', parts: live, live: true });
  return rows;
}

/** `**bold**` and `- ` bullets, the only markdown models reliably use in short answers. */
function RichText({ text }: { text: string }) {
  const lines = text.trim().split('\n');
  return (
    <View className="gap-1.5">
      {lines.map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const body = line.replace(/^\s*[-*•]\s+/, '').replace(/^#+\s*/, '');
        if (!body.trim()) return null;
        const segs = body.split('**');
        const inline: ReactNode = segs.map((s, j) =>
          j % 2 === 1 ? (
            <Text key={j} className="font-semibold text-foreground">
              {s}
            </Text>
          ) : (
            s
          ),
        );
        return bullet ? (
          <View key={i} className="flex-row gap-2 pl-1">
            <Body className="text-muted-foreground">•</Body>
            <Body className="flex-1 text-foreground">{inline}</Body>
          </View>
        ) : (
          <Body key={i} className="text-foreground">
            {inline}
          </Body>
        );
      })}
    </View>
  );
}

function AssistantRow({ parts, live }: { parts: readonly ChatPart[]; live: boolean }) {
  const text = textOf(parts);
  const sources = parts.filter((p): p is SourcePart => p.type === 'source');
  const notices = parts.filter((p) => p.type === 'notice');
  const done = new Set(parts.flatMap((p) => (p.type === 'tool_result' ? [p.callId] : [])));
  const working = parts.filter((p) => p.type === 'tool_call' && !done.has(p.id)).map((p) => (p as { name: string }).name);
  const workingLine = live ? (working.length ? (WORKING[working[0]!] ?? 'Reading your data…') : text ? null : 'Thinking…') : null;

  return (
    <View className="gap-2 py-2">
      {text ? <RichText text={text} /> : null}
      {workingLine ? (
        <Caption className="italic" accessibilityLiveRegion="polite">
          {workingLine}
        </Caption>
      ) : null}
      {notices.map((n, i) =>
        n.type === 'notice' ? (
          <Caption key={i} className={n.level === 'error' ? 'text-destructive' : undefined}>
            {n.text}
          </Caption>
        ) : null,
      )}
      {sources.length ? (
        <View className="flex-row flex-wrap gap-1.5" accessibilityLabel={`Based on ${sources.map((s) => s.label).join(', ')}`}>
          {sources.map((s) => (
            <SourceChip key={s.label} label={s.label} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UserRow({ text }: { text: string }) {
  return (
    <View className="items-end py-2">
      <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5">
        <Body className="text-foreground">{text}</Body>
      </View>
    </View>
  );
}

export function ChatThread({ threadUuid, initialQuestion }: { threadUuid: string; initialQuestion?: string }) {
  const { userId, getToken } = useAppAuth();
  const { data: messages = [] } = useQuery(chatMessagesQuery(threadUuid));
  const run = useChatRun({ threadUuid, messages, getToken, userId });
  const [draft, setDraft] = useState('');
  const asked = useRef(false);
  const { send } = run;

  // A starter from the Ask screen is sent once, on open.
  useEffect(() => {
    if (!initialQuestion || asked.current) return;
    asked.current = true;
    send(initialQuestion);
  }, [initialQuestion, send]);

  const rows = useMemo(() => rowsFor(messages, run.pendingUser, run.parts, run.running), [messages, run.pendingUser, run.parts, run.running]);
  const empty = rows.length === 0;

  const submit = (text: string) => {
    if (!text.trim() || run.running) return;
    setDraft('');
    run.send(text);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0} className="flex-1">
      {empty ? (
        <View className="flex-1 justify-end gap-3 px-4 pb-4">
          <Caption className="px-1">Ask about your training. Answers come from your logged workouts, and nothing changes in the app.</Caption>
          <View className="flex-row flex-wrap gap-2">
            {STARTERS.map((s) => (
              <SuggestionChip key={s} label={s} onPress={() => submit(s)} />
            ))}
          </View>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.kind}
          renderItem={({ item }) => (item.kind === 'user' ? <UserRow text={item.text} /> : <AssistantRow parts={item.parts} live={item.live} />)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}
      <View className="flex-row items-end gap-2 border-t border-border/60 bg-background px-4 pb-3 pt-2">
        <Input
          className="max-h-32 min-h-12 flex-1 bg-surface1 py-3"
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your training"
          multiline
          maxLength={1000}
          accessibilityLabel="Your question"
        />
        <Tappable
          onPress={() => (run.running ? run.stop() : submit(draft))}
          disabled={!run.running && !draft.trim()}
          pressedOpacity={0.55}
          accessibilityRole="button"
          accessibilityLabel={run.running ? 'Stop answering' : 'Send'}
          className={cn('h-12 w-12 items-center justify-center rounded-full bg-primary', !run.running && !draft.trim() && 'opacity-40')}>
          <Icon icon={run.running ? Square : ArrowUp} size={run.running ? 16 : 20} color="primary-foreground" />
        </Tappable>
      </View>
    </KeyboardAvoidingView>
  );
}
