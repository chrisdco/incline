import type { ChatErrorCode, ChatMessageRecord, ChatPart, ContextPart, RunFinish } from '@/contracts/ai/chat';
import type { AiUsage } from '@/contracts/ai/data-use';
import { appendChatMessages } from '@/db/queries/chat';
import type { GetToken } from '@/sync/supabase-auth';

import {
  buildChatSystem,
  categoriesFor,
  CHAT_PROMPT_VERSION,
  chatErrorText,
  historyFor,
  outcomeOf,
  userContentFor,
  sourcesFor,
} from './chat-turn';
import { applyChatEvent } from './runtime/parts';

/**
 * One Ask turn (AI-CHAT Phase 1): picks the model (consent-gated, BYOK
 * first), runs the device loop with the read tools on SQLite, streams parts
 * to the caller, then saves both messages in one write and records the turn
 * in "AI data use". `useChatRun` is the React side.
 */
export interface ChatTurnInput {
  threadUuid: string;
  text: string;
  /** "Ask about this": what the question is about. */
  about?: ContextPart | null;
  /** Saved messages (for history). */
  messages: readonly ChatMessageRecord[];
  getToken: GetToken;
  userId: string | null | undefined;
  signal: AbortSignal;
  /** The answer so far; called as parts change. */
  onParts: (parts: ChatPart[]) => void;
}

function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function notice(text: string, code: string): ChatPart {
  return { type: 'notice', level: 'error', code, text };
}

/**
 * Runs one turn end to end and saves it. Never throws: failures become a
 * notice in the saved answer. Resolves once the saved rows are loaded.
 */
export async function executeChatTurn(input: ChatTurnInput): Promise<void> {
  const { threadUuid, text, about, messages, getToken, userId, signal, onParts } = input;
  const userMsg = { role: 'user' as const, parts: [...(about ? [about] : []), { type: 'text' as const, text }] as ChatPart[] };
  let live: ChatPart[] = [];

  const save = async (assistant: { parts: ChatPart[]; model?: string; provider?: string } | null) => {
    await appendChatMessages(
      threadUuid,
      assistant ? [userMsg, { ...assistant, role: 'assistant', promptVersion: CHAT_PROMPT_VERSION }] : [userMsg],
    );
    // Swap the live rows for saved ones only once they've loaded: no flicker.
    const [{ queryClient }, { chatMessagesQuery }] = await Promise.all([import('@/lib/query-client'), import('@/lib/query-keys')]);
    await queryClient.refetchQueries({ queryKey: chatMessagesQuery(threadUuid).queryKey }).catch(() => undefined);
  };

  try {
    const [{ useSettings }, { isAiTaskEnabled }] = await Promise.all([import('@/store/settings-store'), import('./flags')]);
    if (useSettings.getState().aiExplanationsEnabled !== true) {
      await save({ parts: [notice(chatErrorText('off'), 'off')] });
      return;
    }
    if (!(await isAiTaskEnabled('chat'))) {
      await save({ parts: [notice(chatErrorText('disabled'), 'disabled')] });
      return;
    }
    const [{ chooseChatModel }, byokMod, { readAiConsent }, auth, { fetch: expoFetch }] = await Promise.all([
      import('./chat-model'),
      import('./byok'),
      import('./consent'),
      import('@/sync/supabase-auth'),
      import('expo/fetch'),
    ]);
    let gateway: Parameters<typeof chooseChatModel>[0]['gateway'] = null;
    if (userId && auth.syncBackendReady()) {
      const env = await import('@/lib/env');
      gateway = { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, getToken: supabaseToken(getToken) };
    }
    const choice = chooseChatModel({
      byok: byokMod.useAiSettings.getState().byok,
      getByokKey: byokMod.getByokKey,
      gateway,
      consent: readAiConsent(),
      fetchImpl: expoFetch as unknown as typeof fetch,
    });
    if (!choice.ok) {
      await save({ parts: [notice(chatErrorText(choice.reason), choice.reason)] });
      return;
    }

    const [{ runChatTurn }, { deviceReadTools }, { deviceProposeTools }, { getProfile }, { newUuid }] = await Promise.all([
      import('./runtime/loop'),
      import('./capabilities/read-tools'),
      import('./capabilities/propose-tools'),
      import('@/db/queries/profile'),
      import('@/lib/uuid'),
    ]);
    const profile = await getProfile().catch(() => null);
    const system = buildChatSystem({
      today: todayIso(),
      unit: useSettings.getState().unit === 'imperial' ? 'lb' : 'kg',
      goal: profile?.goal,
      experience: profile?.experienceLevel,
    });

    const started = Date.now();
    let finish: RunFinish = 'error';
    let usage: AiUsage | undefined;
    let errorCode: ChatErrorCode | undefined;
    for await (const ev of runChatTurn({
      runId: newUuid(),
      model: choice.model,
      system,
      history: historyFor(messages),
      user: userContentFor(userMsg.parts),
      tools: [...deviceReadTools(), ...deviceProposeTools()],
      signal,
    })) {
      if (ev.type === 'run_end') {
        finish = ev.finish;
        usage = ev.usage;
        continue;
      }
      if (ev.type === 'error') errorCode = ev.code;
      // Errors get readable copy instead of the raw transport message.
      live = applyChatEvent(live, ev.type === 'error' ? { ...ev, message: chatErrorText(ev.code) } : ev);
      onParts(live);
    }

    const parts = [...live, ...sourcesFor(live)];
    void recordTurn({
      providerId: choice.model.providerId,
      model: usage?.model ?? choice.model.model,
      usage,
      outcome: outcomeOf(finish, errorCode),
      latencyMs: Date.now() - started,
      parts,
    });
    await save(parts.length ? { parts, model: usage?.model ?? choice.model.model, provider: choice.model.providerId } : null);
  } catch {
    await save({ parts: [...live, notice(chatErrorText('error'), 'error')] }).catch(() => undefined);
  }
}

function supabaseToken(getToken: GetToken): () => Promise<string | null> {
  return async () => {
    try {
      const templated = await getToken({ template: 'supabase' });
      if (templated) return templated;
    } catch {
      // Template missing — try the default token.
    }
    try {
      return await getToken();
    } catch {
      return null;
    }
  };
}

/** One "AI data use" entry per turn that reached a provider (G9). */
async function recordTurn(t: {
  providerId: string;
  model: string;
  usage?: AiUsage;
  outcome: ReturnType<typeof outcomeOf>;
  latencyMs: number;
  parts: readonly ChatPart[];
}): Promise<void> {
  const { reportAiEvent } = await import('./report');
  await reportAiEvent({
    taskId: 'chat',
    promptVersion: CHAT_PROMPT_VERSION,
    status: t.outcome === 'ok' ? 'ok' : 'fallback',
    ...(t.outcome === 'ok' ? { providerId: t.providerId } : { reason: t.outcome }),
    cached: false,
    attempts: [
      {
        providerId: t.providerId,
        outcome: t.outcome,
        latencyMs: t.latencyMs,
        model: t.model,
        inputTokens: t.usage?.inputTokens,
        outputTokens: t.usage?.outputTokens,
      },
    ],
    dataCategories: categoriesFor(t.parts),
  });
}
