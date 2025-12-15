import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function ScenarioPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <BackButton />
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-primary">Scenario Engine</p>
          <h1 className="text-3xl font-semibold text-secondary">Build bull, base, and bear cases</h1>
          <p className="text-sm text-muted-foreground">
            Configure revenue, margin, and capital structure swings for each case. Once scenarios are saved you can apply
            them to any financial model with a single click.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="scenario-name">Scenario Name</Label>
              <Input id="scenario-name" name="scenario-name" placeholder="FY25 Bull Case" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="scenario-ticker">Ticker</Label>
              <Input id="scenario-ticker" name="scenario-ticker" placeholder="AAPL" />
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <Label htmlFor="revenue-delta">Revenue Delta %</Label>
              <Input id="revenue-delta" name="revenue-delta" placeholder="+8%" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="margin-delta">EBITDA Margin Delta</Label>
              <Input id="margin-delta" name="margin-delta" placeholder="+120 bps" />
            </div>
            <div className="space-y-3">
              <Label htmlFor="multiple-assumption">Valuation Multiple</Label>
              <Input id="multiple-assumption" name="multiple-assumption" placeholder="11.0x" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <Label htmlFor="scenario-notes">Scenario Notes</Label>
            <Textarea
              id="scenario-notes"
              name="scenario-notes"
              placeholder="Describe macro drivers, pricing assumptions, and execution risks..."
            />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button>Create Scenario</Button>
            <Button variant="outline">Add to Model Queue</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-border bg-muted/40 p-6">
          <h2 className="text-lg font-semibold text-secondary">Saved Scenarios</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Recently added scenarios will appear here with links to send them directly into the DCF, LBO, and
            Three-Statement model templates.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {['Bull Case', 'Bear Case'].map((name) => (
              <div key={name} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-secondary">{name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue delta</p>
                <p className="text-sm text-secondary">+6% vs. base</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">Margin delta</p>
                <p className="text-sm text-secondary">+80 bps</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline">
                    Apply to Model
                  </Button>
                  <Button size="sm" variant="ghost">
                    Duplicate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

