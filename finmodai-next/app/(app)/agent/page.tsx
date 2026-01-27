'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PipelineRenderer } from '@/components/agent/PipelineRenderer';
import { ForecastRenderer } from '@/components/agent/ForecastRenderer';
import { AgentPipelineOutputSchema, type AgentPipelineOutput } from '@/lib/ai/pipelineSchema';
import type {
  ForecastAgentForecastResult,
  ForecastAgentRequestData,
  ForecastAgentResponse,
} from '@/lib/agent/forecast/types';
import { cn } from '@/lib/utils';
import { Loader2, Play, AlertCircle, Bug, X, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const AGENT_DRAFT_KEY = 'agentDraft';

/**
 * Map model type from pipeline to URL-friendly type
 */
function mapModelTypeToUrl(modelType: string): string {
  const mapping: Record<string, string> = {
    DCF: 'dcf',
    COMPS: 'comps',
    LBO: 'lbo',
    THREE_STATEMENT: 'three-statement',
    MERGER: 'merger',
    OPERATING: 'operating',
    SCENARIO_ENGINE: 'scenario',
  };
  return mapping[modelType] || modelType.toLowerCase();
}

/**
 * Store agent draft in localStorage
 */
function storeAgentDraft(output: AgentPipelineOutput, prompt: string) {
  try {
    const draft = {
      output,
      prompt,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(AGENT_DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('[Agent] Failed to store draft:', error);
  }
}

/**
 * Handle model creation button click
 */
function handleCreateModel(
  modelType: string,
  prefill: any,
  output: AgentPipelineOutput,
  prompt: string,
  router: ReturnType<typeof useRouter>
) {
  // Store full agent response as draft
  storeAgentDraft(output, prompt);

  // Build URL with type and ticker (if available)
  const urlType = mapModelTypeToUrl(modelType);
  const params = new URLSearchParams({ type: urlType });

  // Extract ticker from prefill if available
  if (prefill?.ticker) {
    params.set('ticker', prefill.ticker);
  } else if (prefill?.buyerTicker) {
    params.set('ticker', prefill.buyerTicker);
  }

  // Store prefill data in localStorage for the builder page to read
  if (prefill && Object.keys(prefill).length > 0) {
    try {
      localStorage.setItem(`modelPrefill_${urlType}`, JSON.stringify(prefill));
    } catch (error) {
      console.warn('[Agent] Failed to store prefill:', error);
    }
  }

  // Navigate to model creation page
  router.push(`/models/create?${params.toString()}`);
}

type AgentResponse = 
  | { traceId: string; status: 'ok'; result: AgentPipelineOutput }
  | { traceId: string; status: 'error'; error: { code: string; message: string; details?: any } };

export default function AgentPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [output, setOutput] = useState<AgentPipelineOutput | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastAgentForecastResult | null>(null);
  const [forecastRequest, setForecastRequest] = useState<ForecastAgentRequestData | null>(null);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [debugDrawerOpen, setDebugDrawerOpen] = useState(false);

  const checkHealth = async () => {
    setHealthError(null);
    try {
      const res = await fetch('/api/agent/health');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setHealthError(json?.message || `Agent health check failed (HTTP ${res.status})`);
      }
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : 'Agent health check failed');
    }
  };

  // Disable health check - AI Agent is coming soon
  // useEffect(() => {
  //   void checkHealth();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  const handleRun = async () => {
    // AI Agent is disabled - coming soon
    setError('AI Agent is not yet available. This feature is coming soon.');
    return;

    // Detect if this is a forecast request
    const isForecastRequest = /forecast|project|next \d+ years|cagr|price target/i.test(trimmed);
    const detectedTicker = trimmed.match(/\b([A-Z]{1,5})\b/)?.[1];
    
    console.log('[Agent:Client] Starting request', { 
      promptLength: trimmed.length,
      isForecastRequest,
      detectedTicker,
    });

    try {
      // Use forecast agent for forecast requests
      const endpoint = isForecastRequest ? '/api/agent/forecast' : '/api/agent/run';
      const body = isForecastRequest
        ? JSON.stringify({
            userRequest: trimmed,
            ticker: detectedTicker,
            horizonYears: 4,
          })
        : JSON.stringify({ prompt: trimmed });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      // Always try to parse JSON, even on error
      let json: any = null;
      try {
        json = await res.json();
        setLastResponse(json);
        console.log('[Agent:Client] Response received', { 
          status: res.status, 
          ok: res.ok,
          traceId: json?.traceId,
          responseStatus: json?.status,
        });
      } catch (parseError) {
        console.error('[Agent:Client] Failed to parse JSON', parseError);
        setError(`Failed to parse response. Status: ${res.status}`);
        setLastResponse({ error: 'Failed to parse JSON', status: res.status });
        return;
      }

      if (!json) {
        setError('Received empty response');
        return;
      }

      // Store traceId for debugging
      if (json.traceId) {
        setLastTraceId(json.traceId);
      }

      // Handle error response
      if (json.status === 'error' || !res.ok) {
        if (res.status === 401 || json?.error?.code === 'unauthorized') {
          setNeedsAuth(true);
        }
        const errorMsg = json.status === 'error' 
          ? `${(json as Extract<AgentResponse, { status: 'error' }>).error.message} (${(json as Extract<AgentResponse, { status: 'error' }>).error.code})`
          : (json as any).error?.message || 'Request failed';
        const traceIdMsg = json.traceId ? ` Trace ID: ${json.traceId}` : '';
        setError(`${errorMsg}${traceIdMsg}`);
        console.error('[Agent:Client] Error response', json);
        return;
      }

      // Handle success response
      if (json.status === 'ok' && json.result) {
        if (isForecastRequest) {
          try {
            const forecastResponse = json as unknown as ForecastAgentResponse;

            const first = forecastResponse.result;
            if (!first || !('action' in first)) {
              setError(`Forecast agent returned no result. Trace ID: ${forecastResponse.traceId || 'unknown'}`);
              return;
            }

            if (first.action === 'REQUEST_DATA') {
              setForecastRequest(first as ForecastAgentRequestData);

              // Step 2: ask server to fetch data and run
              const res2 = await fetch('/api/agent/forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userRequest: trimmed,
                  ticker: detectedTicker,
                  horizonYears: 4,
                  mode: 'run',
                  required: (first as ForecastAgentRequestData).required,
                }),
              });

              const json2 = await res2.json();
              setLastResponse(json2);
              if (json2?.traceId) setLastTraceId(json2.traceId);

              if (!res2.ok || json2?.status === 'error') {
                const errorMsg = json2?.error?.message || 'Forecast step 2 failed';
                const traceIdMsg = json2?.traceId ? ` Trace ID: ${json2.traceId}` : '';
                setError(`${errorMsg}${traceIdMsg}`);
                return;
              }

              const second = (json2 as ForecastAgentResponse).result;
              if (second && second.action === 'FORECAST_RESULT') {
                setForecastResult(second as ForecastAgentForecastResult);
              } else {
                setError(`Forecast step 2 returned unexpected output. Trace ID: ${json2?.traceId || 'unknown'}`);
              }
              return;
            }

            if (first.action === 'FORECAST_RESULT') {
              setForecastResult(first as ForecastAgentForecastResult);
              return;
            }

            setError(`Forecast agent returned unknown action. Trace ID: ${forecastResponse.traceId || 'unknown'}`);
          } catch (e) {
            setError(`Failed to parse forecast response. Trace ID: ${json.traceId || 'unknown'}`);
            console.error('[Agent:Client] Forecast parse error', e);
          }
        } else {
          // Regular pipeline agent response
          const parsed = AgentPipelineOutputSchema.safeParse(json.result);
          if (!parsed.success) {
            const validationError = `Agent returned invalid output structure. Trace ID: ${json.traceId}`;
            setError(validationError);
            console.error('[Agent:Client] Validation failed', { 
              traceId: json.traceId,
              errors: parsed.error.errors,
            });
            return;
          }

          console.log('[Agent:Client] Success', {
            traceId: json.traceId,
            intent: parsed.data.intent,
            modelsCount: parsed.data.modelsToCreate.length,
            outputsCount: parsed.data.outputs.length,
          });

          setOutput(parsed.data);
        }
      } else {
        setError(`Unexpected response format. Trace ID: ${json.traceId || 'unknown'}`);
        console.error('[Agent:Client] Unexpected response', json);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Request failed';
      setError(`${errorMsg}${lastTraceId ? ` (Trace ID: ${lastTraceId})` : ''}`);
      console.error('[Agent:Client] Request exception', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBuildModel = (modelType: string, prefill?: any) => {
    if (!output) return;
    handleCreateModel(modelType, prefill, output, prompt, router);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="AI Agent"
        subtitle="Describe what you want to analyze, and the Agent will recommend models, assumptions, and outputs."
        showBack={false}
      />

      {/* Coming Soon Callout */}
      <Card className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5">
            <Clock className="h-6 w-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-amber-200 mb-2">AI Agent Coming Soon</h3>
            <p className="text-sm text-amber-300/90 mb-3">
              Our AI Agent feature is currently in development. This will allow you to generate financial forecasts, 
              sensitivity analyses, and custom models using natural language prompts.
            </p>
            <p className="text-xs text-amber-300/70">
              Stay tuned for updates! In the meantime, you can use our model builders to create custom financial models manually.
            </p>
          </div>
        </div>
      </Card>

      {/* Prompt Input - Disabled */}
      <Card className="rounded-2xl border border-white/5 bg-slate-950/40 p-6 backdrop-blur-sm opacity-50 pointer-events-none relative">
        <div className="space-y-4">
          <div>
            <label htmlFor="agent-prompt" className="block text-sm font-semibold text-white mb-2">
              What would you like to analyze?
            </label>
            <div className="relative">
              <Textarea
                id="agent-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Forecast AAPL revenue for the next 4 years with sensitivity analysis"
                className="min-h-[120px] resize-none"
                disabled={true}
                onKeyDown={(e) => {
                  // Prevent any submission
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                  }
                }}
              />
              <div className="absolute top-2 right-2">
                <Badge variant="outline" className="bg-slate-800/80 border-slate-600 text-slate-300">
                  Coming soon
                </Badge>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Press Cmd/Ctrl + Enter to run
              </p>
              <p className="text-xs text-slate-500">
                {prompt.length} characters
              </p>
            </div>
          </div>

          {/* Error messages hidden when disabled - no API calls possible */}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block w-full sm:w-auto">
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      // Prevent any requests
                    }}
                    disabled={true}
                    className="w-full sm:w-auto"
                    size="lg"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Run Agent
                    <Badge variant="outline" className="ml-2 bg-slate-800/80 border-slate-600 text-slate-300">
                      Coming soon
                    </Badge>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI Agent is not yet available. We're working on bringing this feature to you soon.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Card>

      {/* Debug Drawer - Hidden when disabled (no API calls possible) */}

      {/* Results - Hidden when disabled */}
      {false && forecastResult && (
        <div className="space-y-6">
          <ForecastRenderer
            result={forecastResult}
            onBuildModel={(modelType) => {
              // Navigate to model creation with prefill
              const urlType = modelType === 'OPERATING' ? 'operating' : modelType === 'DCF' ? 'dcf' : 'comps';
              const params = new URLSearchParams({ type: urlType });
              if (forecastResult.ticker) {
                params.set('ticker', forecastResult.ticker);
              }
              router.push(`/models/create?${params.toString()}`);
            }}
          />
        </div>
      )}

      {false && output && !forecastResult && (
        <div className="space-y-6">
          <PipelineRenderer
            output={output}
            onBuildModel={handleBuildModel}
          />
        </div>
      )}

      {/* Coming Soon State - Always shown when disabled */}
      <Card className="rounded-2xl border border-white/5 bg-slate-950/60 p-12 backdrop-blur-sm">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">AI Agent Coming Soon</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              This feature is in active development. Once available, you'll be able to generate financial models, 
              forecasts, and analyses using natural language prompts.
            </p>
          </div>
          <div className="pt-4">
            <Button
              variant="outline"
              onClick={() => router.push('/models/create')}
              className="border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60"
            >
              Use Model Builders Instead
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
