import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurTargetView } from 'expo-blur';
import { Check, Paperclip } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { EdgeBlur, useBlurTarget } from '@/components/ui/edge-blur';
import { useAppAuth } from '@/auth/use-app-auth';
import { useChatRun } from '@/ai/use-chat-run';
import type { ChatMessageRecord, ChatPart, ContextPart, SourcePart } from '@/contracts/ai/chat';
import { textOf } from '@/contracts/ai/chat';
import { chatMessagesQuery } from '@/lib/query-keys';
import { aboutOf, answerCardsFor, followUpsFor, readLines } from '@/ai/chat-turn';

import { AnswerCardView } from './answer-cards';
import { AskComposer } from './ask-composer';
import { SourceChip } from './markers';
import { SuggestionChip } from './suggestion-chip';
import { ThinkingShimmer } from './thinking-shimmer';

/** Floating composer height plus its gap; the list pads by this so the last answer clears it. */
const DOCK_H = 64;

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
  | { key: string; kind: 'user'; text: string; about: ContextPart | null }
  | { key: string; kind: 'assistant'; parts: readonly ChatPart[]; live: boolean };

function rowsFor(
  messages: readonly ChatMessageRecord[],
  pendingUser: string | null,
  pendingAbout: ContextPart | null,
  live: readonly ChatPart[],
  running: boolean,
): Row[] {
  const rows: Row[] = messages.map((m) =>
    m.role === 'user' ? { key: m.id, kind: 'user', text: textOf(m.parts), about: aboutOf(m.parts) } : { key: m.id, kind: 'assistant', parts: m.parts, live: false },
  );
  if (pendingUser) rows.push({ key: 'pending-user', kind: 'user', text: pendingUser, about: pendingAbout });
  if (running) rows.push({ key: 'live', kind: 'assistant', parts: live, live: true });
  return rows;
}

/**
 * `**bold**` and `- ` bullets, the only markdown models reliably use in short
 * answers. Answers are read, not scanned: Geist at 16 on a 28 line, wider
 * paragraph gaps (ASK-UI.md "Type in chat").
 */
function RichText({ text }: { text: string }) {
  const lines = text.trim().split('\n');
  return (
    <View className="gap-2.5">
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
            <Body className="leading-7 text-muted-foreground">•</Body>
            <Body className="flex-1 leading-7 text-foreground">{inline}</Body>
          </View>
        ) : (
          <Body key={i} className="leading-7 text-foreground">
            {inline}
          </Body>
        );
      })}
    </View>
  );
}

function AssistantRow({ parts, live, onFollowUp }: { parts: readonly ChatPart[]; live: boolean; onFollowUp?: (q: string) => void }) {
  const text = textOf(parts);
  const sources = parts.filter((p): p is SourcePart => p.type === 'source');
  const notices = parts.filter((p) => p.type === 'notice');
  const done = new Set(parts.flatMap((p) => (p.type === 'tool_result' ? [p.callId] : [])));
  const working = parts.filter((p) => p.type === 'tool_call' && !done.has(p.id)).map((p) => (p as { name: string }).name);
  const workingLine = live ? (working.length ? (WORKING[working[0]!] ?? 'Reading your data…') : text ? null : 'Thinking…') : null;

  return (
    <View className="gap-2.5 py-2">
      {live
        ? null
        : readLines(parts).map((l) => (
            <View key={l} className="flex-row items-center gap-1.5">
              <Icon icon={Check} size={13} color="muted-foreground" />
              <Caption>{l}</Caption>
            </View>
          ))}
      {text ? <RichText text={text} /> : null}
      {live ? null : answerCardsFor(parts).map((c) => <AnswerCardView key={c.kind === 'trend' ? `trend:${c.exercise}` : c.kind} card={c} />)}
      {workingLine ? <ThinkingShimmer label={workingLine} /> : null}
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
      {onFollowUp ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {followUpsFor(parts).map((q) => (
            <SuggestionChip key={q} label={q} onPress={() => onFollowUp(q)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UserRow({ text, about }: { text: string; about: ContextPart | null }) {
  return (
    <View className="items-end gap-1.5 py-2">
      {about ? (
        <View className="max-w-[85%] flex-row items-center gap-1.5 rounded-full border border-hairline bg-surface1 px-3 py-1" accessibilityLabel={`About ${about.label}`}>
          <Icon icon={Paperclip} size={12} color="muted-foreground" />
          <Caption numberOfLines={1}>{about.label}</Caption>
        </View>
      ) : null}
      <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5">
        <Body className="text-foreground">{text}</Body>
      </View>
    </View>
  );
}

export function ChatThread({ threadUuid, initialQuestion, initialAbout = null }: { threadUuid: string; initialQuestion?: string; initialAbout?: ContextPart | null }) {
  const { userId, getToken } = useAppAuth();
  const { data: messages = [] } = useQuery(chatMessagesQuery(threadUuid));
  const run = useChatRun({ threadUuid, messages, getToken, userId });
  const [draft, setDraft] = useState('');
  const asked = useRef(false);
  const target = useBlurTarget();
  const { send } = run;

  // A starter from the Ask screen (or "Ask about this", with its attachment) is sent once, on open.
  const opening = useRef(initialAbout);
  useEffect(() => {
    if (!initialQuestion || asked.current) return;
    asked.current = true;
    send(initialQuestion, opening.current);
  }, [initialQuestion, send]);

  const rows = useMemo(() => rowsFor(messages, run.pendingUser, run.pendingAbout, run.parts, run.running), [messages, run.pendingUser, run.pendingAbout, run.parts, run.running]);
  const empty = rows.length === 0;

  const submit = (text: string) => {
    if (!text.trim() || run.running) return;
    setDraft('');
    run.send(text);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0} className="flex-1">
      <BlurTargetView ref={target} style={{ flex: 1 }}>
      {empty ? (
        <View className="flex-1 justify-end gap-3 px-4" style={{ paddingBottom: DOCK_H + 16 }}>
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
          renderItem={({ item, index }) =>
            item.kind === 'user' ? (
              <UserRow text={item.text} about={item.about} />
            ) : (
              <AssistantRow parts={item.parts} live={item.live} onFollowUp={index === rows.length - 1 && !run.running ? submit : undefined} />
            )
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: DOCK_H + 24 }}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}
      </BlurTargetView>
      <EdgeBlur edge="bottom" height={DOCK_H + 28} target={target} />
      <View className="absolute bottom-2 left-0 right-0 px-3">
        <AskComposer
          floating
          value={draft}
          onChangeText={setDraft}
          onSend={submit}
          running={run.running}
          onStop={run.stop}
          placeholder={empty ? 'Ask about your training' : 'Ask a follow-up'}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
