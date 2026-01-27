'use client';

import { memo, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { UiBlock } from '@/lib/ai/schemas';
import { formatCurrencyCompact, formatPercent, formatNumber as formatNumberUtil } from '@/lib/format/number';
import { formatNumberWithAbbreviation } from '@/lib/modeling/inputMetadata';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const renderCell = (value: unknown, columnKey?: string) => {
  if (value == null) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  
  if (typeof value === 'number' && Number.isFinite(value)) {
    const key = (columnKey || '').toLowerCase();
    
    // Format based on column key hints
    if (key.includes('revenue') || key.includes('price') || key.includes('value') || key.includes('fcf') || key.includes('ebit') || key.includes('$')) {
      return formatCurrencyCompact(value, 1);
    }
    if (key.includes('%') || key.includes('pct') || key.includes('percent') || key.includes('margin') || key.includes('growth') || key.includes('rate')) {
      return formatPercent(value, 1);
    }
    if (key.includes('shares') || key.includes('count') || key.includes('units')) {
      return Math.round(value).toLocaleString();
    }
    
    // Default: use abbreviation for large numbers
    if (Math.abs(value) >= 1000) {
      return formatNumberWithAbbreviation(value, 1);
    }
    
    return formatNumberUtil(value, 1, false);
  }
  
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// Type for chart blocks (with proper type narrowing)
type ChartBlock = {
  kind: 'chart';
  title?: string;
  chartType: 'line' | 'bar';
  xKey: string;
  yKey: string | string[];
  data: unknown[];
  scenarios?: string[];
};

const RenderChart = memo(({ block }: { block: ChartBlock }) => {
  const chartData = useMemo(() => {
    const rows = Array.isArray(block.data) ? block.data.filter(isRecord) : [];
    const yKey = block.yKey;
    
    // If yKey is an array (multi-line), check all keys exist
    if (Array.isArray(yKey)) {
      return rows.filter((row) => {
        return yKey.every(key => {
          const y = row[key];
          return typeof y === 'number' && Number.isFinite(y);
        });
      });
    }
    
    // Single line chart
    return rows.filter((row) => {
      const y = row[yKey];
      return typeof y === 'number' && Number.isFinite(y);
    });
  }, [block.data, block.yKey]);

  if (chartData.length === 0) {
    return <div className="text-sm text-slate-400">No data.</div>;
  }

  const common = {
    data: chartData as any[],
    margin: { top: 10, right: 12, bottom: 6, left: 6 },
  };

  const axisTick = { fill: '#94a3b8', fontSize: 12 };

  // Multi-line chart support
  const isMultiLine = Array.isArray(block.yKey);
  const yKeys: string[] = isMultiLine ? [...block.yKey] : [String(block.yKey)];
  const scenarios = block.scenarios || [];
  
  // Color palette for multiple lines
  const colors = ['#34d399', '#60a5fa', '#f59e0b', '#f87171', '#a78bfa', '#8b5cf6'];

  if (block.chartType === 'bar') {
    // Bar charts: for now, only support single series
    const singleKey = yKeys[0];
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart {...common}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{
                background: 'rgba(2,6,23,0.92)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: '#e2e8f0',
                fontSize: 12,
              }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Bar dataKey={String(singleKey)} fill={colors[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Line chart (supports multi-line)
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart {...common}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{
              background: 'rgba(2,6,23,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: '#e2e8f0',
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          {isMultiLine ? (
            <>
              {yKeys.map((key, idx) => {
                // Extract scenario name from key (e.g., "revenue__Base" -> "Base")
                const scenarioName = scenarios[idx] || key.split('__').pop() || key;
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={scenarioName}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                );
              })}
              <Legend
                wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
                iconType="line"
              />
            </>
          ) : (
            <Line type="monotone" dataKey={String(block.yKey)} stroke={colors[0]} strokeWidth={2} dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

RenderChart.displayName = 'RenderChart';

const renderChart = (block: ChartBlock) => {
  return <RenderChart block={block} />;
};

const BlockItem = memo(({ block, idx }: { block: UiBlock; idx: number }) => {
  const title = typeof (block as any).title === 'string' ? (block as any).title : '';

  return (
    <Card className="border border-white/10 bg-black/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={cn('text-xs font-semibold uppercase tracking-wide', title ? 'text-slate-400' : 'text-slate-500')}>
          {title || 'Block'}
        </div>
        <Badge variant="outline" className="border-white/10 text-slate-500 text-[10px]">
          {block.kind}
        </Badge>
      </div>

      {block.kind === 'text' ? (
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{safeText(block.content) || '—'}</p>
      ) : block.kind === 'code' ? (
        <pre className="rounded-lg border border-white/10 bg-black/50 p-4 text-xs text-slate-200 overflow-auto whitespace-pre">
          {safeText(block.content)}
        </pre>
      ) : block.kind === 'table' ? (
        <Table>
          <TableHeader>
            <TableRow>
              {block.columns.map((col) => (
                <TableHead key={col} className="text-xs">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(block.rows ?? []).slice(0, 100).map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {block.columns.map((col, colIdx) => (
                  <TableCell key={colIdx} className="text-xs text-slate-200">
                    {renderCell(Array.isArray(row) ? row[colIdx] : undefined, col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : block.kind === 'chart' ? (
        renderChart(block as ChartBlock)
      ) : (
        <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(block, null, 2)}</pre>
      )}
    </Card>
  );
});

BlockItem.displayName = 'BlockItem';

export const BlockRenderer = memo((props: { blocks: UiBlock[] }) => {
  const blocks = useMemo(() => (Array.isArray(props.blocks) ? props.blocks : []), [props.blocks]);

  if (!blocks.length) {
    return <div className="text-sm text-slate-400">No blocks to render.</div>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <BlockItem key={`${block.kind}:${idx}`} block={block} idx={idx} />
      ))}
    </div>
  );
});

BlockRenderer.displayName = 'BlockRenderer';
