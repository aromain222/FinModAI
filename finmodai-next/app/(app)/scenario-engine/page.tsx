'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScenarioEngineShell } from '@/components/scenario-engine/ScenarioEngineShell';
import { CompanyPicker } from '@/components/company/CompanyPicker';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

// Company name mapping (can be extended or moved to a shared file)
const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  NVDA: 'NVIDIA Corporation',
  AMZN: 'Amazon.com Inc.',
  GOOGL: 'Alphabet Inc.',
  SPY: 'S&P 500 ETF',
  TSLA: 'Tesla Inc.',
  META: 'Meta Platforms Inc.',
  NFLX: 'Netflix Inc.',
  DIS: 'The Walt Disney Company',
};

function getCompanyName(ticker: string): string {
  return COMPANY_NAMES[ticker.toUpperCase()] || ticker;
}

export default function ScenarioEnginePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Read company from URL query param
  const companyParam = searchParams.get('company');
  const ticker = companyParam?.toUpperCase();
  
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we need to show the picker on mount
  useEffect(() => {
    if (!ticker) {
      setShowPicker(true);
    } else {
      setShowPicker(false);
      setError(null);
    }
  }, [ticker]);

  // Persist last selected company to localStorage
  useEffect(() => {
    if (ticker) {
      try {
        localStorage.setItem('finmodai:lastCompany', ticker);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [ticker]);

  const handleCompanySelect = (selectedTicker: string) => {
    const upperTicker = selectedTicker.toUpperCase();
    
    // Update URL with selected company
    const params = new URLSearchParams(searchParams.toString());
    params.set('company', upperTicker);
    
    // Use replace to update URL without adding to history stack
    router.replace(`/scenario-engine?${params.toString()}`, { scroll: false });
    
    setShowPicker(false);
    setError(null);
  };

  const handleChangeCompany = () => {
    setShowPicker(true);
  };

  // Show company picker gate if no company selected
  if (!ticker || showPicker) {
    return (
      <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
        <div className="mx-auto max-w-6xl space-y-8">
          <PageHeader
            title="Scenario Engine"
            subtitle="Stress test downside/base/upside cases across revenue, margins, multiples, and leverage."
            backHref="/models/create"
          />
          
          <div className="flex min-h-[60vh] items-center justify-center">
            <CompanyPicker
              onSelect={handleCompanySelect}
              initialValue={ticker || ''}
              error={error}
            />
          </div>
        </div>
      </main>
    );
  }

  // Render Scenario Engine with selected company
  const companyName = getCompanyName(ticker);

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Scenario Engine"
            subtitle={
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="font-semibold text-[var(--cb-accent-text,rgb(56,189,248))]">
                  {ticker}
                </span>
                <span className="text-[var(--cb-text-muted,#9ca3af)]">·</span>
                <span>{companyName}</span>
              </div>
            }
            backHref="/models/create"
          />
          
          <Button
            onClick={handleChangeCompany}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Change company
          </Button>
        </div>
        
        <ScenarioEngineShell 
          key={ticker} 
          companyName={companyName} 
          ticker={ticker} 
        />
      </div>
    </main>
  );
}
