'use client';

type InsightCard = { title: string; body: string };

function parseReportBodyBlocks(
  body: string
): Array<{ type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] }> {
  const chunks = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  const blocks: Array<{ type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] }> = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let paragraphLines: string[] = [];
    let bulletLines: string[] = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
      paragraphLines = [];
    };

    const flushBullets = () => {
      if (!bulletLines.length) return;
      blocks.push({
        type: 'bullets',
        items: bulletLines.map((line) => line.replace(/^[•*-]\s+/, '').trim()),
      });
      bulletLines = [];
    };

    for (const line of lines) {
      if (/^[•*-]\s+/.test(line)) {
        flushParagraph();
        bulletLines.push(line);
      } else {
        flushBullets();
        paragraphLines.push(line);
      }
    }

    flushParagraph();
    flushBullets();
  }

  return blocks;
}

export function ReportMarkdown({ text, reportPayload }: { text: string; reportPayload?: any }) {
  let sections: Array<{ title: string; body: string }> = [];
  let useFallback = false;
  const reportTitle =
    reportPayload?.title && typeof reportPayload.title === 'string'
      ? reportPayload.title
      : 'CapitalBase Analyst Report';
  const reportSubtitle =
    reportPayload?.subtitle && typeof reportPayload.subtitle === 'string' ? reportPayload.subtitle : null;
  const reportSummary =
    reportPayload?.summaryText && typeof reportPayload.summaryText === 'string'
      ? reportPayload.summaryText.trim()
      : text?.trim() || '';
  const reportTakeaways = Array.isArray(reportPayload?.keyTakeaways)
    ? reportPayload.keyTakeaways.filter((item: any) => typeof item === 'string' && item.trim().length > 0)
    : [];
  const generatedLabel =
    reportPayload?.generatedAt && typeof reportPayload.generatedAt === 'string'
      ? new Date(reportPayload.generatedAt).toLocaleString()
      : null;

  if (reportPayload && reportPayload.sections && Array.isArray(reportPayload.sections)) {
    sections = reportPayload.sections.map((section: any) => ({
      title: section.title || 'Untitled Section',
      body: section.body && section.body.trim().length > 0
        ? section.body.trim()
        : 'Content unavailable due to a rendering issue. Please regenerate.',
    }));
  } else {
    try {
      const parsed = text
        .split(/\n(?=## )/g)
        .map((block) => {
          const trimmed = block.trim();
          if (!trimmed) return null;
          if (trimmed.startsWith('## ')) {
            const [firstLine, ...rest] = trimmed.split('\n');
            const title = firstLine.replace(/^##\s*/, '').trim();
            const body = rest.join('\n').trim();
            return { title, body };
          }
          return { title: 'Introduction', body: trimmed };
        })
        .filter((s): s is { title: string; body: string } => s !== null && s.title.length > 0);

      sections = parsed.map((section) => ({
        title: section.title,
        body: section.body && section.body.trim().length > 0
          ? section.body.trim()
          : 'Content unavailable due to a rendering issue. Please regenerate.',
      }));
    } catch (err) {
      console.error('[ReportMarkdown] Failed to parse report', err);
      useFallback = true;
    }
  }

  if (sections.length === 0) {
    sections = [{
      title: 'Report Content',
      body: text && text.trim().length > 0
        ? text.trim()
        : 'Content unavailable due to a rendering issue. Please regenerate.',
    }];
    useFallback = true;
  }

  sections = sections.map((section) => ({
    title: section.title || 'Untitled Section',
    body: section.body && section.body.trim().length > 0
      ? section.body.trim()
      : 'Content unavailable due to a rendering issue. Please regenerate.',
  }));

  return (
    <div className="space-y-4">
      {useFallback && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Report rendered in fallback mode due to a formatting issue.
        </div>
      )}
      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
              CapitalBase Analyst Memo
            </p>
            <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">{reportTitle}</h3>
            {reportSubtitle && <p className="text-sm text-[var(--cb-text-secondary)]">{reportSubtitle}</p>}
          </div>
          {generatedLabel && (
            <div className="rounded-full border border-[var(--cb-border-subtle)] px-3 py-1 text-xs text-[var(--cb-text-muted)]">
              Generated {generatedLabel}
            </div>
          )}
        </div>
        {reportSummary && (
          <div className="mt-4 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
            <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{reportSummary}</p>
          </div>
        )}
        {reportTakeaways.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {reportTakeaways.slice(0, 3).map((takeaway: string, index: number) => (
              <div
                key={`${takeaway}-${index}`}
                className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-4 py-3 text-sm text-[var(--cb-text-primary)]"
              >
                {takeaway}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4">
        {sections.map((section, index) => {
          const blocks = parseReportBodyBlocks(section.body);
          return (
            <div
              key={index}
              className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="h-5 w-1 rounded-full bg-[var(--cb-green)]" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--cb-text-primary)]">
                  {section.title}
                </h3>
              </div>
              <div className="space-y-3 text-sm leading-6 text-[var(--cb-text-primary)]">
                {blocks.map((block, blockIndex) =>
                  block.type === 'paragraph' ? (
                    <p key={`${section.title}-p-${blockIndex}`}>{block.text}</p>
                  ) : (
                    <ul
                      key={`${section.title}-b-${blockIndex}`}
                      className="space-y-2 pl-5 text-[var(--cb-text-primary)]"
                    >
                      {block.items.map((item, itemIndex) => (
                        <li key={`${section.title}-b-${blockIndex}-${itemIndex}`}>{item}</li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 rounded-lg border border-gray-300 p-2 text-xs">
          <summary className="cursor-pointer font-semibold">Debug Info</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify({ sectionsCount: sections.length, useFallback, hasPayload: !!reportPayload }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export function InsightCardsGrid({ cards }: { cards: InsightCard[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Insight Cards</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{card.title}</p>
            <p className="mt-1 text-sm text-[var(--cb-text-secondary)] whitespace-pre-wrap">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
