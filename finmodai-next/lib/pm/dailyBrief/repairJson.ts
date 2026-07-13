/**
 * Best-effort repair for LLM JSON cut off mid-stream by a max-token limit.
 * Strategy: try closing an unterminated string, then repeatedly cut back to
 * the last structural closer (`}` or `]`), append whatever closers the bracket
 * stack still needs, and accept the first candidate that parses. Returns null
 * when nothing parseable can be recovered — callers keep their deterministic
 * fallback for that case.
 */

/** Bracket closers still open at the end of `prefix`; null when cut mid-string. */
function pendingClosers(prefix: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of prefix) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return null; // mismatched — unrecoverable
    }
  }
  if (inString) return null;
  return stack.reverse().join('');
}

function tryClose(candidate: string): string | null {
  const closers = pendingClosers(candidate);
  if (closers === null) return null;
  const repaired = candidate + closers;
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

export function repairTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let candidate = raw.slice(start).trimEnd();
  if (candidate.length < 2) return null;

  // Cut mid-string: terminating the string is often all that's needed.
  const direct = tryClose(candidate) ?? (pendingClosers(candidate) === null ? tryClose(`${candidate}"`) : null);
  if (direct) return direct;

  // Otherwise walk back one structural closer at a time, discarding the
  // dangling fragment after it, until a prefix closes into valid JSON.
  for (let attempt = 0; attempt < 60; attempt++) {
    const cut = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (cut <= 0) return null;
    const repaired = tryClose(candidate.slice(0, cut + 1));
    if (repaired) return repaired;
    candidate = candidate.slice(0, cut);
  }
  return null;
}
