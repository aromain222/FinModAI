'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchTickerSnapshot, type TickerSnapshot } from '@/lib/tickerDataService';
import { runDcfLite, calculateValuationDelta, type DcfLiteInputs, type DcfLiteOutput } from '@/lib/dcfLite';
import { calculateGuardrails, validateScenarioInputs, generatePresetScenarios, type GuardrailBounds } from '@/lib/scenarioGuardrails';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type ScenarioType = 'base' | 'bull' | 'bear';

interface ScenarioInputs {
  revenueGrowth: number;
  fcfMargin: number;
  wacc: number;
  terminalMultiple: number;
}

interface EnhancedScenarioEngineProps {
  initialTicker?: string;
}

export function EnhancedScenarioEngine({ initialTicker }: EnhancedScenarioEngineProps) {
  const [ticker, setTicker] = useState(initialTicker || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [snapshot, setSnapshot] = useState<TickerSnapshot | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailBounds | null>(null);
  
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('base');
  const [scenarios, setScenarios] = useState<Record<ScenarioType, ScenarioInputs>>({
    base: { revenueGrowth: 0.08, fcfMargin: 0.15, wacc: 0.10, terminalMultiple: 10 },
    bull: { revenueGrowth: 0.15, fcfMargin: 0.20, wacc: 0.08, terminalMultiple: 15 },
    bear: { revenueGrowth: 0.03, fcfMargin: 0.10, wacc: 0.12, terminalMultiple: 8 },
  });
  
  const [results, setResults] = useState<Record<ScenarioType, DcfLiteOutput | null>>({
    base: null,
    bull: null,
    bear: null,
  });
  
  const [warnings, setWarnings] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'revenue' | 'fcf'>('fcf');

  // Debounced ticker fetch
  useEffect(() => {
    if (!ticker || ticker.length < 1) return;
    
    const timer = setTimeout(() => {
      handleFetchTicker();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [ticker]);

  const handleFetchTicker = async () => {
    if (!ticker || ticker.length < 1) return;
    
    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const data = await fetchTickerSnapshot(ticker);
      setSnapshot(data);
      
      // Calculate guardrails
      const bounds = calculateGuardrails(data);
      setGuardrails(bounds);
      
      // Generate preset scenarios
      const presets = generatePresetScenarios(bounds);
      const nextScenarios: Record<ScenarioType, ScenarioInputs> = {
        base: {
          revenueGrowth: presets.base.revenueGrowth,
          fcfMargin: presets.base.fcfMargin,
          wacc: presets.base.wacc,
          terminalMultiple: presets.base.terminalMultiple,
        },
        bull: {
          revenueGrowth: presets.bull.revenueGrowth,
          fcfMargin: presets.bull.fcfMargin,
          wacc: presets.bull.wacc,
          terminalMultiple: presets.bull.terminalMultiple,
        },
        bear: {
          revenueGrowth: presets.bear.revenueGrowth,
          fcfMargin: presets.bear.fcfMargin,
          wacc: presets.bear.wacc,
          terminalMultiple: presets.bear.terminalMultiple,
        },
      };
      setScenarios(nextScenarios);
      
      // Show data quality warnings
      if (data.warnings.length > 0) {
        setWarnings(data.warnings);
      }
      
      // Run initial calculations
      runAllScenarios(data, nextScenarios);
    } catch (err: any) {
      console.error('Error fetching ticker:', err);
      setError(err.message || 'Failed to fetch ticker data');
    } finally {
      setLoading(false);
    }
  };

  const runAllScenarios = (snapshotData: TickerSnapshot, scenarioInputs?: Record<ScenarioType, ScenarioInputs>) => {
    const inputsToUse = scenarioInputs || scenarios;
    const newResults: Record<ScenarioType, DcfLiteOutput | null> = { base: null, bull: null, bear: null };

    // DCF-lite requires a usable share count to compute price per share.
    const inferredShares =
      snapshotData.sharesOutstanding ??
      (snapshotData.currentPrice && snapshotData.marketCap
        ? snapshotData.marketCap / snapshotData.currentPrice
        : null);
    const sharesOutstanding =
      typeof inferredShares === 'number' && Number.isFinite(inferredShares) && inferredShares > 0
        ? inferredShares
        : null;

    if (!sharesOutstanding) {
      setResults(newResults);
      setWarnings((prev) => [
        ...prev,
        'Shares outstanding unavailable; scenario price-per-share outputs are disabled until data is available.',
      ]);
      return;
    }

    (['base', 'bull', 'bear'] as ScenarioType[]).forEach((type) => {
      const inputs: DcfLiteInputs = {
        ticker: snapshotData.ticker,
        baseRevenue: snapshotData.history[snapshotData.history.length - 1]?.revenue || 1e9,
        revenueGrowth: inputsToUse[type].revenueGrowth,
        fcfMargin: inputsToUse[type].fcfMargin,
        wacc: inputsToUse[type].wacc,
        terminalMethod: 'multiple',
        terminalMultiple: inputsToUse[type].terminalMultiple,
        projectionYears: 5,
        netDebt: snapshotData.netDebt,
        sharesOutstanding,
      };

      newResults[type] = runDcfLite(inputs);
    });

    setResults(newResults);
  };

  const handleScenarioChange = (field: keyof ScenarioInputs, value: number) => {
    const newScenarios = {
      ...scenarios,
      [activeScenario]: {
        ...scenarios[activeScenario],
        [field]: value,
      },
    };
    setScenarios(newScenarios);

    // Validate
    if (guardrails) {
      const validation = validateScenarioInputs({ [field]: value }, guardrails);
      if (!validation.valid) {
        setWarnings(validation.warnings);
      } else {
        setWarnings([]);
      }
    }

    // Recalculate
    if (snapshot) {
      runAllScenarios(snapshot, newScenarios);
    }
  };

  const handleResetScenario = () => {
    if (!guardrails) return;
    
    const presets = generatePresetScenarios(guardrails);
    const newScenarios = {
      ...scenarios,
      [activeScenario]: {
        revenueGrowth: presets[activeScenario].revenueGrowth,
        fcfMargin: presets[activeScenario].fcfMargin,
        wacc: presets[activeScenario].wacc,
        terminalMultiple: presets[activeScenario].terminalMultiple,
      },
    };
    setScenarios(newScenarios);
    
    if (snapshot) {
      runAllScenarios(snapshot, newScenarios);
    }
  };

  // Calculate valuation range
  const valuationRange = results.base && results.bull && results.bear ? {
    base: results.base.pricePerShare,
    bull: results.bull.pricePerShare,
    bear: results.bear.pricePerShare,
    current: snapshot?.currentPrice || 0,
  } : null;

  // Calculate deltas for driver attribution
  const driverAttribution = results.base && results[activeScenario] && activeScenario !== 'base'
    ? calculateValuationDelta(results.base, results[activeScenario])
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Ticker Input */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ticker">Enter Ticker Symbol</Label>
            <Input
              id="ticker"
              type="text"
              placeholder="e.g., AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="max-w-xs mt-2"
            />
          </div>
          
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
              {error}
            </div>
          )}
          
          {snapshot && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Auto-built base case using public financials and simple inference.</strong> 
                Assumptions are editable; results are directional. Not investment advice.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="font-semibold">{snapshot.companyName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="font-semibold">
                    {snapshot.currentPrice != null ? `$${snapshot.currentPrice.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Market Cap</p>
                  <p className="font-semibold">
                    {snapshot.marketCap != null ? `$${(snapshot.marketCap / 1e9).toFixed(2)}B` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data Quality</p>
                  <p className={`font-semibold ${
                    snapshot.dataQuality === 'high' ? 'text-green-500' :
                    snapshot.dataQuality === 'medium' ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {snapshot.dataQuality.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {warnings.length > 0 && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-sm mb-2">Warnings:</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {warnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {snapshot && guardrails && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Scenario Controls */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Scenario Controls</h3>
              
              {/* Scenario Selector */}
              <div className="flex gap-2 mb-6">
                {(['base', 'bull', 'bear'] as ScenarioType[]).map((type) => (
                  <Button
                    key={type}
                    variant={activeScenario === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveScenario(type)}
                    className="flex-1 capitalize"
                  >
                    {type}
                  </Button>
                ))}
              </div>

              {/* Sliders */}
              <div className="space-y-6">
                {/* Revenue Growth */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Revenue Growth</Label>
                    <span className="text-sm font-semibold">
                      {(scenarios[activeScenario].revenueGrowth * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    value={[scenarios[activeScenario].revenueGrowth * 100]}
                    onValueChange={([value]) => handleScenarioChange('revenueGrowth', value / 100)}
                    min={guardrails.revenueGrowth.min * 100}
                    max={guardrails.revenueGrowth.max * 100}
                    step={0.5}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(guardrails.revenueGrowth.min * 100).toFixed(0)}%</span>
                    <span>{(guardrails.revenueGrowth.max * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* FCF Margin */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>FCF Margin</Label>
                    <span className="text-sm font-semibold">
                      {(scenarios[activeScenario].fcfMargin * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    value={[scenarios[activeScenario].fcfMargin * 100]}
                    onValueChange={([value]) => handleScenarioChange('fcfMargin', value / 100)}
                    min={guardrails.fcfMargin.min * 100}
                    max={guardrails.fcfMargin.max * 100}
                    step={0.5}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(guardrails.fcfMargin.min * 100).toFixed(0)}%</span>
                    <span>{(guardrails.fcfMargin.max * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* WACC */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>WACC (Discount Rate)</Label>
                    <span className="text-sm font-semibold">
                      {(scenarios[activeScenario].wacc * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    value={[scenarios[activeScenario].wacc * 100]}
                    onValueChange={([value]) => handleScenarioChange('wacc', value / 100)}
                    min={guardrails.wacc.min * 100}
                    max={guardrails.wacc.max * 100}
                    step={0.5}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(guardrails.wacc.min * 100).toFixed(0)}%</span>
                    <span>{(guardrails.wacc.max * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Terminal Multiple */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Terminal Multiple (EV/Revenue)</Label>
                    <span className="text-sm font-semibold">
                      {scenarios[activeScenario].terminalMultiple.toFixed(1)}x
                    </span>
                  </div>
                  <Slider
                    value={[scenarios[activeScenario].terminalMultiple]}
                    onValueChange={([value]) => handleScenarioChange('terminalMultiple', value)}
                    min={guardrails.terminalMultiple.min}
                    max={guardrails.terminalMultiple.max}
                    step={0.5}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{guardrails.terminalMultiple.min.toFixed(0)}x</span>
                    <span>{guardrails.terminalMultiple.max.toFixed(0)}x</span>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetScenario}
                className="w-full mt-6"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </Card>
          </div>

          {/* Right: Visual Outputs */}
          <div className="space-y-6">
            {/* Valuation Range */}
            {valuationRange && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Valuation Range</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Bear', value: valuationRange.bear, fill: '#ef4444' },
                      { name: 'Base', value: valuationRange.base, fill: '#3b82f6' },
                      { name: 'Bull', value: valuationRange.bull, fill: '#10b981' },
                      { name: 'Current', value: valuationRange.current, fill: '#f59e0b' },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${value.toFixed(0)}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                      />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 text-sm text-center">
                  <p className="font-semibold">
                    Range: ${valuationRange.bear.toFixed(2)} - ${valuationRange.bull.toFixed(2)}
                  </p>
                  <p className="text-muted-foreground">
                    Base: ${valuationRange.base.toFixed(2)} | 
                    Upside: {((valuationRange.bull / valuationRange.current - 1) * 100).toFixed(1)}% | 
                    Downside: {((valuationRange.bear / valuationRange.current - 1) * 100).toFixed(1)}%
                  </p>
                </div>
              </Card>
            )}

            {/* Driver Attribution (Tornado Chart) */}
            {driverAttribution && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Driver Attribution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={driverAttribution.drivers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                      <XAxis type="number" stroke="#9ca3af" tickFormatter={(value) => `$${(value / 1e6).toFixed(0)}M`} />
                      <YAxis type="category" dataKey="name" stroke="#9ca3af" width={120} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`$${(value / 1e6).toFixed(0)}M`, 'Impact']}
                      />
                      <Bar dataKey="impact" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* FCF + Revenue Path */}
            {results.base && results.bull && results.bear && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Projection Path</h3>
                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === 'revenue' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('revenue')}
                    >
                      Revenue
                    </Button>
                    <Button
                      variant={viewMode === 'fcf' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('fcf')}
                    >
                      FCF
                    </Button>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                      <XAxis dataKey="year" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${(value / 1e6).toFixed(0)}M`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`$${(value / 1e6).toFixed(0)}M`, viewMode === 'revenue' ? 'Revenue' : 'FCF']}
                      />
                      <Legend />
                      <Line
                        data={results.bear.projections}
                        type="monotone"
                        dataKey={viewMode === 'revenue' ? 'revenue' : 'fcf'}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Bear"
                      />
                      <Line
                        data={results.base.projections}
                        type="monotone"
                        dataKey={viewMode === 'revenue' ? 'revenue' : 'fcf'}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Base"
                      />
                      <Line
                        data={results.bull.projections}
                        type="monotone"
                        dataKey={viewMode === 'revenue' ? 'revenue' : 'fcf'}
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Bull"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Risk Indicator */}
            {valuationRange && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Risk Indicator</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current vs Base</p>
                    <div className="flex items-center gap-2">
                      {valuationRange.current < valuationRange.base ? (
                        <TrendingUp className="h-5 w-5 text-green-500" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-500" />
                      )}
                      <span className={`text-lg font-semibold ${
                        valuationRange.current < valuationRange.base ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {((valuationRange.base / valuationRange.current - 1) * 100).toFixed(1)}% 
                        {valuationRange.current < valuationRange.base ? ' Upside' : ' Downside'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Worst Case (Bear)</p>
                    <p className="text-lg font-semibold">${valuationRange.bear.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">
                      {((valuationRange.bear / valuationRange.current - 1) * 100).toFixed(1)}% from current
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Best Case (Bull)</p>
                    <p className="text-lg font-semibold">${valuationRange.bull.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">
                      {((valuationRange.bull / valuationRange.current - 1) * 100).toFixed(1)}% from current
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
