/**
 * Route param parsing. Params arrive as untrusted strings (deep links, stale
 * history entries), so screens parse them here instead of `Number(param)`.
 */

/** Start of the local calendar day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * `day/[ms]` param → start of that local day. Anything that is not a finite
 * epoch-ms number (NaN, empty, an array, out of Date range) falls back to
 * today, so the screen shows a real date instead of "Invalid Date".
 */
export function parseDayParam(raw: string | string[] | undefined, now: number = Date.now()): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || Number.isNaN(new Date(value).getTime())) return startOfLocalDay(now);
  return startOfLocalDay(value);
}

/** `supabase:<external id>` exercise route ids → the external id, else null. */
export function parseCatalogRouteId(routeId: string): string | null {
  if (!routeId.startsWith('supabase:')) return null;
  const externalId = routeId.slice('supabase:'.length);
  return externalId === '' ? null : externalId;
}
