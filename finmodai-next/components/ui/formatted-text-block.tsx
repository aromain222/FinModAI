'use client';

import { cn } from '@/lib/utils';

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
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {paragraphs.map((paragraph, index) => (
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
