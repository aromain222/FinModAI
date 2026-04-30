'use client';

import { cn } from '@/lib/utils';

type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function insertHeuristicParagraphBreaks(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (/\n{2,}/.test(normalized)) return normalized;

  const cuePattern =
    /(\.\s+)(The real driver is|The main driver is|On valuation,|So as investments:|Bottom line:|My bottom line is|The main caveat is|The key risk is|This is mainly|That means|Where AMD|Where Apple|Where Google|If your bar is|If the question is|What matters now is|Core judgment:|Search & Other|YouTube Ads|Google Cloud|Margin Framework|Most Sensitive Assumptions|Valuation read:|Net read:)/g;
  const withCueBreaks = normalized.replace(cuePattern, (_match, ending, cue) => `${ending}\n\n${cue}`);
  if (withCueBreaks !== normalized) return withCueBreaks;

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((value) => value.trim()) ?? [];
  if (sentences.length < 4) return normalized;

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }
  return paragraphs.join('\n\n');
}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z0-9 &/()\-]+:$/.test(trimmed) && trimmed.length <= 80) return true;
  return /^[A-Z][A-Za-z0-9 &/()\-]+(?:\s+—\s+|\s+-\s+)[A-Za-z0-9]/.test(trimmed) && trimmed.length <= 100;
}

function isBulletLine(line: string): boolean {
  return /^[-*]\s+\S/.test(line.trim());
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4;
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function parseTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const tableLines = lines.filter((line) => isTableLine(line) && !isTableDivider(line));
  if (tableLines.length < 2) return null;
  const cells = tableLines.map((line) =>
    line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((cell) => cleanMarkdownText(cell)),
  );
  const [headers, ...rows] = cells;
  if (!headers || headers.length === 0 || rows.length === 0) return null;
  return { headers, rows };
}

function parseBlocks(content: string): TextBlock[] {
  const normalized = insertHeuristicParagraphBreaks(content)
    .replace(/^-\s+/gm, '- ')
    .trim();
  if (!normalized) return [];

  const blocks: TextBlock[] = [];
  const chunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const table = parseTable(lines);
    if (table) {
      blocks.push({ kind: 'table', headers: table.headers, rows: table.rows });
      continue;
    }
    if (lines.length > 0 && lines.every(isBulletLine)) {
      blocks.push({
        kind: 'list',
        items: lines.map((line) => cleanMarkdownText(line.replace(/^[-*]\s+/, ''))).filter(Boolean),
      });
      continue;
    }
    if (lines.length === 1 && isHeadingLine(lines[0])) {
      blocks.push({ kind: 'heading', text: cleanMarkdownText(lines[0].replace(/:$/, '')) });
      continue;
    }
    blocks.push({ kind: 'paragraph', text: cleanMarkdownText(chunk) });
  }

  return blocks;
}

export function FormattedTextBlock({
  content,
  className,
  paragraphClassName,
}: {
  content: string;
  className?: string;
  paragraphClassName?: string;
}) {
  const blocks = parseBlocks(content.replace(/\r\n/g, '\n'));

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <h3 key={`${index}-${block.text.slice(0, 24)}`} className="pt-1 text-sm font-semibold text-[var(--cb-text-primary)]">
              {block.text}
            </h3>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={`${index}-${block.items[0]?.slice(0, 24) ?? 'list'}`} className="space-y-1.5 pl-4 text-sm leading-6 text-[var(--cb-text-primary)]">
              {block.items.map((item) => (
                <li key={item} className="list-disc marker:text-[var(--cb-text-muted)]">
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={`${index}-${block.headers.join('-')}`} className="overflow-x-auto rounded-xl border border-[var(--cb-border-subtle)]">
              <table className="min-w-full text-left text-xs text-[var(--cb-text-primary)]">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-[var(--cb-text-muted)]">
                  <tr>
                    {block.headers.map((header) => (
                      <th key={header} className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${rowIndex}-${row.join('-')}`} className="border-t border-[var(--cb-border-subtle)]">
                      {block.headers.map((header, cellIndex) => (
                        <td key={`${header}-${cellIndex}`} className="px-3 py-2 align-top">
                          {row[cellIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p
            key={`${index}-${block.text.slice(0, 24)}`}
            className={cn('whitespace-pre-line text-sm leading-6 text-[var(--cb-text-primary)]', paragraphClassName)}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
