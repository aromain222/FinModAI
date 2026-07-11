/**
 * Runtime retrieval over the embedded public-domain swing-trading corpus
 * (built by scripts/ingest-swing-corpus.ts). The corpus is a fixed ~5MB JSON
 * bundle cosine-searched in memory — no vector database. Retrieval is strictly
 * best-effort: any failure (missing key, network, malformed corpus) returns []
 * and the calling agent proceeds without book context.
 */

import { getOpenAIKey } from '@/lib/openaiKey';

export type BookPassage = {
  book:   string;
  author: string;
  year:   number;
  text:   string;
  score:  number;
};

type CorpusChunk = { book: string; author: string; year: number; text: string; embedding: number[] };
type Corpus = { model: string; dimensions: number; chunks: CorpusChunk[] };

let corpusPromise: Promise<Corpus | null> | null = null;

function loadCorpus(): Promise<Corpus | null> {
  corpusPromise ??= import('@/lib/pm/playbooks/corpus/swingCorpus.json')
    .then(module => (module as { default?: Corpus }).default ?? (module as unknown as Corpus))
    .catch(() => null);
  return corpusPromise;
}

async function embedQuery(query: string, model: string, dimensions: number): Promise<number[] | null> {
  const apiKey = getOpenAIKey('user');
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: query.slice(0, 8_000), dimensions }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Top-k passages for a setup description, capped at 2 per book so one title
 * cannot crowd out the rest of the corpus.
 */
export async function retrieveBookPassages(query: string, k = 3): Promise<BookPassage[]> {
  const corpus = await loadCorpus();
  if (!corpus || corpus.chunks.length === 0) return [];
  const queryEmbedding = await embedQuery(query, corpus.model, corpus.dimensions);
  if (!queryEmbedding) return [];

  const scored = corpus.chunks
    .map(chunk => ({ chunk, score: cosine(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score);

  const perBook = new Map<string, number>();
  const picked: BookPassage[] = [];
  for (const { chunk, score } of scored) {
    if (picked.length >= k) break;
    const count = perBook.get(chunk.book) ?? 0;
    if (count >= 2) continue;
    perBook.set(chunk.book, count + 1);
    picked.push({ book: chunk.book, author: chunk.author, year: chunk.year, text: chunk.text, score: Math.round(score * 1000) / 1000 });
  }
  return picked;
}

/** Format passages as a prompt block with citations; empty string when none. */
export function formatBookPassages(passages: BookPassage[]): string {
  if (passages.length === 0) return '';
  const blocks = passages.map(passage =>
    `[${passage.author}, "${passage.book}" (${passage.year})]\n${passage.text.slice(0, 1_400)}`);
  return `CLASSIC TEXTS (public-domain passages retrieved for this setup — treat as craft wisdom, not evidence about this ticker; never cite them as evidenceRefs):\n\n${blocks.join('\n\n')}`;
}
