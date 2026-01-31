'use client';

import { useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BaseAssumptions, ScenarioAssumptions, DcfResult, ForecastResult } from '@/lib/scenarioEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type ScenarioBundle = {
  recordId: string;
  scenario: ScenarioAssumptions;
  dcf: DcfResult;
  forecast: {
    quarterly: ForecastResult;
    yearly: ForecastResult;
  };
};

type ScenarioMap = {
  base?: ScenarioBundle;
  bull?: ScenarioBundle;
  bear?: ScenarioBundle;
};

type SavedScenario = {
  id: string;
  name: string;
  type: string;
  ticker?: string;
  created_at: string;
  assumptions: ScenarioAssumptions;
};

const defaultAssumptions: BaseAssumptions = {
  ticker: 'AAPL',
  revenue: 400000, // in millions
  revenueGrowth: 0.06,
  ebitdaMargin: 0.31,
  taxRate: 0.21,
  capexPercent: 0.05,
  wacc: 0.09,
  terminalGrowth: 0.02,
  netDebt: -60000,
  sharesOutstanding: 16000,
  forecastYears: 5
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const currency = (value: number) => `$${(value / 1000).toFixed(2)}B`;

export function ScenarioForecastSection({ initialCustomScenarios = [] }: { initialCustomScenarios?: SavedScenario[] }) {
  const [assumptions, setAssumptions] = useState<BaseAssumptions>(defaultAssumptions);
  const [scenarios, setScenarios] = useState<ScenarioMap>({});
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenarioExplanation, setScenarioExplanation] = useState<{ label: string; text: string } | null>(null);
  const [scenarioExplainLoading, setScenarioExplainLoading] = useState<string | null>(null);
  const [forecastExplainLoading, setForecastExplainLoading] = useState(false);
  const [forecastExplanation, setForecastExplanation] = useState<string | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<'quarterly' | 'yearly'>('quarterly');
  const [selectedScenarioForForecast, setSelectedScenarioForForecast] = useState<'base' | 'bull' | 'bear'>('base');
  const [customList, setCustomList] = useState<SavedScenario[]>(initialCustomScenarios);
  const [customName, setCustomName] = useState('Custom Scenario');
  const [customSaving, setCustomSaving] = useState(false);
  const forecastRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (key: keyof BaseAssumptions, value: string) => {
    setAssumptions((prev) => ({
      ...prev,
      [key]: key === 'ticker' ? value : Number(value)
    }));
  };

  const handleGenerateScenarios = async () => {
    setLoadingScenarios(true);
    setScenarioExplanation(null);
    try {
      const response = await fetch('/api/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseAssumptions: assumptions, ticker: assumptions.ticker })
      });
      if (!response.ok) {
        throw new Error('Unable to generate scenarios.');
      }
      const payload = await response.json();
      setScenarios({
        base: payload.base ?? undefined,
        bull: payload.bull ?? undefined,
        bear: payload.bear ?? undefined
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const handleExplainScenario = async (bundle?: ScenarioBundle) => {
    if (!bundle) return;
    setScenarioExplainLoading(bundle.recordId);
    setScenarioExplanation(null);
    try {
      const text = await streamText('/api/scenario-explain', { scenarioId: bundle.recordId });
      setScenarioExplanation({ label: bundle.scenario.name, text });
    } catch (error) {
      console.error(error);
      setScenarioExplanation({ label: bundle.scenario.name, text: 'Explanation failed.' });
    } finally {
      setScenarioExplainLoading(null);
    }
  };

  const handleExplainForecast = async (bundle?: ScenarioBundle) => {
    if (!bundle) return;
    setForecastExplainLoading(true);
    setForecastExplanation(null);
    try {
      const text = await streamText('/api/forecast-explain', { scenarioId: bundle.recordId });
      setForecastExplanation(text);
    } catch (error) {
      console.error(error);
      setForecastExplanation('Forecast explanation failed.');
    } finally {
      setForecastExplainLoading(false);
    }
  };

  const handleCustomScenarioSave = async () => {
    setCustomSaving(true);
    try {
      const response = await fetch('/api/scenarios/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName,
          ticker: assumptions.ticker,
          assumptions: {
            ...assumptions,
            name: customName,
            type: 'custom'
          }
        })
      });
      if (!response.ok) throw new Error('Failed to save custom scenario.');
      const data = await response.json();
      setCustomList((prev) => [{ id: data.scenario.id, ...data.scenario }, ...prev].slice(0, 15));
    } catch (error) {
      console.error(error);
    } finally {
      setCustomSaving(false);
    }
  };

  const chartData = useMemo(
    () => buildChartData(scenarios, selectedFrequency),
    [scenarios, selectedFrequency]
  );

  const selectedBundle = scenarios[selectedScenarioForForecast];

  const handleViewForecast = (type: 'base' | 'bull' | 'bear') => {
    setSelectedScenarioForForecast(type);
    forecastRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-secondary">Scenario Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <InputField label="Ticker" value={assumptions.ticker ?? ''} onChange={(value) => handleInputChange('ticker', value)} />
            <InputField
              label="Revenue (MM)"
              type="number"
              value={assumptions.revenue}
              onChange={(value) => handleInputChange('revenue', value)}
            />
            <InputField
              label="Revenue Growth %"
              type="number"
              step="0.01"
              value={assumptions.revenueGrowth}
              onChange={(value) => handleInputChange('revenueGrowth', value)}
            />
            <InputField
              label="EBITDA Margin %"
              type="number"
              step="0.01"
              value={assumptions.ebitdaMargin}
              onChange={(value) => handleInputChange('ebitdaMargin', value)}
            />
            <InputField
              label="WACC %"
              type="number"
              step="0.01"
              value={assumptions.wacc}
              onChange={(value) => handleInputChange('wacc', value)}
            />
            <InputField
              label="Terminal Growth %"
              type="number"
              step="0.005"
              value={assumptions.terminalGrowth}
              onChange={(value) => handleInputChange('terminalGrowth', value)}
            />
            <InputField
              label="Capex % of Revenue"
              type="number"
              step="0.005"
              value={assumptions.capexPercent}
              onChange={(value) => handleInputChange('capexPercent', value)}
            />
            <InputField
              label="Tax Rate %"
              type="number"
              step="0.01"
              value={assumptions.taxRate}
              onChange={(value) => handleInputChange('taxRate', value)}
            />
          </div>
          <Button onClick={handleGenerateScenarios} disabled={loadingScenarios}>
            {loadingScenarios ? 'Generating…' : 'Generate Scenarios'}
          </Button>
        </CardContent>
      </Card>

      {loadingScenarios && <Skeleton className="h-40 w-full rounded-xl" />}

      {!loadingScenarios && scenarios.base && (
        <div className="grid gap-4 md:grid-cols-3">
          {(['base', 'bull', 'bear'] as const).map((type) => {
            const bundle = scenarios[type];
            if (!bundle) return null;
            return (
              <Card key={bundle.recordId} className={cn('border-2', getBorderClass(type))}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{bundle.scenario.name}</span>
                    <span className="text-sm text-muted-foreground">{percent(bundle.scenario.revenueGrowth)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <p>Enterprise Value: <strong>{currency(bundle.dcf.enterpriseValue)}</strong></p>
                    <p>Equity Value: <strong>{currency(bundle.dcf.equityValue)}</strong></p>
                    {bundle.dcf.impliedSharePrice && (
                      <p>Implied Price: <strong>${bundle.dcf.impliedSharePrice.toFixed(2)}</strong></p>
                    )}
                  </div>
                  <div className="text-xs">
                    <p>Margin: {percent(bundle.scenario.ebitdaMargin)}</p>
                    <p>WACC: {percent(bundle.scenario.wacc)}</p>
                    <p>Terminal Growth: {percent(bundle.scenario.terminalGrowth)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExplainScenario(bundle)} disabled={scenarioExplainLoading === bundle.recordId}>
                      {scenarioExplainLoading === bundle.recordId ? 'Explaining…' : 'Explain Scenario'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleViewForecast(type)}>
                      View Forecast
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {scenarioExplanation && (
        <Card>
          <CardHeader>
            <CardTitle>{scenarioExplanation.label} – Explanation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{scenarioExplanation.text}</p>
          </CardContent>
        </Card>
      )}

      <Card ref={forecastRef}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Forecast Module</CardTitle>
              <p className="text-sm text-muted-foreground">Compare revenue/FCF projections across scenarios.</p>
            </div>
            <div className="flex gap-2 text-sm">
              <SelectButton label="Quarterly" active={selectedFrequency === 'quarterly'} onClick={() => setSelectedFrequency('quarterly')} />
              <SelectButton label="Yearly" active={selectedFrequency === 'yearly'} onClick={() => setSelectedFrequency('yearly')} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Generate scenarios to populate the chart.</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(1)}B`} />
                  <Tooltip formatter={(value: number) => currency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="base" stroke="#2563eb" strokeWidth={2} dot={false} name="Base Revenue" />
                  <Line type="monotone" dataKey="bull" stroke="#16a34a" strokeWidth={2} dot={false} name="Bull Revenue" />
                  <Line type="monotone" dataKey="bear" stroke="#dc2626" strokeWidth={2} dot={false} name="Bear Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Viewing {selectedFrequency} projections for the {selectedScenarioForForecast} scenario.
            </div>
            <Button variant="outline" size="sm" onClick={() => handleExplainForecast(selectedBundle)} disabled={!selectedBundle || forecastExplainLoading}>
              {forecastExplainLoading ? 'Explaining…' : 'Explain Forecast'}
            </Button>
          </div>
          {forecastExplanation && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="whitespace-pre-wrap">{forecastExplanation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <InputField label="Custom Scenario Name" value={customName} onChange={(value) => setCustomName(value)} />
              <Button onClick={handleCustomScenarioSave} disabled={customSaving}>
                {customSaving ? 'Saving…' : 'Save Custom Scenario'}
              </Button>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-secondary">Saved Scenarios</h4>
              {customList.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <div className="space-y-2">
                  {customList.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-secondary">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setAssumptions(item.assumptions)}>
                        Load
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  step
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  const id = `input-${label.toLowerCase().replace(/\s+/g, '-').replace(/[()%]/g, '')}`;
  
  return (
    <div className="space-y-1 text-sm">
      <Label htmlFor={id} className="text-muted-foreground">{label}</Label>
      <Input id={id} name={id} type={type} value={value} step={step} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        'rounded-full px-4 py-1 text-sm font-medium transition',
        active ? 'bg-secondary text-white' : 'bg-muted text-secondary hover:bg-muted/70'
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function getBorderClass(type: 'base' | 'bull' | 'bear') {
  switch (type) {
    case 'bull':
      return 'border-green-500/50';
    case 'bear':
      return 'border-red-500/50';
    default:
      return 'border-blue-500/50';
  }
}

function buildChartData(scenarios: ScenarioMap, frequency: 'quarterly' | 'yearly') {
  const labelOrder: string[] = [];
  const rows: Record<string, { label: string; base?: number; bull?: number; bear?: number }> = {};

  const register = (label: string) => {
    if (!labelOrder.includes(label)) {
      labelOrder.push(label);
      rows[label] = { label };
    }
  };

  const assign = (type: 'base' | 'bull' | 'bear', data?: ForecastResult) => {
    if (!data) return;
    data.data.forEach((point) => {
      register(point.label);
      rows[point.label][type] = point.revenue;
    });
  };

  assign('base', scenarios.base?.forecast[frequency]);
  assign('bull', scenarios.bull?.forecast[frequency]);
  assign('bear', scenarios.bear?.forecast[frequency]);

  return labelOrder.map((label) => rows[label]);
}

async function streamText(endpoint: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok || !response.body) {
    throw new Error('Streaming request failed.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

