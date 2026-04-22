'use client';

import { Badge } from '@/components/ui/badge';
import { calculateDebtCapacityPreview } from '@/lib/model-generator/debtCapacitySummary';
import { calculateMergerSummary } from '@/lib/model-generator/mergerSummary';
import type {
  PromptRunEventAdjustmentSummary,
  PromptRunEventContext,
  PromptRunSmartAssumptionSummary,
} from '@/lib/model-generator/runHistory';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

type PreviewLike = {
  modelType: ModelGeneratorType | null;
  extractedInputs: Record<string, unknown>;
};

function isCurrencyKey(key?: string): boolean {
  if (!key) return false;
  return /(revenue|income|cash|debt|price|value|equity|ebitda|ebit|ev|capex|nwc|inventory|dividend|book|ppe|burn|fundraise|purchase|goodwill|assets|liab|sales|cogs|arr|arpu|cac|marketcap|valuation|proceeds|amount|principal|interest|expense|balance|amortization|buyback|repurchase|cashflow|fcf)/i.test(
    key
  );
}

function isPercentKey(key?: string): boolean {
  if (!key) return false;
  return /(margin|growth|rate|yield|pct|percent|ownership|churn|tax|wacc|discount|terminal|payout|roe|irr|probability)/i.test(
    key
  );
}

function isMultipleKey(key?: string): boolean {
  if (!key) return false;
  return /(multiple|coverage|leverage|moic|ltv|turnover)/i.test(key);
}

function renderValue(value: unknown, key?: string): string {
  if (Array.isArray(value)) return value.map((item) => renderValue(item, key)).join(', ');
  if (typeof value === 'number') {
    if (isPercentKey(key)) {
      const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    }
    if (isMultipleKey(key)) return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
    if (isCurrencyKey(key)) {
      return `$${value.toLocaleString('en-US', {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`;
    }
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US');
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value);
}

function formatCompactMetric(value: unknown, kind: 'currency' | 'percent' | 'multiple' | 'number' = 'number'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (kind === 'currency') {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 1 })}`;
  }
  if (kind === 'percent') {
    const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
    return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  }
  if (kind === 'multiple') {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}x`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function formatModelMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function formatRunEventPublishedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function summarizeEventDrivers(summary: PromptRunEventAdjustmentSummary | null | undefined): string {
  if (!summary || summary.changedDrivers.length === 0) return 'No assumption changes recorded.';
  return summary.changedDrivers.map((driver) => driver.label).join(', ');
}

function formatEventSuggestionDirection(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

function inferEventSuggestionDirection(oldValue: unknown, newValue: unknown): 'up' | 'down' | 'flat' {
  if (typeof oldValue !== 'number' || typeof newValue !== 'number') return 'flat';
  if (newValue > oldValue) return 'up';
  if (newValue < oldValue) return 'down';
  return 'flat';
}

export function ObjectGrid(props: { title: string; values: Record<string, unknown>; emptyMessage: string }) {
  const entries = Object.entries(props.values);
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">{props.title}</div>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{key}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{renderValue(value, key)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StringListCard(props: { title: string; values: string[]; emptyMessage: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">{props.title}</div>
      {props.values.length === 0 ? (
        <p className="text-sm text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.values.map((value) => (
            <Badge key={value} variant="outline" className="border-[rgba(118,138,161,0.22)] text-[var(--cb-text-secondary)]">
              {value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function EventSummaryCard(props: {
  eventContext?: PromptRunEventContext | null;
  eventAdjustmentSummary?: PromptRunEventAdjustmentSummary | null;
  compact?: boolean;
}) {
  if (!props.eventContext && !props.eventAdjustmentSummary) return null;
  const publishedAt = formatRunEventPublishedAt(props.eventContext?.publishedAt);
  const summary = props.eventAdjustmentSummary;
  const title = props.eventContext?.title || summary?.normalizedEventSummary || 'Applied event';

  return (
    <div className="rounded-2xl border border-[rgba(59,130,246,0.24)] bg-[rgba(30,41,59,0.4)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-[rgba(96,165,250,0.3)] text-[#bfdbfe]">
          Event-linked
        </Badge>
        {summary?.eventCategory ? <Badge variant="outline">{summary.eventCategory}</Badge> : null}
        {typeof summary?.confidence === 'number' ? (
          <Badge variant="outline">Confidence {Math.round(summary.confidence * 100)}%</Badge>
        ) : null}
        {summary?.scenarioBias ? <Badge variant="outline">{summary.scenarioBias}</Badge> : null}
      </div>
      <div className="text-sm font-medium text-[var(--cb-text-primary)]">{title}</div>
      {(props.eventContext?.sourceLabel || publishedAt) && (
        <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
          {[props.eventContext?.sourceLabel, publishedAt].filter(Boolean).join(' • ')}
        </div>
      )}
      {summary?.normalizedEventSummary && !props.compact ? (
        <p className="mt-3 text-sm leading-6 text-[var(--cb-text-secondary)]">{summary.normalizedEventSummary}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(summary?.changedDrivers ?? []).map((driver) => (
          <Badge key={driver.driver} variant="outline" className="border-[rgba(59,130,246,0.28)] text-[var(--cb-text-primary)]">
            {driver.label} {formatEventSuggestionDirection(inferEventSuggestionDirection(driver.old, driver.new))}
          </Badge>
        ))}
      </div>
      {props.compact ? (
        <div className="mt-2 text-xs text-[var(--cb-text-muted)]">{summarizeEventDrivers(summary)}</div>
      ) : null}
      {summary?.warnings?.length ? (
        <div className="mt-3 text-xs text-[#fde68a]">{summary.warnings[0]}</div>
      ) : null}
    </div>
  );
}

export function SmartAssumptionSummaryCard(props: {
  smartAssumptionSummary?: PromptRunSmartAssumptionSummary | null;
}) {
  const summary = props.smartAssumptionSummary;
  if (!summary) return null;
  return (
    <div className="rounded-2xl border border-[rgba(16,185,129,0.24)] bg-[rgba(6,95,70,0.18)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-[rgba(52,211,153,0.28)] text-[#bbf7d0]">
          Smart assumptions
        </Badge>
        <Badge variant="outline">{summary.regime.replace(/_/g, ' ')}</Badge>
      </div>
      <div className="text-sm font-medium text-[var(--cb-text-primary)]">
        {summary.companyName ?? summary.ticker ?? 'Current company'}
      </div>
      {(summary.sector || summary.industry) ? (
        <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
          {[summary.sector, summary.industry].filter(Boolean).join(' • ')}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.changedDrivers.map((driver) => (
          <Badge key={driver.driver} variant="outline" className="border-[rgba(16,185,129,0.24)] text-[var(--cb-text-primary)]">
            {driver.label} {driver.confidence}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--cb-text-muted)]">
        {summary.provenanceSummary.companyProfile} {summary.provenanceSummary.peerContext}
      </p>
      {summary.warnings.length > 0 ? (
        <div className="mt-2 text-xs text-[#fde68a]">{summary.warnings[0]}</div>
      ) : null}
    </div>
  );
}

export function renderModelSpecificReview(preview: PreviewLike) {
  if (!preview.modelType) return null;

  if (preview.modelType === 'COMPS') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Subject</div>
          <div className="space-y-2 text-sm text-[var(--cb-text-secondary)]">
            <div>Revenue: {formatModelMoney(extracted.subjectRevenue)}</div>
            <div>EBITDA: {formatModelMoney(extracted.subjectEbitda)}</div>
            <div>Current Price: {formatCompactMetric(extracted.subjectPrice, 'currency')}</div>
          </div>
        </div>
        <ObjectGrid
          title="Selected Multiples"
          values={{
            evToRevenue: extracted.selectedEvToRevenue,
            evToEbitda: extracted.selectedEvToEbitda,
            peRatio: extracted.selectedPeRatio,
          }}
          emptyMessage="No selected multiples yet."
        />
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(10,14,20,0.75)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cb-text-muted)]">Peer Set</div>
          <p className="text-sm text-[var(--cb-text-secondary)]">
            {Array.isArray(extracted.peers) ? `${extracted.peers.length} comparable peers selected.` : 'No peer set attached yet.'}
          </p>
        </div>
      </div>
    );
  }

  if (preview.modelType === 'PRECEDENTS') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const transactions = Array.isArray(extracted.transactions) ? extracted.transactions : [];
    const previewDeals = transactions.slice(0, 4).map((transaction) => {
      const record = transaction as Record<string, unknown>;
      return `${record.target ?? record.transaction ?? 'Transaction'} • ${renderValue(record.ebitdaMultiple, 'multiple')} EV / EBITDA`;
    });
    return (
      <StringListCard
        title="Selected Deal Preview"
        values={previewDeals}
        emptyMessage="No precedent transactions selected."
      />
    );
  }

  if (preview.modelType === 'DEBT_CAPACITY_LITE') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const summary = calculateDebtCapacityPreview(extracted as never);
    return (
      <ObjectGrid
        title="Debt Capacity Preview"
        values={{
          maxDebt: summary?.maxDebt,
          leverageCap: summary?.leverageCap,
          coverageCap: summary?.coverageCap,
          bindingConstraint: summary?.bindingConstraint,
        }}
        emptyMessage="No debt capacity preview available."
      />
    );
  }

  if (preview.modelType === 'FOOTBALL_FIELD') {
    const extracted = preview.extractedInputs as Record<string, unknown>;
    const ranges = Array.isArray(extracted.ranges) ? extracted.ranges : [];
    const previewRanges = ranges.map((range) => {
      const record = range as Record<string, unknown>;
      return `${record.label ?? 'Range'} • ${formatModelMoney(record.low)} to ${formatModelMoney(record.high)}`;
    });
    return (
      <StringListCard
        title="Valuation Range Preview"
        values={previewRanges}
        emptyMessage="No valuation ranges available."
      />
    );
  }

  if (preview.modelType === 'MERGER') {
    const summary = calculateMergerSummary(preview.extractedInputs as never);
    return (
      <ObjectGrid
        title="Merger Summary"
        values={{
          cashConsideration: summary?.consideration.cash,
          stockConsideration: summary?.consideration.stock,
          debtConsideration: summary?.consideration.debt,
          proFormaRevenue: summary?.proFormaRevenue,
          proFormaEbitda: summary?.proFormaEbitda,
          epsAccretionPct: summary?.epsAccretionPct,
        }}
        emptyMessage="No merger summary available."
      />
    );
  }

  return null;
}
