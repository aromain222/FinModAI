'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LoadingInline, ErrorState } from '@/components/loading';
import { LOADING_SECTIONS, getEmptyError } from '@/lib/loadingCopy';

interface MarketBrief {
  summary: string;
  keyTakeaways: string[];
  outlook: 'bullish' | 'bearish' | 'neutral';
  risks: string[];
  sectorImplications?: string[];
  timestamp: string;
}

export function MarketBrief() {
  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/macro/brief');
      if (!response.ok) throw new Error('Failed to fetch brief');
      
      const data = await response.json();
      setBrief(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load market brief');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrief();
    
    // Auto-refresh every hour
    const interval = setInterval(fetchBrief, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getOutlookIcon = () => {
    switch (brief?.outlook) {
      case 'bullish': return <TrendingUp className="h-4 w-4" />;
      case 'bearish': return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  const getOutlookColor = () => {
    switch (brief?.outlook) {
      case 'bullish': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'bearish': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    }
  };

  const sectionCopy = LOADING_SECTIONS.newsFeed;
  const emptyError = getEmptyError('marketBrief');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Brief</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingInline
            label={sectionCopy.label}
            steps={sectionCopy.steps}
            skeleton="card"
            compact
          />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Brief</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState
            title={emptyError.errorTitle('market brief')}
            onRetry={fetchBrief}
            retryLabel={emptyError.retryLabel}
          />
        </CardContent>
      </Card>
    );
  }

  if (!brief) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Market Brief</CardTitle>
          <CardDescription>
            AI-powered analysis of current market conditions
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getOutlookColor()}>
            {getOutlookIcon()}
            <span className="ml-1 capitalize">{brief.outlook}</span>
          </Badge>
          <Button onClick={fetchBrief} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold mb-2">Summary</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {brief.summary}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Key Takeaways</h4>
          <ul className="space-y-1">
            {brief.keyTakeaways.map((takeaway, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start">
                <span className="mr-2">•</span>
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Risks to Monitor</h4>
          <ul className="space-y-1">
            {brief.risks.map((risk, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start">
                <span className="mr-2">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>

        {brief.sectorImplications && brief.sectorImplications.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Sector Implications</h4>
            <ul className="space-y-1">
              {brief.sectorImplications.map((implication, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start">
                  <span className="mr-2">•</span>
                  <span>{implication}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          Last updated: {new Date(brief.timestamp).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
