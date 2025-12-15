import { BackButton } from '@/components/BackButton';
import { ModelSummary } from '@/components/ModelSummary';
import { APP_NAME } from '@/lib/branding';

type ModelViewPageProps = {
  searchParams?: {
    type?: string;
    ticker?: string;
  };
};

const MODEL_NAME: Record<string, string> = {
  'three-statement': 'Three-Statement Model',
  dcf: 'Discounted Cash Flow',
  lbo: 'Leveraged Buyout',
  comps: 'Trading Comps'
};

export default function ModelViewPage({ searchParams }: ModelViewPageProps) {
  const modelType = typeof searchParams?.type === 'string' ? searchParams?.type : 'three-statement';
  const ticker = typeof searchParams?.ticker === 'string' ? searchParams?.ticker : undefined;
  const title = MODEL_NAME[modelType] ?? 'Financial Model';

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <BackButton />
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-cb-blue">{APP_NAME} Model Viewer</p>
          <h1 className="text-3xl font-semibold text-cb-ink">
            {ticker ? `${ticker.toUpperCase()} — ${title}` : title}
          </h1>
          <p className="text-sm text-cb-slate">
            The Excel file download has started automatically. Review the linked financial statements, valuation
            outputs, and cash flows below without leaving the browser.
          </p>
        </header>

        <ModelSummary modelType={modelType} ticker={ticker} />
      </div>
    </main>
  );
}
