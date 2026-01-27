'use client';

import { useMemo, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock } from 'lucide-react';
import { AgentOutputRenderer } from './AgentOutputRenderer';
import { PipelineRenderer } from './PipelineRenderer';
import { AgentOutputSchema, OutputTypeSchema, type AgentInput, type AgentOutput, type OutputType } from '@/lib/ai/schemas';
import { AgentPipelineOutputSchema, type AgentPipelineOutput } from '@/lib/ai/pipelineSchema';

type OutputTypeOption = OutputType | 'AUTO';

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

export function PromptBox(props: {
  context?: AgentInput['context'];
  defaultOutputType?: OutputTypeOption;
  showOutput?: boolean;
  onGenerated?: (output: AgentOutput, prompt: string) => void;
}) {
  const outputTypeOptions = useMemo(() => ['AUTO', ...OutputTypeSchema.options] as OutputTypeOption[], []);
  const showOutput = props.showOutput ?? true;

  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<OutputTypeOption>(props.defaultOutputType ?? 'AUTO');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [output, setOutput] = useState<AgentOutput | null>(null);
  const [pipelineOutput, setPipelineOutput] = useState<AgentPipelineOutput | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState<string>('');

  const onSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Enter a prompt.');
      return;
    }

    setLoading(true);
    setError('');
    setOutput(null);
    setSubmittedPrompt(trimmed);

    try {
      const body: AgentInput = {
        prompt: trimmed,
        outputType: outputType === 'AUTO' ? undefined : outputType,
        context: props.context,
      };

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(safeText(json?.message) || 'Request failed.');
        return;
      }

      const parsed = AgentOutputSchema.safeParse(json);
      if (!parsed.success) {
        setError('Agent returned invalid output.');
        return;
      }

      if (showOutput) setOutput(parsed.data);
      props.onGenerated?.(parsed.data, trimmed);
    } catch (e) {
      setError(safeText(e) || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const onRunPipeline = async () => {
    // Disabled - AI Agent coming soon
    setError('AI Agent is not yet available. This feature is coming soon.');
    return;

    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Enter a prompt.');
      return;
    }

    setLoading(true);
    setError('');
    setOutput(null);
    setSubmittedPrompt(trimmed);

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(safeText(json?.message) || 'Request failed.');
        return;
      }

      // Parse and validate pipeline output
      const parsed = AgentPipelineOutputSchema.safeParse(json);
      if (!parsed.success) {
        setError('Pipeline returned invalid output.');
        return;
      }

      setPipelineOutput(parsed.data);
    } catch (e) {
      setError(safeText(e) || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border border-white/10 bg-black/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">AI Output Agent</div>
            <div className="text-xs text-slate-400">Generate a structured JSON artifact for CapitalBase UI rendering.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={outputType}
              onChange={(e) => setOutputType(e.target.value as OutputTypeOption)}
              className="h-9 rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {outputTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'AUTO' ? 'Auto (infer type)' : opt}
                </option>
              ))}
            </select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" onClick={(e) => { e.preventDefault(); }} disabled={true} variant="default">
                      Run
                      <Badge variant="outline" className="ml-2 bg-slate-800/80 border-slate-600 text-slate-300">
                        Coming soon
                      </Badge>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI Agent is not yet available. This feature is coming soon.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" onClick={(e) => { e.preventDefault(); }} disabled={true} variant="outline">
                      Generate (Legacy)
                      <Badge variant="outline" className="ml-2 bg-slate-800/80 border-slate-600 text-slate-300">
                        Coming soon
                      </Badge>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI Agent is not yet available. This feature is coming soon.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Forecast Xbox sales in Q4"
              className="min-h-[120px]"
              disabled={true}
            />
            <div className="absolute top-2 right-2">
              <Badge variant="outline" className="bg-slate-800/80 border-slate-600 text-slate-300">
                Coming soon
              </Badge>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-slate-500">{prompt.trim().length} chars</div>
            <div className="flex items-center gap-2">
              {props.context?.ticker ? (
                <Badge variant="outline" className="border-white/10 text-slate-400 text-xs">
                  Ticker: {props.context.ticker}
                </Badge>
              ) : null}
              {props.context?.company ? (
                <Badge variant="outline" className="border-white/10 text-slate-400 text-xs">
                  Company: {props.context.company}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </Card>

      {showOutput && pipelineOutput ? (
        <PipelineRenderer
          output={pipelineOutput}
          onBuildModel={(modelType, prefill) => {
            // Navigate to model creation with pre-filled type and data
            const params = new URLSearchParams({ type: modelType.toLowerCase() });
            if (prefill && Object.keys(prefill).length > 0) {
              params.set('prefill', JSON.stringify(prefill));
            }
            window.location.href = `/models/create?${params.toString()}`;
          }}
        />
      ) : null}

      {showOutput && output && !pipelineOutput ? (
        <AgentOutputRenderer
          output={output}
          originalPrompt={submittedPrompt}
          context={props.context}
          onResolved={(next) => {
            setOutput(next);
            props.onGenerated?.(next, submittedPrompt);
          }}
        />
      ) : null}
    </div>
  );
}
