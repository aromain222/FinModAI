import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fetchRecentFilings, type SecMnaFiling } from '@/lib/secApi';

const MAX_CHUNK_CHARS = 2200;
const MIN_CHUNK_CHARS = 900;

type ChunkRecord = {
  id: string;
  source_type: 'sec_filing';
  source_url: string | null;
  filing_form: string;
  accession_no: string;
  filed_at: string;
  ticker: string;
  company_name: string;
  counterparties: string[];
  filing_category: SecMnaFiling['filingCategory'];
  filing_title: string | null;
  text: string;
  char_count: number;
  word_count: number;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getArgs(): {
  ticker: string;
  limit: number;
  asOfDate?: string;
  forms?: string[];
  outputDir: string;
} {
  const ticker = (getArg('--ticker') ?? '').trim().toUpperCase();
  if (!ticker) {
    throw new Error('Missing --ticker');
  }

  const limitRaw = Number(getArg('--limit') ?? '10');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 25)) : 10;
  const asOfDate = getArg('--asOfDate');
  const forms = getArg('--forms')
    ?.split(',')
    .map((form) => form.trim().toUpperCase())
    .filter(Boolean);
  const datasetPrefix = forms && forms.length > 0 ? 'sec-filings' : 'sec-mna';
  const outputDir =
    getArg('--outputDir') ??
    join(process.cwd(), '..', 'data', 'training', `${datasetPrefix}-${slugify(ticker)}`);

  return { ticker, limit, asOfDate, forms, outputDir };
}

function getSecUserAgent(): string {
  const email = process.env.SEC_UA_EMAIL?.trim();
  if (email) return `FinModAI (${email})`;
  return 'FinModAI (contact@example.com)';
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
      'User-Agent': getSecUserAgent(),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch filing text: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function htmlToText(input: string): string {
  let text = input;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#160;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function normalizeText(raw: string): string {
  const maybeHtml = /<html|<body|<div|<span|<table/i.test(raw);
  const text = maybeHtml ? htmlToText(raw) : raw;
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 50);
}

function chunkText(text: string): string[] {
  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const chunk = buffer.join('\n\n').trim();
    if (chunk) chunks.push(chunk);
    buffer = [];
  };

  for (const paragraph of paragraphs) {
    const projected = buffer.length === 0 ? paragraph.length : buffer.join('\n\n').length + 2 + paragraph.length;
    if (buffer.length > 0 && projected > MAX_CHUNK_CHARS) {
      flush();
    }

    buffer.push(paragraph);

    const currentLength = buffer.join('\n\n').length;
    if (currentLength >= MIN_CHUNK_CHARS && /[.!?]$/.test(paragraph)) {
      flush();
    }
  }

  flush();
  return chunks;
}

function toChunkRecords(params: {
  filing: SecMnaFiling;
  text: string;
  ticker: string;
  companyName: string;
}): ChunkRecord[] {
  const chunks = chunkText(params.text);
  return chunks.map((text, index) => ({
    id: `${slugify(params.ticker)}-${params.filing.accessionNo || 'filing'}-${String(index + 1).padStart(3, '0')}`,
    source_type: 'sec_filing',
    source_url: params.filing.primaryDocumentUrl ?? params.filing.url,
    filing_form: params.filing.form,
    accession_no: params.filing.accessionNo,
    filed_at: params.filing.filedAt,
    ticker: params.ticker,
    company_name: params.companyName,
    counterparties: params.filing.counterparties,
    filing_category: params.filing.filingCategory,
    filing_title: params.filing.title,
    text,
    char_count: text.length,
    word_count: text.split(/\s+/).filter(Boolean).length,
  }));
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(path, `${body}${rows.length > 0 ? '\n' : ''}`, 'utf8');
}

async function main() {
  const envLocalPath = join(process.cwd(), '.env.local');
  const envPath = join(process.cwd(), '.env');
  loadEnvFile(envLocalPath);
  loadEnvFile(envPath);

  if (hasFlag('--debug-env')) {
    const key = process.env.SEC_API_IO_API_KEY ?? '';
    const email = process.env.SEC_UA_EMAIL ?? '';
    console.log(
      JSON.stringify(
        {
          env: {
            cwd: process.cwd(),
            envLocalExists: existsSync(envLocalPath),
            envExists: existsSync(envPath),
            secApiKeyPresent: key.length > 0,
            secApiKeyLength: key.length,
            secApiKeyPreview: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
            secUaEmailPresent: email.length > 0,
            secUaEmail: email || null,
          },
        },
        null,
        2
      )
    );
  }

  const { ticker, limit, asOfDate, forms, outputDir } = getArgs();
  const result = await fetchRecentFilings({ ticker, limit, asOfDate, forms });

  if (!result) {
    throw new Error(`Could not resolve M&A filings for ${ticker}`);
  }

  const filingRecords: Array<SecMnaFiling & { textLength: number | null; textFetchError?: string }> = [];
  const allChunks: ChunkRecord[] = [];

  for (const filing of result.filings) {
    const sourceUrl = filing.primaryDocumentUrl ?? filing.url;
    if (!sourceUrl) {
      filingRecords.push({ ...filing, textLength: null, textFetchError: 'Missing filing URL' });
      continue;
    }

    try {
      const raw = await fetchText(sourceUrl);
      const normalized = normalizeText(raw);
      const chunks = toChunkRecords({
        filing,
        text: normalized,
        ticker: result.company.ticker,
        companyName: result.company.companyName,
      });
      allChunks.push(...chunks);
      filingRecords.push({ ...filing, textLength: normalized.length });
    } catch (error) {
      filingRecords.push({
        ...filing,
        textLength: null,
        textFetchError: error instanceof Error ? error.message : 'Unknown text fetch error',
      });
    }
  }

  const manifest = {
    dataset_slug: `${forms && forms.length > 0 ? 'sec-filings' : 'sec-mna'}-${slugify(result.company.ticker)}`,
    ticker: result.company.ticker,
    company_name: result.company.companyName,
    cik: result.company.cik,
    source: result.source,
    as_of_date: result.asOfDate,
    forms_queried: result.formsQueried,
    filing_count: result.filings.length,
    extracted_filing_count: filingRecords.filter((filing) => filing.textLength !== null).length,
    chunk_count: allChunks.length,
    outputs: {
      chunks_jsonl: join(outputDir, 'chunks.jsonl'),
      filings_json: join(outputDir, 'filings.json'),
      manifest_json: join(outputDir, 'manifest.json'),
    },
  };

  await writeJson(join(outputDir, 'manifest.json'), manifest);
  await writeJson(join(outputDir, 'filings.json'), filingRecords);
  await writeJsonl(join(outputDir, 'chunks.jsonl'), allChunks);

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
