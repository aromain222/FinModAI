/**
 * OpenAI key selection: use service key for backend/batch, user key for interactive.
 * If only one key is set, it is used for both (backward compatible).
 */

export type OpenAIClientType = 'service' | 'user';

function isUsableKey(value: string | undefined | null): value is string {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  if (key.length < 12) return false;
  const lower = key.toLowerCase();
  if (lower.includes('redacted') || lower.includes('your_') || lower.includes('paste_')) return false;
  return true;
}

function dedupeNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Returns the API key to use for OpenAI calls.
 * - service: backend/batch (model enrichment, macro briefs, data extraction). Prefers OPENAI_SERVICE_API_KEY, falls back to OPENAI_API_KEY.
 * - user: interactive (chat, analysis, explain). Prefers OPENAI_API_KEY, falls back to OPENAI_SERVICE_API_KEY.
 */
export function getOpenAIKey(type: OpenAIClientType): string | null {
  if (type === 'user') {
    const preferred = process.env.OPENAI_API_KEY;
    const fallback = process.env.OPENAI_SERVICE_API_KEY;
    if (isUsableKey(preferred)) return preferred;
    if (isUsableKey(fallback)) return fallback;
    return null;
  }
  // service: prefer dedicated service key so billing/limits can be split
  const service = process.env.OPENAI_SERVICE_API_KEY;
  const user = process.env.OPENAI_API_KEY;
  if (isUsableKey(service)) return service;
  if (isUsableKey(user)) return user;
  return null;
}

/**
 * True if at least one OpenAI key is configured (so any OpenAI feature can run).
 */
export function hasAnyOpenAIKey(): boolean {
  const user = process.env.OPENAI_API_KEY;
  const service = process.env.OPENAI_SERVICE_API_KEY;
  return isUsableKey(user) || isUsableKey(service);
}

/**
 * Preferred model candidates in failover order.
 */
export function getOpenAIModelCandidates(...preferred: Array<string | null | undefined>): string[] {
  return dedupeNonEmpty([
    ...preferred,
    process.env.OPENAI_MODEL,
    'gpt-4o-mini',
    'gpt-4.1-mini',
  ]);
}
