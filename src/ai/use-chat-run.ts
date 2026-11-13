import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatMessageRecord, ChatPart, ContextPart } from '@/contracts/ai/chat';
import type { GetToken } from '@/sync/supabase-auth';

import { executeChatTurn } from './chat-session';

/**
 * The in-flight answer of one Ask thread. Saved messages render from
 * TanStack Query; this only holds the question being answered and the
 * streamed parts, flushed to state at most every FLUSH_MS.
 */
export interface ChatRunState {
  /** The question being answered (shown before it's saved). */
  pendingUser: string | null;
  /** What the pending question is about, if attached. */
  pendingAbout: ContextPart | null;
  /** The answer so far. */
  parts: ChatPart[];
  running: boolean;
}

const FLUSH_MS = 50;
const IDLE: ChatRunState = { pendingUser: null, pendingAbout: null, parts: [], running: false };

export function useChatRun(opts: {
  threadUuid: string;
  messages: readonly ChatMessageRecord[];
  getToken: GetToken;
  userId: string | null | undefined;
}) {
  const [state, setState] = useState<ChatRunState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const latestParts = useRef<ChatPart[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(opts);
  useLayoutEffect(() => {
    latest.current = opts;
  });

  useEffect(() => () => controller.current?.abort(), []);

  const stop = useCallback(() => controller.current?.abort(), []);

  const send = useCallback((raw: string, about: ContextPart | null = null) => {
    const text = raw.trim();
    if (!text || controller.current) return;
    const ac = new AbortController();
    controller.current = ac;
    latestParts.current = [];
    setState({ pendingUser: text, pendingAbout: about, parts: [], running: true });
    const flush = () => {
      timer.current = null;
      setState((s) => ({ ...s, parts: latestParts.current }));
    };
    void executeChatTurn({
      ...latest.current,
      text,
      about,
      signal: ac.signal,
      onParts: (parts) => {
        latestParts.current = parts;
        if (!timer.current) timer.current = setTimeout(flush, FLUSH_MS);
      },
    }).finally(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      controller.current = null;
      setState(IDLE);
    });
  }, []);

  return { ...state, send, stop };
}
