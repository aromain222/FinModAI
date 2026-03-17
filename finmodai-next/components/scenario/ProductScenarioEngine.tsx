/**
 * Product-Grade Scenario Engine
 *
 * Main component with tabbed interface (Overview, Charts, Details)
 */

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchTickerSnapshot, type TickerSnapshot } from '@/lib/tickerDataService';
import { buildAssumptionSandbox, type AssumptionSandbox } from '@/lib/fallbacks';
import { SCENARIO_FRAMES, getScenarioFrame, type ScenarioFrameType } from '@/lib/scenarioFrames';
import { applyScenarioFrame, computeValuation, projectTimeSeries, type BaseAssumptions, type ValuationResult } from '@/lib/frameEngine';
import { waterfallAttribution, type WaterfallData } from '@/lib/attribution';
import { generateScenarioSummary, generateAIScenarioExplanation } from '@/lib/explanationEngine';
import { formatValueOrDash, formatCurrency } from '@/lib/utils';
import { ScenarioFrameSelector } from './ScenarioFrameSelector';
import { ScenarioOverview } from './ScenarioOverview';
import { DataQualityWarning } from './DataQualityWarning';
import { ValuationOutcome } from './ValuationOutcome';
import { DriverAttributionChart } from './DriverAttributionChart';
import { ScenarioExplanation } from './ScenarioExplanation';

type DemoCompany = { ticker: string; companyName: string | null; sector: string | null };
type ScenarioExplanationState = ReturnType<typeof generateScenarioSummary>;

export function ProductScenarioEngine() {
  // State
  const [tickerInput, setTickerInput] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [demoCompanies, setDemoCompanies] = useState<DemoCompany[]>([]);
  const [demoCompaniesLoading, setDemoCompaniesLoading] = useState(false);

  const [tickerSnapshot, setTickerSnapshot] = useState<TickerSnapshot | null>(null);
  const [sandbox, setSandbox] = useState<AssumptionSandbox | null>(null);

  const [selectedFrame, setSelectedFrame] = useState<ScenarioFrameType>('base');
  const [baseValuation, setBaseValuation] = useState<ValuationResult | null>(null);
  const [scenarioValuation, setScenarioValuation] = useState<ValuationResult | null>(null);
  const [attribution, setAttribution] = useState<WaterfallData | null>(null);
  const [explanation, setExplanation] = useState<ScenarioExplanationState | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const analysisRequestIdRef = useRef(0);
  const aiRequestIdRef = useRef(0);

  // Fetch demo company universe on load so it's always visible in the UI
  useEffect(() => {
    let cancelled = false;
    const loadDemoCompanies = async () => {
      setDemoCompaniesLoading(true);
      try {
        const response = await fetch('/api/demo/tickers?demo=true&scenarioReady=true');
        if (!response.ok) throw new Error('Failed to load demo tickers');
        const data = await response.json() as { companies?: unknown };
        const normalized = normalizeDemoCompanies(data.companies);
        if (!cancelled) {
          setDemoCompanies(normalized);
          if (normalized.length > 0) {
            setTickerInput((current) => current || normalized[0].ticker);
          }
        }
      } catch {
        if (!cancelled) setDemoCompanies([]);
      } finally {
        if (!cancelled) setDemoCompaniesLoading(false);
      }
    };

    void loadDemoCompanies();
    return () => { cancelled = true; };
  }, []);

  const filteredDemoCompanies = useMemo(() => {
    if (!companyQuery.trim()) return demoCompanies;
    const query = companyQuery.trim().toLowerCase();
    return demoCompanies.filter((company) => {
      const matchesTicker = company.ticker.toLowerCase().includes(query);
      const matchesName = company.companyName?.toLowerCase().includes(query) ?? false;
      const matchesSector = company.sector?.toLowerCase().includes(query) ?? false;
      return matchesTicker || matchesName || matchesSector;
    });
  }, [companyQuery, demoCompanies]);

  // Handle ticker input (optional override: use this ticker instead of state)
  const handleTickerSubmit = async (overrideTicker?: string) => {
    const raw = typeof overrideTicker === 'string' ? overrideTicker : tickerInput;
    const toAnalyze = normalizeTickerSymbol(raw);
    if (!toAnalyze) {
      setError('Enter a valid ticker symbol (for example, AAPL).');
      return;
    }

    const requestId = ++analysisRequestIdRef.current;

    setTickerInput(toAnalyze);
    setActiveTicker(toAnalyze);
    setLoading(true);
    setError(null);
    setSelectedFrame('base');
    setActiveTab('overview');
    aiRequestIdRef.current += 1;
    setAiSummary('');
    setAiConfidence('medium');
    setTickerSnapshot(null);
    setSandbox(null);
    setBaseValuation(null);
    setScenarioValuation(null);
    setAttribution(null);
    setExplanation(null);

    try {
      // Fetch ticker data
      const snapshot = await fetchTickerSnapshot(toAnalyze);
      if (requestId !== analysisRequestIdRef.current) return;
      setTickerSnapshot(snapshot);

      // Build assumption sandbox
      const newSandbox = buildAssumptionSandbox(toAnalyze, snapshot);
      setSandbox(newSandbox);

      // Compute base case valuation
      const baseVal = computeValuation(
        newSandbox.assumptions,
        snapshot.netDebt,
        snapshot.sharesOutstanding ?? undefined
      );
      setBaseValuation(baseVal);

      // Reset scenario to base
      setScenarioValuation(baseVal);

    } catch (err: unknown) {
      if (requestId !== analysisRequestIdRef.current) return;
      const rawMessage = err instanceof Error ? err.message : 'Failed to fetch ticker data';
      const message = rawMessage.toLowerCase().includes('demo snapshot not available')
        ? `Ticker ${toAnalyze} is not wired in the current S&P 500 company universe yet.`
        : rawMessage;
      setError(message);
      setTickerSnapshot(null);
      setSandbox(null);
      setBaseValuation(null);
      setScenarioValuation(null);
      setAttribution(null);
      setExplanation(null);
    } finally {
      if (requestId === analysisRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Handle scenario frame change
  useEffect(() => {
    if (!sandbox || !baseValuation || !tickerSnapshot) return;

    const frame = getScenarioFrame(selectedFrame);
    if (!frame) return;

    // Apply scenario frame
    const scenarioAssumptions = applyScenarioFrame(sandbox.assumptions, frame);

    // Compute scenario valuation
    const scenarioVal = computeValuation(
      scenarioAssumptions,
      tickerSnapshot.netDebt,
      tickerSnapshot.sharesOutstanding ?? undefined
    );
    setScenarioValuation(scenarioVal);

    // Compute attribution
    const attr = waterfallAttribution(
      sandbox.assumptions,
      scenarioAssumptions,
      baseValuation.enterpriseValue,
      scenarioVal.enterpriseValue,
      tickerSnapshot.netDebt
    );
    setAttribution(attr);

    // Generate explanation
    const expl = generateScenarioSummary(
      sandbox.assumptions,
      scenarioAssumptions,
      baseValuation,
      scenarioVal,
      attr,
      frame
    );
    setExplanation(expl);

    // Generate AI explanation (async, don't block). Ignore stale responses.
    if (selectedFrame !== 'base') {
      const aiRequestId = ++aiRequestIdRef.current;
      void generateAIExplanation(
        aiRequestId,
        frame,
        sandbox,
        tickerSnapshot,
        scenarioAssumptions,
        baseValuation,
        scenarioVal
      );
    } else {
      aiRequestIdRef.current += 1;
      setAiSummary('');
      setAiConfidence('medium');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateAIExplanation intentionally not in deps
  }, [selectedFrame, sandbox, baseValuation, tickerSnapshot]);

  // Generate AI explanation
  const generateAIExplanation = async (
    requestId: number,
    frame: { name: string; description: string },
    currentSandbox: AssumptionSandbox,
    currentSnapshot: TickerSnapshot,
    scenarioAssumptions: BaseAssumptions,
    baseVal: ValuationResult,
    scenarioVal: ValuationResult
  ) => {
    const baseAssumptionsRecord = currentSandbox.assumptions as unknown as Record<string, number | undefined>;
    const scenarioAssumptionsRecord = scenarioAssumptions as unknown as Record<string, number | undefined>;

    const assumptionDeltas = Object.keys(baseAssumptionsRecord)
      .filter(key => {
        const baseValue = baseAssumptionsRecord[key];
        const scenarioValue = scenarioAssumptionsRecord[key];
        return typeof baseValue === 'number' && typeof scenarioValue === 'number' && Math.abs(scenarioValue - baseValue) > 0.0001;
      })
      .map(key => ({
        field: key,
        baseValue: baseAssumptionsRecord[key] ?? 0,
        scenarioValue: scenarioAssumptionsRecord[key] ?? 0,
      }));

    const result = await generateAIScenarioExplanation(
      currentSnapshot.ticker,
      baseVal,
      scenarioVal,
      frame.name,
      frame.description,
      assumptionDeltas,
      currentSandbox.dataQuality
    );

    if (requestId !== aiRequestIdRef.current) return;

    if (result.aiSummary) {
      setAiSummary(result.aiSummary);
      setAiConfidence(result.confidence);
    } else {
      setAiSummary('');
      setAiConfidence('low');
    }
  };

  const projectionChartData = useMemo(
    () =>
      baseValuation && scenarioValuation && sandbox
        ? prepareProjectionChartData(sandbox.assumptions, selectedFrame)
        : [],
    [baseValuation, scenarioValuation, sandbox, selectedFrame]
  );

  const currentFrame = getScenarioFrame(selectedFrame);

  return (
    <div className="space-y-6">
      {/* Ticker Input - Always visible */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Scenario Engine
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Run a base valuation, apply a scenario frame, and compare how valuation moves.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1">1. Pick a company</span>
              <span className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1">2. Select a scenario frame</span>
              <span className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1">3. Review valuation impact</span>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {activeTicker ? `Active company: ${activeTicker}` : 'No company selected'}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(normalizeTickerSymbol(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleTickerSubmit();
              }
            }}
            placeholder="Enter ticker (e.g., AAPL)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={() => {
              void handleTickerSubmit();
            }}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze
              </>
            )}
          </button>
          {tickerSnapshot && (
            <button
              onClick={() => {
                void handleTickerSubmit();
              }}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Demo company universe - always visible in UI so users know which companies to pick */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Demo company universe
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pick from supported demo companies, or type a ticker directly.
              </p>
            </div>
            <div className="w-full md:w-72">
              <input
                type="text"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                placeholder="Filter companies"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={demoCompaniesLoading}
              />
            </div>
          </div>

          {demoCompaniesLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading demo companies…
            </div>
          ) : filteredDemoCompanies.length > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Showing {filteredDemoCompanies.length} of {demoCompanies.length} companies
              </div>
              <div className="max-h-64 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {filteredDemoCompanies.map((c) => {
                    const tickerStr = normalizeTickerSymbol(c.ticker);
                    const isSelected = activeTicker === tickerStr;
                    const label = c.companyName ?? tickerStr;
                  return (
                    <button
                      key={`${tickerStr}-${label}`}
                      type="button"
                      onClick={() => {
                        setError(null);
                        void handleTickerSubmit(tickerStr);
                      }}
                      disabled={loading}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border
                        ${isSelected
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }
                    `}
                      title={label}
                    >
                      {tickerStr}
                      {c.companyName && (
                        <span className={`ml-1.5 font-normal ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                          · {c.companyName}
                        </span>
                      )}
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {demoCompanies.length > 0
                  ? 'No companies match your filter.'
                  : (
                    <>
                      No demo companies available. Add data to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">demo_company_snapshots</code> or enable demo mode with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">?demo=true</code>.
                    </>
                  )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Loading state while fetching selected company */}
      {loading && !baseValuation && (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {activeTicker ? `Loading ${activeTicker} scenario data...` : 'Loading scenario data...'}
          </div>
        </div>
      )}

      {/* Main Content - Tabbed Interface */}
      {baseValuation && scenarioValuation && sandbox && tickerSnapshot && currentFrame && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Scenario Selector */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Select Scenario
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Choose the operating and valuation frame you want to test against the base case.
                </p>
                <div className="mt-4">
                  <ScenarioFrameSelector
                    selectedFrame={selectedFrame}
                    onSelectFrame={setSelectedFrame}
                  />
                </div>
              </div>
            </div>
            
            {/* Data Quality Warning */}
            {sandbox.dataQuality !== 'high' && (
              <DataQualityWarning
                dataQuality={sandbox.dataQuality}
                warnings={sandbox.warnings}
              />
            )}
            
            {/* Scenario Overview */}
            <ScenarioOverview
              tickerSnapshot={tickerSnapshot}
              baseValuation={baseValuation}
              scenarioValuation={scenarioValuation}
              selectedFrame={currentFrame}
            />
          </TabsContent>
          
          {/* Charts Tab */}
          <TabsContent value="charts" className="space-y-6">
            {/* Valuation Range */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Valuation Range Across Scenarios
              </h3>
              <div className="space-y-4">
                {SCENARIO_FRAMES.slice(1).map((frame) => {
                  const frameAssumptions = applyScenarioFrame(sandbox.assumptions, frame);
                  const frameVal = computeValuation(
                    frameAssumptions,
                    tickerSnapshot.netDebt,
                    tickerSnapshot.sharesOutstanding ?? undefined
                  );
                  const deltaPercent = baseValuation.enterpriseValue !== 0
                    ? ((frameVal.enterpriseValue - baseValuation.enterpriseValue) / baseValuation.enterpriseValue) * 100
                    : 0;
                  
                  return (
                    <div key={frame.id} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {frame.name}
                        </span>
                        <span className={`text-sm font-bold ${deltaPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {deltaPercent > 0 ? '+' : ''}{deltaPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.min(Math.abs(deltaPercent) * 2, 100)}%`,
                            backgroundColor: frame.color,
                            marginLeft: deltaPercent < 0 ? `${Math.max(100 - Math.abs(deltaPercent) * 2, 0)}%` : '0',
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700 dark:text-gray-300">
                          {formatValueOrDash(frameVal.enterpriseValue, formatCurrency)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Revenue & FCF Projection */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Revenue & FCF Projection
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projectionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(val) => formatValueOrDash(val, (v) => `$${(v / 1e9).toFixed(1)}B`)} />
                    <Tooltip formatter={(val: any) => formatValueOrDash(val, (v) => `$${(v / 1e9).toFixed(2)}B`)} />
                    <Legend />
                    <Line type="monotone" dataKey="baseRevenue" stroke="#3b82f6" name="Base Revenue" strokeWidth={2} />
                    <Line type="monotone" dataKey="scenarioRevenue" stroke="#8b5cf6" name="Scenario Revenue" strokeWidth={2} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="baseFcf" stroke="#10b981" name="Base FCF" strokeWidth={2} />
                    <Line type="monotone" dataKey="scenarioFcf" stroke="#f59e0b" name="Scenario FCF" strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Driver Attribution */}
            {attribution && (
              <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
                <DriverAttributionChart attribution={attribution} />
              </div>
            )}
          </TabsContent>
          
          {/* Details Tab */}
          <TabsContent value="details" className="space-y-6">
            {/* Full Valuation Breakdown */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
              <ValuationOutcome
                baseValuation={baseValuation}
                scenarioValuation={scenarioValuation}
                scenarioName={currentFrame.name}
                scenarioColor={currentFrame.color}
                compact={false}
              />
            </div>
            
            {/* Scenario Explanation */}
            {explanation && (
              <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
                <ScenarioExplanation
                  {...explanation}
                  aiSummary={aiSummary}
                  aiConfidence={aiConfidence}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function prepareProjectionChartData(baseAssumptions: BaseAssumptions, selectedFrame: ScenarioFrameType) {
  const frame = getScenarioFrame(selectedFrame);
  if (!frame) return [];
  
  const scenarioAssumptions = applyScenarioFrame(baseAssumptions, frame);
  
  const baseSeries = projectTimeSeries(baseAssumptions, 10);
  const scenarioSeries = projectTimeSeries(scenarioAssumptions, 10);
  
  return baseSeries.map((base, idx) => ({
    year: base.year,
    baseRevenue: base.revenue,
    baseFcf: base.fcf,
    scenarioRevenue: scenarioSeries[idx]?.revenue || 0,
    scenarioFcf: scenarioSeries[idx]?.fcf || 0,
  }));
}

function normalizeTickerSymbol(value: unknown): string {
  if (typeof value === 'string') {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9.-]/g, '').trim();
    if (normalized === 'OBJECTOBJECT') return '';
    return normalized;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { ticker?: unknown; symbol?: unknown }).ticker
      ?? (value as { ticker?: unknown; symbol?: unknown }).symbol;
    return normalizeTickerSymbol(candidate);
  }

  return '';
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDemoCompanies(rawCompanies: unknown): DemoCompany[] {
  if (!Array.isArray(rawCompanies)) return [];

  const seen = new Set<string>();
  const normalized: DemoCompany[] = [];

  for (const rawCompany of rawCompanies) {
    if (!rawCompany || typeof rawCompany !== 'object') continue;
    const company = rawCompany as {
      ticker?: unknown;
      symbol?: unknown;
      company_name?: unknown;
      companyName?: unknown;
      name?: unknown;
      sector?: unknown;
    };

    const ticker = normalizeTickerSymbol(company.ticker ?? company.symbol);
    if (!ticker || ticker === 'OBJECTOBJECT' || seen.has(ticker)) continue;

    seen.add(ticker);
    normalized.push({
      ticker,
      companyName: normalizeText(company.company_name ?? company.companyName ?? company.name),
      sector: normalizeText(company.sector),
    });
  }

  return normalized;
}
