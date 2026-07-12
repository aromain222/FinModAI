/**
 * Ingest the public-domain swing-trading corpus in data/swing-corpus/ into a
 * static embedded corpus at lib/pm/playbooks/corpus/swingCorpus.json.
 *
 * Usage: npx tsx scripts/ingest-swing-corpus.ts
 *
 * Cleaning strips Project Gutenberg boilerplate and OCR noise, chunks by
 * paragraph (~1,800 chars with one-paragraph overlap), embeds with OpenAI
 * text-embedding-3-small at 256 dimensions, and writes one JSON file that the
 * runtime retrieval layer (lib/pm/playbooks/bookRetrieval.ts) cosine-searches
 * in memory — no vector database required for a fixed corpus this size.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const CORPUS_DIR = path.join(ROOT, 'data', 'swing-corpus');
const OUT_FILE = path.join(ROOT, 'lib', 'pm', 'playbooks', 'corpus', 'swingCorpus.json');
const EMBED_DIMENSIONS = 256;
const CHUNK_TARGET_CHARS = 1_800;
const EMBED_BATCH_SIZE = 100;

const BOOKS: Record<string, { title: string; author: string; year: number }> = {
  'reminiscences-lefevre.txt':           { title: 'Reminiscences of a Stock Operator', author: 'Edwin Lefèvre', year: 1923 },
  'psychology-stock-market-selden.txt':  { title: 'Psychology of the Stock Market',    author: 'G. C. Selden',  year: 1912 },
  'psychology-of-speculation-harper.txt':{ title: 'The Psychology of Speculation',     author: 'Henry Howard Harper', year: 1926 },
  'studies-in-tape-reading-wyckoff.txt': { title: 'Studies in Tape Reading',           author: 'Richard D. Wyckoff', year: 1910 },
  'truth-of-stock-tape-gann.txt':        { title: 'Truth of the Stock Tape',           author: 'W. D. Gann',    year: 1923 },
};

function loadEnvKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envFile = path.join(ROOT, '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^OPENAI_API_KEY=(.+)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('OPENAI_API_KEY not found in environment or .env.local');
}

function stripGutenberg(text: string): string {
  const start = text.search(/\*{3} ?START OF (THE|THIS) PROJECT GUTENBERG.*\*{3}/i);
  const end = text.search(/\*{3} ?END OF (THE|THIS) PROJECT GUTENBERG.*\*{3}/i);
  if (start >= 0 && end > start) return text.slice(text.indexOf('\n', start), end);
  return text;
}

/** Drop OCR junk: lines that are mostly non-letters (scanner artifacts, page furniture). */
function cleanOcr(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true; // keep paragraph breaks
      const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
      return letters / trimmed.length > 0.55 || trimmed.length < 3;
    })
    .join('\n')
    .replace(/-\n(?=[a-z])/g, '') // rejoin hyphenated line breaks
    .replace(/[ \t]+/g, ' ');
}

function chunkParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(paragraph => paragraph.length >= 80); // drop headings/junk fragments
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    current.push(paragraph);
    size += paragraph.length;
    if (size >= CHUNK_TARGET_CHARS) {
      chunks.push(current.join('\n\n'));
      current = [current[current.length - 1]]; // one-paragraph overlap for continuity
      size = current[0].length;
    }
  }
  if (current.length > 1 || (current.length === 1 && chunks.length === 0)) {
    chunks.push(current.join('\n\n'));
  }
  return chunks;
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: inputs, dimensions: EMBED_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`Embeddings API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: Array<{ index: number; embedding: number[] }> };
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding.map(value => Math.round(value * 1e5) / 1e5));
}

async function main(): Promise<void> {
  const apiKey = loadEnvKey();
  const chunks: Array<{ book: string; author: string; year: number; text: string }> = [];

  for (const [file, meta] of Object.entries(BOOKS)) {
    const filePath = path.join(CORPUS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`skipping missing ${file}`);
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = cleanOcr(stripGutenberg(raw));
    const bookChunks = chunkParagraphs(cleaned);
    console.log(`${meta.title}: ${bookChunks.length} chunks`);
    for (const text of bookChunks) chunks.push({ book: meta.title, author: meta.author, year: meta.year, text });
  }
  if (chunks.length === 0) throw new Error('No chunks produced — is data/swing-corpus/ populated?');

  const embeddings: number[][] = [];
  for (let index = 0; index < chunks.length; index += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBED_BATCH_SIZE);
    embeddings.push(...await embedBatch(apiKey, batch.map(chunk => chunk.text)));
    console.log(`embedded ${Math.min(index + EMBED_BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }

  const corpus = {
    model: 'text-embedding-3-small',
    dimensions: EMBED_DIMENSIONS,
    builtAt: new Date().toISOString(),
    chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] })),
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(corpus));
  console.log(`wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1e6).toFixed(1)}MB, ${chunks.length} chunks)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
