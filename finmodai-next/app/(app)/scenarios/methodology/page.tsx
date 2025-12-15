import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';

const points = [
  'Base Case tracks the user sliders exactly—no API data or consensus numbers override those values.',
  'Bull Case adds +200 bps to growth, +100 bps to margin, and uses the low end of the WACC range to reflect upside risk.',
  'Bear Case subtracts 200 bps of growth, 100 bps of margin, and applies the high end of the WACC range for conservative discounting.',
  'All dollar amounts are normalized to Millions of USD (M) before any model math runs so exports line up with Sheets.',
];

export default function ScenarioMethodologyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-cb-blue">{APP_NAME}</p>
            <h1 className="text-3xl font-semibold text-cb-ink">Scenario Methodology</h1>
            <p className="text-sm text-cb-slate">
              Base, Bull, and Bear cases always stay in sync with your slider inputs. All figures shown are in Millions of USD (M).
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/app">Back to Dashboard</Link>
          </Button>
        </div>

        <section className="space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-secondary">How We Build Your Scenarios</h2>
          <p className="text-sm text-muted-foreground">
            The preset buttons and scenario exports all rely on the same deterministic deltas so you can compare runs apples-to-apples. Every scenario starts from the exact slider-defined Base Case, then layers on the mandated adjustments.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-secondary">Base Case</h3>
          <p className="text-sm text-muted-foreground">
            The Base Case is literally your slider input: revenue growth, EBITDA margin, and WACC are copied into the modeling engine with no external overrides. When you tweak a slider while the Base preset is active, that becomes the new source of truth for all exports.
          </p>
          <p className="text-sm text-muted-foreground">
            Because the Base Case is already normalized to Millions (M), the football field, Sheets exports, and markdown output all display the same exact base valuation.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-secondary">Bull Case</h3>
          <p className="text-sm text-muted-foreground">
            Bull Case takes the Base slider values and applies +200 bps to growth, +100 bps to margin, and the low end of the WACC range. That combination reflects a moderate upside swing—not heroic forecasts, but a view that operating leverage and discount rates improve together.
          </p>
          <p className="text-sm text-muted-foreground">
            After applying the preset you can still fine-tune the sliders; {APP_NAME} will export whatever is on-screen so you can study sensitivities or export a custom “Bull Plus” variant.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-secondary">Bear Case</h3>
          <p className="text-sm text-muted-foreground">
            Bear Case moves the other direction: ‒200 bps of growth, ‒100 bps of margin, and the high end of the WACC range. It represents a conservative view of both execution and discount-rate pressure, which helps quantify downside before a diligence session or investment memo.
          </p>
          <p className="text-sm text-muted-foreground">
            Just like Bull, those deltas are applied on top of your Base Case override, ensuring the Bear scenario is a clean stress-test rather than a surprise from consensus data.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-secondary">Export & Transparency</h3>
          <p className="text-sm text-muted-foreground">
            Each scenario is labeled, stored, and ready for export to Google Sheets or Excel. Because every value is already in Millions (M), there is no unit reconciliation required when you paste into a football field or a presentation.
          </p>
          <p className="text-sm text-muted-foreground">
            Need more detail? Jump back to the Create Model screen and tap “Learn how scenarios are built” to re-open this guide, or load a saved scenario from the Scenario Engine to see the exact assumptions that were persisted to Supabase.
          </p>
        </section>
      </div>
    </main>
  );
}
