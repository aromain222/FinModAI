'use client';

import { cn } from '@/lib/utils';

// Keys that appear in buildSwingThesis output
const THESIS_KEYS = [
  'Setup', 'Expected Move', 'What Matters Most', 'Key Catalyst',
  'Bull Case', 'Risk', 'Trade View', 'Conviction', 'AI Sentiment', 'Thesis Drift',
] as const;
type ThesisKey = (typeof THESIS_KEYS)[number];

type ThesisField = { key: ThesisKey; value: string };

function parseThesis(content: string): ThesisField[] | null {
  if (!content.startsWith('Setup:')) return null;
  const lines = content.split('\n').filter(Boolean);
  const fields: ThesisField[] = [];
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim() as ThesisKey;
    if (!THESIS_KEYS.includes(key)) continue;
    fields.push({ key, value: line.slice(colon + 1).trim() });
  }
  return fields.length >= 4 ? fields : null;
}

function SetupBadge({ value }: { value: string }) {
  const isReady  = value.toLowerCase().includes('ready');
  const isWork   = value.toLowerCase().includes('work up');
  const isWait   = value.toLowerCase().includes('wait');
  const color =
    isReady ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' :
    isWork  ? 'bg-amber-500/15 text-amber-300 ring-amber-400/30' :
    isWait  ? 'bg-rose-500/15 text-rose-300 ring-rose-400/30' :
              'bg-white/8 text-[var(--cb-text-secondary)] ring-white/10';
  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ring-1', color)}>
      <span className="text-sm font-bold tracking-tight">{value}</span>
    </div>
  );
}

function ConvictionBadge({ value }: { value: string }) {
  const level = value.split('—')[0].trim();
  const read  = value.split('—')[1]?.trim();
  const color =
    level === 'High'            ? 'text-emerald-300' :
    level === 'Moderate-High'   ? 'text-emerald-300/80' :
    level === 'Moderate'        ? 'text-amber-300' :
    level === 'Low-Moderate'    ? 'text-amber-300/70' :
                                  'text-rose-300';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn('text-[11px] font-semibold', color)}>{level}</span>
      {read && <span className="text-[10px] text-[var(--cb-text-muted)]">{read}</span>}
    </div>
  );
}

function ThesisDriftTag({ value }: { value: string }) {
  const isCaution = value.toLowerCase().includes('caut');
  const isConstr  = value.toLowerCase().includes('constr');
  const color     = isConstr ? 'text-emerald-300/70' : isCaution ? 'text-amber-300/70' : 'text-rose-300/70';
  return (
    <span className={cn('text-[10px]', color)}>{value}</span>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-x-2 py-1 border-b border-[var(--cb-border-subtle)] last:border-0">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)] pt-px">
        {label}
      </span>
      <span className="text-[11px] leading-snug text-[var(--cb-text-body)]">
        {children}
      </span>
    </div>
  );
}

function ThesisCard({ fields }: { fields: ThesisField[] }) {
  const get = (key: ThesisKey) => fields.find(f => f.key === key)?.value ?? null;

  const setup        = get('Setup');
  const expectedMove = get('Expected Move');
  const matters      = get('What Matters Most');
  const catalyst     = get('Key Catalyst');
  const bullCase     = get('Bull Case');
  const risk         = get('Risk');
  const tradeView    = get('Trade View');
  const conviction   = get('Conviction');
  const aiSentiment  = get('AI Sentiment');
  const drift        = get('Thesis Drift');

  return (
    <div className="w-full space-y-2">
      {setup && <SetupBadge value={setup} />}

      <div className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 space-y-0">
        {expectedMove && (
          <FieldRow label="Expected Move">{expectedMove}</FieldRow>
        )}
        {matters && (
          <FieldRow label="What Matters">
            <span className="font-medium text-[var(--cb-text-primary)]">{matters}</span>
          </FieldRow>
        )}
        {catalyst && (
          <FieldRow label="Catalyst">
            <span className="rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-300">
              {catalyst}
            </span>
          </FieldRow>
        )}
        {tradeView && (
          <FieldRow label="Trade View">{tradeView}</FieldRow>
        )}
      </div>

      {/* Bull / Risk side by side */}
      {(bullCase || risk) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {bullCase && (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/6 px-3 py-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400/70">Bull Case</p>
              <p className="text-[11px] leading-snug text-[var(--cb-text-body)]">{bullCase}</p>
            </div>
          )}
          {risk && (
            <div className="rounded-lg border border-rose-400/20 bg-rose-500/6 px-3 py-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-rose-400/70">Risk</p>
              <p className="text-[11px] leading-snug text-[var(--cb-text-body)]">{risk}</p>
            </div>
          )}
        </div>
      )}

      {/* Conviction */}
      {conviction && (
        <div className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Conviction</p>
          <ConvictionBadge value={conviction} />
        </div>
      )}

      {/* AI Sentiment */}
      {aiSentiment && (
        <div className="rounded-lg border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] leading-snug text-blue-100/80">
          {aiSentiment}
        </div>
      )}

      {/* Drift footer */}
      {drift && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">Thesis Drift</span>
          <ThesisDriftTag value={drift} />
        </div>
      )}
    </div>
  );
}

type Props = {
  role: 'user' | 'assistant';
  content: string;
};

export function ChatMessage({ role, content }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white break-words">
          {content}
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex justify-start">
        <div className="rounded-xl bg-[var(--cb-surface)] px-4 py-3 ring-1 ring-[var(--cb-border)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--cb-text-muted)]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--cb-text-muted)] [animation-delay:0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--cb-text-muted)] [animation-delay:0.2s]" />
          </span>
        </div>
      </div>
    );
  }

  const thesis = parseThesis(content);

  if (thesis) {
    return (
      <div className="flex flex-col items-start gap-1 w-full max-w-[92%]">
        <ThesisCard fields={thesis} />
      </div>
    );
  }

  // Plain AI response
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] overflow-hidden rounded-xl bg-[var(--cb-surface)] px-4 py-2.5 text-sm leading-relaxed text-[var(--cb-text-body)] ring-1 ring-[var(--cb-border)] break-words whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
