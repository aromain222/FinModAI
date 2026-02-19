'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DownloadModelButton } from '@/components/models/DownloadButton';
import { NotesEditor } from '@/components/models/NotesEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, ArrowLeft, TrendingUp, Activity, DollarSign } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';
import { LoadingPanel } from '@/components/loading';
import { LOADING_TABS } from '@/lib/loadingCopy';

type Model = {
  id: string;
  ticker: string;
  model_type: string;
  status: string;
  notes?: string;
  created_at: string;
  file_name?: string;
};

export default function ModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const modelId = params?.modelId as string;

  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModel = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Import the function directly to avoid API route
      const { getModelById } = await import('@/lib/modelsRepo');
      const data = await getModelById(modelId);
      
      if (!data) {
        setError('Model not found');
        return;
      }
      
      setModel(data);
    } catch (err) {
      console.error('Failed to fetch model:', err);
      setError('Failed to load model details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (modelId) {
      fetchModel();
    }
  }, [modelId, fetchModel]);

  const modelDetailCopy = LOADING_TABS.modelDetail;

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <LoadingPanel
            title={modelDetailCopy.title}
            subtitle={modelDetailCopy.subtitle}
            steps={modelDetailCopy.steps}
            variant={modelDetailCopy.variant}
            showProgress={true}
          />
        </div>
      </main>
    );
  }

  if (error || !model) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Navigation */}
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/app">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/models">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Models
              </Link>
            </Button>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-lg font-semibold text-red-700">Model not found</p>
            <p className="mt-2 text-sm text-red-600">
              {error || `The model with ID "${modelId}" does not exist.`}
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/models">Back to Model Library</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Navigation */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Home
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/models">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Models
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{model.ticker}</p>
            <h1 className="text-3xl font-semibold text-secondary">{formatModelLabel(model.model_type)} Model</h1>
            <p className="text-sm text-muted-foreground">
              Created {new Date(model.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })} • Status: <span className="font-medium capitalize">{model.status}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadModelButton ticker={model.ticker} modelType={model.model_type} variant="default" />
            <Button asChild variant="outline" size="sm">
              <Link href={`/scenario-engine?ticker=${model.ticker}`}>Scenario Engine</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/analyst-chat?modelId=${model.id}`}>Analyst Chat</Link>
            </Button>
          </div>
        </div>

        {/* Model Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-green-600" />
                Valuation Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Enterprise Value</p>
                  <p className="text-lg font-semibold text-secondary">
                    {getPlaceholderValue(model.model_type, 'ev')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Equity Value</p>
                  <p className="text-lg font-semibold text-secondary">
                    {getPlaceholderValue(model.model_type, 'equity')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Price Target</p>
                  <p className="text-lg font-semibold text-green-600">
                    {getPlaceholderValue(model.model_type, 'price')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Key Drivers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Revenue Growth</p>
                  <p className="text-lg font-semibold text-secondary">
                    {getPlaceholderValue(model.model_type, 'growth')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">EBITDA Margin</p>
                  <p className="text-lg font-semibold text-secondary">
                    {getPlaceholderValue(model.model_type, 'margin')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">WACC</p>
                  <p className="text-lg font-semibold text-secondary">
                    {getPlaceholderValue(model.model_type, 'wacc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-purple-600" />
                Model Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Model Type</p>
                  <p className="text-lg font-semibold text-secondary">{formatModelLabel(model.model_type)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      model.status === 'completed'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : model.status === 'running'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {model.status}
                  </span>
                </div>
                {model.file_name && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">File Name</p>
                    <p className="text-sm font-medium text-secondary">{model.file_name}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Description Card */}
        <Card>
          <CardHeader>
            <CardTitle>Model Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{getModelDescription(model.model_type, model.ticker)}</p>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              <strong>💡 Tip:</strong> Use the Scenario Engine to run bull/bear cases and visualize sensitivity analysis.
              Open the Analyst Chat to ask questions about this model.
            </div>
          </CardContent>
        </Card>

        {/* Analyst Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Analyst Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NotesEditor modelId={model.id} initialValue={model.notes || null} />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={`/scenario-engine?ticker=${model.ticker}`}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Run Scenarios
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/analyst-chat?modelId=${model.id}`}>
              <Activity className="mr-2 h-4 w-4" />
              Ask Analyst
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/models/create?type=${model.model_type}`}>
              <Plus className="mr-2 h-4 w-4" />
              Create Similar Model
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function formatModelLabel(type: string) {
  switch (type) {
    case 'three-statement':
      return 'Three-Statement';
    case 'dcf':
      return 'DCF';
    case 'lbo':
      return 'LBO';
    case 'comps':
      return 'Comps';
    case 'scorecard':
      return 'Scorecard';
    default:
      return type;
  }
}

function getModelDescription(type: string, ticker: string) {
  switch (type) {
    case 'dcf':
      return `This DCF (Discounted Cash Flow) model for ${ticker} projects future free cash flows and discounts them to present value using WACC. It includes a terminal value calculation and provides an intrinsic equity value per share.`;
    case 'lbo':
      return `This LBO (Leveraged Buyout) model for ${ticker} analyzes returns to a financial sponsor using leverage. It includes sources & uses, debt paydown schedule, and calculates IRR and MOIC over the hold period.`;
    case 'comps':
      return `This Trading Comps model for ${ticker} compares valuation multiples (EV/Revenue, EV/EBITDA, P/E) against peer companies to determine relative valuation and identify potential mispricing.`;
    case 'three-statement':
      return `This Three-Statement model for ${ticker} integrates the Income Statement, Balance Sheet, and Cash Flow Statement with dynamic linking. It projects financials forward and maintains accounting consistency.`;
    case 'scorecard':
      return `This Fundamentals Scorecard for ${ticker} benchmarks core operating and balance-sheet ratios against sector medians using demo snapshots. It is deterministic, fast to compute, and designed for demo-safe relative context.`;
    default:
      return `Financial model for ${ticker} generated by ${APP_NAME}. Download the Excel workbook to view detailed calculations and assumptions.`;
  }
}

function getPlaceholderValue(type: string, metric: string) {
  // Generate consistent placeholder values based on model type
  const hash = type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  switch (metric) {
    case 'ev':
      return `$${(2.5 + (hash % 5) * 0.5).toFixed(1)}T`;
    case 'equity':
      return `$${(2.2 + (hash % 5) * 0.4).toFixed(1)}T`;
    case 'price':
      return `$${(150 + (hash % 50)).toFixed(2)}`;
    case 'growth':
      return `${(8 + (hash % 7)).toFixed(1)}%`;
    case 'margin':
      return `${(25 + (hash % 15)).toFixed(1)}%`;
    case 'wacc':
      return `${(9 + (hash % 3)).toFixed(1)}%`;
    default:
      return 'N/A';
  }
}

// Add missing import
import { Plus } from 'lucide-react';
