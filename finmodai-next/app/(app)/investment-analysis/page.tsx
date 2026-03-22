'use client';

import { useState, useTransition } from 'react';
import { InvestmentAnalysisWorkspace } from '@/components/investment-analysis/InvestmentAnalysisWorkspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { EventImpactCardProps } from '@/components/investment-analysis/EventImpactCard';
import type {
  InvestmentAnalysisDocument,
  InvestmentEventChartInput,
  InvestmentMemoSections,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';

const DEFAULT_PROMPT = 'Analyze Apple as an investment';

export default function InvestmentAnalysisPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [document, setDocument] = useState<InvestmentAnalysisDocument | null>(null);
  const [eventImpact, setEventImpact] = useState<EventImpactCardProps | null>(null);
  const [eventChartInput, setEventChartInput] = useState<InvestmentEventChartInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  const handleGenerate = () => {
    startGenerating(async () => {
      setError(null);
      setEventImpact(null);
      setEventChartInput(null);
      try {
        const response = await fetch('/api/investment-analysis/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt }),
        });
        const payload = (await response.json()) as {
          document?: InvestmentAnalysisDocument;
          eventImpact?: EventImpactCardProps | null;
          eventChartInput?: InvestmentEventChartInput | null;
          error?: string;
        };
        if (!response.ok || !payload.document) {
          throw new Error(payload.error ?? 'Failed to generate investment analysis.');
        }
        setDocument(payload.document);
        setEventImpact(payload.eventImpact ?? null);
        setEventChartInput(payload.eventChartInput ?? null);
      } catch (generationError) {
        setError(generationError instanceof Error ? generationError.message : 'Failed to generate investment analysis.');
      }
    });
  };

  const handleRefreshMemo = async (args: {
    document: InvestmentAnalysisDocument;
    activeScenario: InvestmentScenarioKey;
  }): Promise<InvestmentMemoSections> => {
    const response = await fetch('/api/investment-analysis/refresh-memo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const payload = (await response.json()) as InvestmentMemoSections & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to refresh memo.');
    }
    return payload;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Prompt entry stays lightweight. The actual work happens in the structured workspace below. */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
          <CardTitle>Investment Analysis</CardTitle>
          <CardDescription>
            Prompt into a structured investment workspace. Assumptions, valuation, charts, and memo stay tied to deterministic model data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Analyze Apple as an investment"
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleGenerate} disabled={isGenerating || prompt.trim().length === 0}>
              {isGenerating ? 'Generating…' : 'Generate Analysis'}
            </Button>
            {error ? <div className="text-sm text-red-500">{error}</div> : null}
          </div>
        </CardContent>
      </Card>

      {document ? (
        <InvestmentAnalysisWorkspace
          key={`${document.company.ticker}-${document.generatedAt}`}
          initialDocument={document}
          eventImpact={eventImpact ?? undefined}
          eventChartInput={eventChartInput ?? undefined}
          onRefreshMemo={handleRefreshMemo}
        />
      ) : null}
    </div>
  );
}
