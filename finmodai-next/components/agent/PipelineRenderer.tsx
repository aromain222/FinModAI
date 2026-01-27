/**
 * Pipeline Output Renderer
 * 
 * Renders the structured output from the agent pipeline:
 * - Recommended models
 * - Assumptions
 * - Charts/Tables
 * - Next actions
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AgentPipelineOutput } from '@/lib/ai/pipelineSchema';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  BarChart3,
  Table,
  FileText,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';

type PipelineRendererProps = {
  output: AgentPipelineOutput;
  onBuildModel?: (modelType: string, prefill?: any) => void;
};

const intentColors: Record<AgentPipelineOutput['intent'], string> = {
  FORECAST: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  VALUATION: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  MERGER: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  OPERATING: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  SCENARIO: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  MARKET_BRIEF: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  MIXED: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

const confidenceColors: Record<AgentPipelineOutput['confidence'], string> = {
  Low: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  Medium: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  High: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

const modelTypeLabels: Record<string, string> = {
  DCF: 'DCF Valuation',
  COMPS: 'Comparable Companies',
  LBO: 'Leveraged Buyout',
  THREE_STATEMENT: '3-Statement Model',
  MERGER: 'Merger / M&A',
  OPERATING: 'Operating Model',
  SCENARIO_ENGINE: 'Scenario Engine',
};

export function PipelineRenderer({ output, onBuildModel }: PipelineRendererProps) {
  return (
    <div className="space-y-6">
      {/* Header: Intent & Confidence */}
      <div className="flex items-center gap-3">
        <Badge className={cn('text-xs px-3 py-1', intentColors[output.intent])}>
          {output.intent.replace('_', ' ')}
        </Badge>
        <Badge className={cn('text-xs px-3 py-1', confidenceColors[output.confidence])}>
          Confidence: {output.confidence}
        </Badge>
      </div>

      {/* Data Coverage & Warnings */}
      <div className="flex items-start gap-3">
        <Card className="flex-1 rounded-xl border border-white/5 bg-slate-950/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-white">Data Coverage</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={cn('rounded px-2 py-1', output.dataCoverage.price ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
              Price: {output.dataCoverage.price ? '✓' : '✗'}
            </div>
            <div className={cn('rounded px-2 py-1', output.dataCoverage.fundamentals ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
              Fundamentals: {output.dataCoverage.fundamentals ? '✓' : '✗'}
            </div>
            <div className={cn('rounded px-2 py-1', output.dataCoverage.news ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
              News: {output.dataCoverage.news ? '✓' : '✗'}
            </div>
            <div className={cn('rounded px-2 py-1', output.dataCoverage.macro ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-500')}>
              Macro: {output.dataCoverage.macro ? '✓' : '✗'}
            </div>
          </div>
        </Card>
        {output.warnings.length > 0 && (
          <Card className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-amber-300">Warnings</h3>
            </div>
            <ul className="space-y-1 text-xs text-amber-200/80">
              {output.warnings.map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Models to Create */}
      {output.modelsToCreate.length > 0 && (
        <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Models to Create</h3>
          </div>
          <div className="space-y-4">
            {output.modelsToCreate.map((model, idx) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs">
                        {modelTypeLabels[model.modelType] || model.modelType}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-1">{model.title}</h4>
                    <p className="text-sm text-slate-300 mb-3">{model.why}</p>
                    <div className="text-xs text-slate-400">
                      <div className="font-semibold mb-1">Inputs Needed:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {model.inputsNeeded.map((input, i) => (
                          <li key={i}>{input}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {onBuildModel && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onBuildModel(model.modelType, model.prefill)}
                      className="shrink-0"
                    >
                      Create {model.modelType.replace('_', ' ')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Assumptions */}
      {output.assumptions.length > 0 && (
        <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Key Assumptions</h3>
          </div>
          <div className="space-y-3">
            {output.assumptions.map((assumption, idx) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">{assumption.key}</span>
                  <span className="text-xs text-slate-400">=</span>
                  <span className="text-xs text-emerald-300">{assumption.value}</span>
                </div>
                <p className="text-xs text-slate-400">{assumption.rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Outputs: Charts, Tables, Actions */}
      {output.outputs.length > 0 && (
        <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Preview Outputs</h3>
          </div>
          <div className="space-y-4">
            {output.outputs.map((item, idx) => {
              if (item.kind === 'chart') {
                return (
                  <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-400" />
                      <span className="text-sm font-semibold text-slate-200">{item.spec.title}</span>
                      <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs ml-auto">
                        {item.spec.type}
                      </Badge>
                    </div>
                    <div className="h-32 rounded-lg bg-slate-900/50 flex items-center justify-center border border-white/5">
                      <span className="text-xs text-slate-500">
                        {item.spec.type === 'line' && '📈 Line Chart Preview'}
                        {item.spec.type === 'bar' && '📊 Bar Chart Preview'}
                        {item.spec.type === 'fan' && '📊 Fan Chart Preview'}
                        {item.spec.type === 'waterfall' && '🌊 Waterfall Chart Preview'}
                        {item.spec.type === 'tornado' && '🌪️ Tornado Chart Preview'}
                      </span>
                    </div>
                  </div>
                );
              }

              if (item.kind === 'table') {
                return (
                  <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Table className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-semibold text-slate-200">{item.spec.title}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5">
                            {item.spec.columns.map((col, i) => (
                              <th key={i} className="px-3 py-2 text-left text-slate-400 font-semibold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {item.spec.rows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-white/5">
                              {row.map((cell, j) => (
                                <td key={j} className="px-3 py-2 text-slate-300">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              if (item.kind === 'memo') {
                return (
                  <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-semibold text-slate-200">Memo</span>
                    </div>
                    <div className="space-y-4">
                      {item.spec.sections.map((section, sIdx) => (
                        <div key={sIdx}>
                          <h5 className="text-xs font-semibold text-slate-300 mb-2">{section.title}</h5>
                          <ul className="list-disc list-inside space-y-1 text-xs text-slate-400">
                            {section.bullets.map((bullet, bIdx) => (
                              <li key={bIdx}>{bullet}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

