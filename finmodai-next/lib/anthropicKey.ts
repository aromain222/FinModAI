export type AnthropicClientType = 'service' | 'user';

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
  if (key.length < 16) return false;
  const lower = key.toLowerCase();
  if (lower.includes('redacted') || lower.includes('your_') || lower.includes('paste_')) return false;
  return lower.startsWith('sk-ant-');
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

function orderedKeys(type: AnthropicClientType): Array<string | undefined> {
  const user = process.env.ANTHROPIC_API_KEY;
  const service = process.env.ANTHROPIC_SERVICE_API_KEY;
  if (type === 'user') {
    return [user, service];
  }
  return [service, user];
}

export function getAnthropicKey(type: AnthropicClientType): string | null {
  for (const candidate of orderedKeys(type)) {
    if (isUsableKey(candidate)) {
      return normalizeRawKey(candidate);
    }
  }
  return null;
}

export function getAnthropicKeyCandidates(type: AnthropicClientType): string[] {
  return dedupeNonEmpty(orderedKeys(type).filter((candidate) => isUsableKey(candidate)));
}

export function hasAnyAnthropicKey(): boolean {
  return Boolean(getAnthropicKey('user') || getAnthropicKey('service'));
}

export function getAnthropicModelCandidates(...preferred: Array<string | null | undefined>): string[] {
  return dedupeNonEmpty([
    ...preferred,
    process.env.ANTHROPIC_MODEL,
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest',
  ]);
}
