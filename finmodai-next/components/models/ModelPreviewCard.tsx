import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModelPreviewSnapshot } from '@/types/modelPreview';
import { formatAuto } from '@/lib/unitConversion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  LineChart,
  Line,
  Cell,
  CartesianGrid,
} from 'recharts';
import { financeTooltipStyle } from '@/components/charts/FinanceChart';

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const data = values.map((v, i) => ({ x: i, y: v }));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" opacity={0.3} vertical={false} />
            <XAxis dataKey="x" hide />
            <Line
              type="monotone"
              dataKey="y"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1 }}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ModelPreviewCard({ preview }: { preview: ModelPreviewSnapshot }) {
  const driverData = preview.drivers.map(d => ({
    name: d.label,
    value: d.value * (d.direction === 'positive' ? 1 : -1),
  }));
  const hasDrivers = driverData.length > 0;
  const hasSparklines = preview.sparklines.length > 0;

  const formatHeadline = (value?: number) => {
    if (value === undefined || value === null || !isFinite(value)) return '—';
    return formatAuto(value, 2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {preview.ticker} — {preview.modelType.toUpperCase()} Snapshot
          <Badge variant={preview.confidence === 'high' ? 'default' : preview.confidence === 'medium' ? 'secondary' : 'outline'}>
            {preview.confidence} confidence
          </Badge>
        </CardTitle>
        <CardDescription>Quick view before you download Excel</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Enterprise Value</div>
            <div className="font-semibold">{formatHeadline(preview.headline.enterpriseValue)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Equity Value</div>
            <div className="font-semibold">{formatHeadline(preview.headline.equityValue)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Implied Share Price</div>
            <div className="font-semibold">
              {preview.headline.pricePerShare !== undefined
                ? `$${preview.headline.pricePerShare.toFixed(2)}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Upside / Downside</div>
            <div className="font-semibold">
              {preview.headline.upsidePct !== null && preview.headline.upsidePct !== undefined
                ? `+${(preview.headline.upsidePct * 100).toFixed(0)}%`
                : '—'}
              {' / '}
              {preview.headline.downsidePct !== null && preview.headline.downsidePct !== undefined
                ? `${(preview.headline.downsidePct * 100).toFixed(0)}%`
                : '—'}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2">Valuation Drivers</div>
          {hasDrivers ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={driverData} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={financeTooltipStyle} />
                  <Bar dataKey="value">
                    {driverData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.value >= 0 ? '#22c55e' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              Drivers unavailable for this run.
            </div>
          )}
        </div>

        {hasSparklines ? (
          <div className="grid grid-cols-2 gap-3">
            {preview.sparklines.map((s) => (
              <Sparkline key={s.label} values={s.values} label={`${s.label} · CAGR ${s.cagr ? (s.cagr * 100).toFixed(1) : '—'}%`} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            No projection trend available yet.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Revenue CAGR (5Y)</div>
            <div className="font-semibold">{preview.assumptions.revenueCagr !== undefined ? `${(preview.assumptions.revenueCagr * 100).toFixed(1)}%` : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">EBITDA Margin (Terminal)</div>
            <div className="font-semibold">{preview.assumptions.ebitdaMargin !== undefined ? `${(preview.assumptions.ebitdaMargin * 100).toFixed(1)}%` : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">WACC</div>
            <div className="font-semibold">{preview.assumptions.wacc !== undefined ? `${(preview.assumptions.wacc * 100).toFixed(1)}%` : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Terminal Growth</div>
            <div className="font-semibold">{preview.assumptions.terminalGrowth !== undefined ? `${(preview.assumptions.terminalGrowth * 100).toFixed(1)}%` : '—'}</div>
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs text-muted-foreground mb-1">AI Insight</div>
          <div>{preview.aiInsight}</div>
        </div>

        {preview.qualityWarnings.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-md p-2">
            {preview.qualityWarnings.join(' · ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
