export type JsonResponseResult<T = unknown> =
  | { ok: true; data: T; text: string }
  | { ok: false; data: null; text: string; message: string };

function summarizeBody(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Empty response body';
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

export async function readJsonResponse<T = unknown>(response: Response): Promise<JsonResponseResult<T>> {
  const text = await response.text();

  try {
    return { ok: true, data: JSON.parse(text) as T, text };
  } catch {
    return {
      ok: false,
      data: null,
      text,
      message: `Expected JSON but received: ${summarizeBody(text)}`,
    };
  }
}
