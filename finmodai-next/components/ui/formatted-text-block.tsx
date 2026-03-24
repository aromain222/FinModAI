'use client';

import { cn } from '@/lib/utils';

function insertHeuristicParagraphBreaks(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (/\n{2,}/.test(normalized)) return normalized;

  const cuePattern =
    /(\.\s+)(The real driver is|The main driver is|On valuation,|So as investments:|Bottom line:|My bottom line is|The main caveat is|The key risk is|This is mainly|That means|Where AMD|Where Apple|Where Google|If your bar is|If the question is|What matters now is)/g;
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

export function FormattedTextBlock({
  content,
  className,
  paragraphClassName,
}: {
  content: string;
  className?: string;
  paragraphClassName?: string;
}) {
  const paragraphs = content
    .replace(/\r\n/g, '\n')
    .replace(/^-\s+/gm, '- ')
    .trim();

  const normalizedParagraphs = insertHeuristicParagraphBreaks(paragraphs)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (normalizedParagraphs.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {normalizedParagraphs.map((paragraph, index) => (
        <p
          key={`${index}-${paragraph.slice(0, 24)}`}
          className={cn('whitespace-pre-line text-sm leading-6 text-[var(--cb-text-primary)]', paragraphClassName)}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
