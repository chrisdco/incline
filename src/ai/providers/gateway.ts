import { AI_CONSENT_HEADER, AI_CONSENT_VERSION } from '@/contracts/ai/consent';

import { AiError, type AiProvider } from '../types';
import { aiErrorFromFetch, aiErrorFromStatus } from './http-errors';

/**
 * Incline gateway: tasks with a `gateway` spec run server-side (Supabase edge
 * function → Cloudflare AI Gateway → Groq / OpenRouter), behind the user's
 * Clerk token and per-user quota. Prompts and provider keys stay on the server.
 */
export interface GatewayProviderConfig {
  supabaseUrl: string;
  anonKey: string;
  /** Clerk token for the Supabase template; null when signed out. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createGatewayProvider(config: GatewayProviderConfig): AiProvider {
  const base = config.supabaseUrl.replace(/\/$/, '');
  return {
    id: 'gateway',
    // The server already validates and repairs; a client-side retry only burns quota.
    repairable: false,
    capabilities: { structuredOutput: true, toolCalling: true, onDevice: false },
    async isAvailable() {
      return Boolean(base && config.anonKey && base !== 'your_supabase_url');
    },
    supports(task) {
      return Boolean(task.gateway);
    },
    async run(task, input, ctx) {
      const spec = task.gateway;
      if (!spec) throw new AiError('unavailable', `${task.id} has no gateway spec`);
      const token = await config.getToken();
      if (!token) throw new AiError('unavailable', 'signed out');
      let res: Response;
      try {
        res = await (config.fetchImpl ?? fetch)(`${base}/functions/v1/${spec.fn}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: config.anonKey,
            'Content-Type': 'application/json',
            // The chain only includes this provider with consent; the server can audit/enforce it.
            [AI_CONSENT_HEADER]: String(AI_CONSENT_VERSION),
          },
          body: JSON.stringify(await spec.body(input)),
          signal: ctx.signal,
        });
      } catch (err) {
        throw aiErrorFromFetch(err, ctx.signal);
      }
      if (!res.ok) throw aiErrorFromStatus(res.status, await res.text().catch(() => ''));
      const json: unknown = await res.json().catch(() => null);
      const picked = spec.pick(json);
      if (picked == null) throw new AiError('invalid_output', 'gateway returned no output');
      return picked;
    },
  };
}
