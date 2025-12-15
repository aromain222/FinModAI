'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MacroSnapshot } from '@/lib/macroService';

type MacroInsightPanelProps = {
  snapshot: MacroSnapshot;
};

export function MacroInsightPanel({ snapshot }: MacroInsightPanelProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAskAi = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/macro-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      if (!response.ok) throw new Error('Macro AI failed');
      const payload = await response.json();
      setAnalysis(payload.analysis);
    } catch (err) {
      console.error(err);
      setError('Unable to generate commentary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>AI implications</CardTitle>
        <Button type="button" size="sm" onClick={handleAskAi} disabled={loading}>
          {loading ? 'Thinking…' : 'Ask AI'}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {analysis ? (
          <div className="prose prose-sm text-secondary" dangerouslySetInnerHTML={{ __html: formatMarkdown(analysis) }} />
        ) : (
          <p className="text-sm text-muted-foreground">Generate commentary to see how this macro tape affects valuations.</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatMarkdown(text: string) {
  return text.replace(/\n/g, '<br />');
}
