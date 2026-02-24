/**
 * OpenAI key selection: use service key for backend/batch, user key for interactive.
 * If only one key is set, it is used for both (backward compatible).
 */

export type OpenAIClientType = 'service' | 'user';

function normalizeRawKey(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  let key = value.trim();
  if (!key) return null;
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (key.toLowerCase().startsWith('bearer ')) {
    key = key.slice(7).trim();
  }
  return key || null;
}

function isUsableKey(value: string | undefined | null): value is string {
  const key = normalizeRawKey(value);
  if (!key) return false;
  if (key.length < 12) return false;
  const lower = key.toLowerCase();
  if (lower.includes('redacted') || lower.includes('your_') || lower.includes('paste_')) return false;
  if (!lower.startsWith('sk-')) return false;
  return true;
}

function dedupeNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = normalizeRawKey(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function orderedKeys(type: OpenAIClientType): Array<string | undefined> {
  const user = process.env.OPENAI_API_KEY;
  const service = process.env.OPENAI_SERVICE_API_KEY;
  const publicFallback = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (type === 'user') {
    return [user, service, publicFallback];
  }
  return [service, user, publicFallback];
}

/**
 * Returns the API key to use for OpenAI calls.
 * - service: backend/batch (model enrichment, macro briefs, data extraction). Prefers OPENAI_SERVICE_API_KEY, falls back to OPENAI_API_KEY.
 * - user: interactive (chat, analysis, explain). Prefers OPENAI_API_KEY, falls back to OPENAI_SERVICE_API_KEY.
 */
export function getOpenAIKey(type: OpenAIClientType): string | null {
  for (const candidate of orderedKeys(type)) {
    if (isUsableKey(candidate)) {
      return normalizeRawKey(candidate);
    }
  }
  return null;
}

/**
 * Returns all configured keys in preference order for failover retries.
 */
export function getOpenAIKeyCandidates(type: OpenAIClientType): string[] {
  return dedupeNonEmpty(orderedKeys(type).filter((candidate) => isUsableKey(candidate)));
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
