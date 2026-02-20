/**
 * Product-Grade Scenario Engine
 * 
 * Main component with tabbed interface (Overview, Charts, Details)
 */

'use client';

import { useState, useEffect } from 'react';
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

export function ProductScenarioEngine() {
  // State
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  const [tickerSnapshot, setTickerSnapshot] = useState<TickerSnapshot | null>(null);
  const [sandbox, setSandbox] = useState<AssumptionSandbox | null>(null);
  
  const [selectedFrame, setSelectedFrame] = useState<ScenarioFrameType>('base');
  const [baseValuation, setBaseValuation] = useState<ValuationResult | null>(null);
  const [scenarioValuation, setScenarioValuation] = useState<ValuationResult | null>(null);
  const [attribution, setAttribution] = useState<WaterfallData | null>(null);
  const [explanation, setExplanation] = useState<any | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  
  // Handle ticker input
  const handleTickerSubmit = async () => {
    if (!ticker.trim()) {
      setError('Please enter a ticker');
      return;
    }
    
    setLoading(true);
    setError(null);
    setAiSummary('');
    
    try {
      // Fetch ticker data
      const snapshot = await fetchTickerSnapshot(ticker.trim().toUpperCase());
      setTickerSnapshot(snapshot);
      
      // Build assumption sandbox
      const newSandbox = buildAssumptionSandbox(ticker, snapshot);
      setSandbox(newSandbox);
      
      // Compute base case valuation
      const baseVal = computeValuation(
        newSandbox.assumptions,
        snapshot.netDebt,
        snapshot.sharesOutstanding ?? undefined
      );
      setBaseValuation(baseVal);
      
      // Reset scenario to base
      setSelectedFrame('base');
      setScenarioValuation(baseVal);
      
      // Switch to overview tab
      setActiveTab('overview');
      
    } catch (err: any) {
      setError(err.message || 'Failed to fetch ticker data');
      setTickerSnapshot(null);
      setSandbox(null);
      setBaseValuation(null);
      setScenarioValuation(null);
    } finally {
      setLoading(false);
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
    
    // Generate AI explanation (async, don't block)
    if (selectedFrame !== 'base') {
      generateAIExplanation(frame, scenarioAssumptions, baseValuation, scenarioVal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateAIExplanation intentionally not in deps
  }, [selectedFrame, sandbox, baseValuation, tickerSnapshot]);
  
  // Generate AI explanation
  const generateAIExplanation = async (
    frame: any,
    scenarioAssumptions: any,
    baseVal: ValuationResult,
    scenarioVal: ValuationResult
  ) => {
    if (!tickerSnapshot || !sandbox) return;
    
    const assumptionDeltas = Object.keys(sandbox.assumptions)
      .filter(key => {
        const baseValue = (sandbox.assumptions as any)[key];
        const scenarioValue = (scenarioAssumptions as any)[key];
        return typeof baseValue === 'number' && typeof scenarioValue === 'number' && Math.abs(scenarioValue - baseValue) > 0.0001;
      })
      .map(key => ({
        field: key,
        baseValue: (sandbox.assumptions as any)[key],
        scenarioValue: (scenarioAssumptions as any)[key],
      }));
    
    const result = await generateAIScenarioExplanation(
      tickerSnapshot.ticker,
      baseVal,
      scenarioVal,
      frame.name,
      frame.description,
      assumptionDeltas,
      sandbox.dataQuality
    );
    
    if (result.aiSummary) {
      setAiSummary(result.aiSummary);
      setAiConfidence(result.confidence);
    }
  };
  
  // Prepare projection chart data
  const projectionChartData = baseValuation && scenarioValuation && sandbox
    ? prepareProjectionChartData(sandbox.assumptions, selectedFrame)
    : [];
  
  const currentFrame = getScenarioFrame(selectedFrame);
  
  return (
    <div className="space-y-6">
      {/* Ticker Input - Always visible */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Scenario Engine
        </h2>
        
        <div className="flex gap-3">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleTickerSubmit()}
            placeholder="Enter ticker (e.g., AAPL)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={handleTickerSubmit}
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
              onClick={handleTickerSubmit}
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
      </div>
      
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
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Select Scenario
                </h3>
                <ScenarioFrameSelector
                  selectedFrame={selectedFrame}
                  onSelectFrame={setSelectedFrame}
                />
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
