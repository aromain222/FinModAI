"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { APP_NAME } from '@/lib/branding';

export default function NewScenarioPage() {
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('Scenario capture coming soon. For now, keep using the Scenario Engine in chat.');
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/scenarios"
          className="inline-flex items-center text-sm text-muted-foreground transition hover:text-secondary"
        >
          ← Back to Scenarios
        </Link>

        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-cb-blue">{APP_NAME}</p>
          <h1 className="text-3xl font-semibold text-cb-ink">New scenario</h1>
          <p className="text-sm text-cb-slate">
            Add macro drivers, KPI deltas, and valuation notes to reuse in future models.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Scenario name</Label>
            <Input
              id="scenario-name"
              name="scenario-name"
              placeholder="Base Case FY25"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario-ticker">Linked ticker (optional)</Label>
            <Input
              id="scenario-ticker"
              name="scenario-ticker"
              placeholder="MSFT"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario-notes">Notes</Label>
            <Textarea
              id="scenario-notes"
              name="scenario-notes"
              placeholder="Revenue CAGR, macro overlay, sensitivity callouts..."
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {notice && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notice}
            </div>
          )}
          <Button type="submit">Save scenario (coming soon)</Button>
        </form>
      </div>
    </main>
  );
}
