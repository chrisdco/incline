/**
 * Remote kill switches (AI-PLATFORM §5, §7). A flag key names what to switch
 * off; a trailing `*` matches a prefix, so `actor:mcp:*` stops every MCP client.
 */
export type AiFlagKey = `task:${string}` | `actor:${string}`;

export function aiTaskFlag(taskId: string): AiFlagKey {
  return `task:${taskId}`;
}

export function aiActorFlag(actor: string): AiFlagKey {
  return `actor:${actor}`;
}

/** True when `key` is switched off by any entry in `disabled`. */
export function isFlagDisabled(disabled: Iterable<string>, key: string): boolean {
  for (const entry of disabled) {
    if (entry === key) return true;
    if (entry.endsWith('*') && key.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
}
