"use client";

import { ModelDocument, isTableBlock, isTextBlock, isSpacerBlock, isCalloutBlock } from '@/lib/models/schema';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type RenderOptions = {
  maxRows?: number;
  maxColumns?: number;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toNumeric = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '').replace('%', '').trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizePercent = (value: number) => {
  if (!Number.isFinite(value)) return value;
  return Math.abs(value) > 1.5 ? value / 100 : value;
};

const formatValue = (value: any, opts: { style?: string; type?: string; label?: string; currency?: string }) => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = toNumeric(value);
  if (numeric === null) return String(value);

  const currency = opts.currency || 'USD';
  const style = opts.style || '';
  const type = opts.type || '';
  const label = (opts.label || '').toLowerCase();
  const isPercent = style.includes('percent') || type === 'percent' || label.includes('%') || label.includes('wacc');
  const isCurrency = style.includes('currency') || type === 'currency' || label.includes('value') || label.includes('price');
  const isPerShare = label.includes('per share') || style.includes('currency_2');

  if (isPercent) {
    const pct = normalizePercent(numeric);
    const rounded = Number((pct * 100).toFixed(1)) / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(rounded);
  }

  if (isCurrency) {
    const decimals = isPerShare ? 2 : 0;
    const rounded = decimals === 0 ? Math.round(numeric) : Number(numeric.toFixed(decimals));
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(rounded);
  }

  const decimals = 0;
  const rounded = Math.round(numeric);
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded);
};

function TableView({ block, opts, meta }: { block: any; opts: RenderOptions; meta: ModelDocument['meta'] }) {
  const rows = block.rows || [];
  const cols = block.columns || [];
  const maxRows = opts.maxRows ?? 60;
  const visibleRows = rows.slice(0, maxRows);
  const truncated = rows.length > visibleRows.length;
  const tableId = String(block.tableId || '');
  const isProjectionTable = tableId.includes('projection');
  const isAssumptionsTable = tableId.includes('assumptions');
  const isSummaryTable = tableId.includes('summary');

  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-background shadow-sm',
        isProjectionTable ? 'bg-background' : 'bg-background/70'
      )}
    >
      {block.title && (
        <div className="px-4 py-3 border-b border-border/60 text-sm font-semibold tracking-tight text-foreground">
          {block.title}
        </div>
      )}
      <ScrollArea className="w-full">
        <table className={cn('w-full border-collapse', isSummaryTable ? 'table-auto' : 'table-fixed')}>
          <thead>
            <tr className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              {cols.map((c: any, idx: number) => (
                <th
                  key={c.key}
                  className={cn(
                    'border-b border-border px-3 py-2 text-left font-semibold',
                    idx > 0 ? 'text-right' : 'text-left'
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r: any, rowIdx: number) => (
              <tr
                key={r.rowKey}
                className={cn(
                  'border-b border-border/60',
                  r.rowType === 'total' || r.rowType === 'subtotal' ? 'bg-muted/40 font-semibold' : '',
                  isProjectionTable && rowIdx % 2 === 1 ? 'bg-muted/20' : '',
                  'hover:bg-muted/30 transition-colors'
                )}
              >
                {cols.map((c: any) => {
                  const cell = r.cells?.[c.key];
                  const labelText = String(r.cells?.metric?.value ?? r.labelCell ?? '');
                  const highlightMetric =
                    isSummaryTable &&
                    ['enterprise value', 'price per share'].some((metric) =>
                      labelText.toLowerCase().includes(metric)
                    );
                  const displayVal = cell?.display;
                  const displayNum = displayVal != null ? toNumeric(displayVal) : null;
                  const formatted = displayVal != null && displayNum === null
                    ? String(displayVal)
                    : displayNum != null
                      ? formatValue(displayNum, {
                          style: cell?.style,
                          type: c.type,
                          label: labelText || c.label,
                          currency: meta.currency,
                        })
                      : formatValue(cell?.value, {
                          style: cell?.style,
                          type: c.type,
                          label: labelText || c.label,
                          currency: meta.currency,
                        });
                  const isNumeric = typeof cell?.value === 'number';
                  const status = cell?.meta?.status;
                  const isEditable = status === 'user_provided';
                  const isMissing = status === 'missing' || cell?.value === null;

                  return (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 text-xs align-top',
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                        r.rowType === 'total' || r.rowType === 'subtotal' ? 'border-t border-border' : '',
                        c.key === 'metric' || c.key === 'line_item' ? 'text-muted-foreground font-medium' : '',
                        isNumeric ? 'font-mono tabular-nums' : '',
                        isEditable ? 'bg-sky-50/80 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100' : '',
                        isMissing ? 'text-muted-foreground italic' : '',
                        highlightMetric && c.key === 'value' ? 'text-base font-semibold text-foreground' : '',
                        highlightMetric && c.key === 'metric' ? 'text-foreground' : '',
                        isAssumptionsTable && isEditable ? 'ring-1 ring-sky-200/60 dark:ring-sky-700/40' : ''
                      )}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
            {truncated && (
              <tr>
                <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={cols.length}>
                  More in Excel…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function BlockView({ block, opts, meta }: { block: any; opts: RenderOptions; meta: ModelDocument['meta'] }) {
  if (isTableBlock(block)) return <TableView block={block} opts={opts} meta={meta} />;
  if (isTextBlock(block)) return <p className="text-sm text-muted-foreground whitespace-pre-line">{block.content}</p>;
  if (isSpacerBlock(block)) return <div style={{ height: (block.height || 1) * 8 }} />;
  if (isCalloutBlock(block))
    return (
      <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {block.content}
      </div>
    );
  return null;
}

function SectionView({ section, opts, meta }: { section: any; opts: RenderOptions; meta: ModelDocument['meta'] }) {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4">
      {section.title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
        </div>
      )}
      <div className="space-y-5">
        {section.blocks.map((b: any, idx: number) => (
          <BlockView key={idx} block={b} opts={opts} meta={meta} />
        ))}
      </div>
    </div>
  );
}

export function ModelPreviewRenderer({ doc, opts = {} }: { doc: ModelDocument; opts?: RenderOptions }) {
  if (!doc) return null;
  const primarySection = doc.sections[0];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">{doc.meta.ticker}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {doc.meta.companyName}
            </CardDescription>
            {(doc.meta.currency || doc.meta.units) && (
              <p className="text-sm font-medium text-muted-foreground">
                All figures in {[doc.meta.currency, doc.meta.units].filter(Boolean).join(' ') || 'local units'}.
              </p>
            )}
          </div>
          <div className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {doc.meta.modelType} model
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Model Type</div>
            <div className="text-sm font-medium text-foreground">{doc.meta.modelType.toUpperCase()}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">As of Date</div>
            <div className="text-sm font-medium text-foreground">{formatDate(doc.meta.asOfDate)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Generated</div>
            <div className="text-sm font-medium text-foreground">{formatDateTime(doc.meta.generatedAt)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Currency / Units</div>
            <div className="text-sm font-medium text-foreground">{doc.meta.currency} • {doc.meta.units}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-10">
        {primarySection && <SectionView section={primarySection} opts={opts} meta={doc.meta} />}

        {doc.sections.slice(1).map((s) => (
          <div key={s.id} className="space-y-6">
            <Separator className="my-4" />
            <SectionView section={s} opts={opts} meta={doc.meta} />
          </div>
        ))}

        <Separator className="my-4" />
        <div className="text-xs text-muted-foreground">
          Notes: Preview reflects Excel structure. Download for full detail.
        </div>
      </CardContent>
    </Card>
  );
}
