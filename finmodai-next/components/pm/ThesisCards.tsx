'use client';

import { useState } from 'react';
import type { PositionThesis, ThesisStatus } from '@/lib/pm/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  theses: PositionThesis[];
};

const STATUS_COLORS: Record<ThesisStatus, string> = {
  intact:       'text-[var(--cb-green)]',
  strengthening: 'text-emerald-400',
  weakening:    'text-amber-500',
  broken:       'text-red-500',
  under_review: 'text-blue-400',
  building:     'text-[var(--cb-text-muted)]',
  holding:      'text-[var(--cb-text-muted)]',
  closed:       'text-[var(--cb-text-muted)]',
};

function BulletList({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--cb-text-secondary)]">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--cb-text-muted)]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThesisCard({ thesis }: { thesis: PositionThesis }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[thesis.thesisStatus] ?? STATUS_COLORS.intact;

  return (
    <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-semibold text-[var(--cb-text-primary)]">{thesis.ticker}</span>
          <span className={`text-xs font-medium ${statusColor}`}>{thesis.thesisStatus}</span>
          <span className="text-[10px] text-[var(--cb-text-muted)]">
            Conviction {thesis.convictionScore}/100
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {thesis.lastReviewedAt && (
            <span className="text-[10px] text-[var(--cb-text-muted)]">
              Reviewed {new Date(thesis.lastReviewedAt).toLocaleDateString()}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-[var(--cb-text-muted)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--cb-text-muted)]" />
          )}
        </div>
      </button>

      {/* Summary always visible */}
      <div className="px-3 pb-2.5">
        <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">{thesis.thesisSummary}</p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--cb-border-subtle)] px-3 py-3 space-y-3">
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
              Why We Own It
            </p>
            <p className="text-xs leading-relaxed text-[var(--cb-text-secondary)]">{thesis.whyWeOwnIt}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <BulletList items={thesis.addConditions} label="Add If" />
            <BulletList items={thesis.sellConditions} label="Sell If" />
            <BulletList items={thesis.invalidationConditions} label="Invalidation" />
            <BulletList items={thesis.keyRisks} label="Key Risks" />
            <BulletList items={thesis.catalysts} label="Catalysts" />
          </div>
          {thesis.timeHorizon && (
            <p className="text-[10px] text-[var(--cb-text-muted)]">
              Time horizon: <span className="text-[var(--cb-text-secondary)]">{thesis.timeHorizon}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ThesisCards({ theses }: Props) {
  if (theses.length === 0) {
    return (
      <section aria-label="Thesis cards">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
          Thesis Cards
        </h2>
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-6 py-8 text-center">
          <p className="text-sm font-medium text-[var(--cb-text-secondary)]">No theses on record.</p>
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Theses are created when the Intelligence Engine runs for an active position.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Thesis cards">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cb-text-muted)]">
        Thesis Cards
      </h2>
      <div className="space-y-2">
        {theses.map((t) => (
          <ThesisCard key={t.id} thesis={t} />
        ))}
      </div>
    </section>
  );
}
