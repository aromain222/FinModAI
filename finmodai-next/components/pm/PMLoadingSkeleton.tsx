export function PMLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading PM dashboard">
      {/* Command center skeleton */}
      <div className="h-14 rounded-xl border border-[var(--cb-border)] bg-[var(--cb-surface)]" />

      {/* Two-col grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-[var(--cb-border)]" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-[var(--cb-border)]" />
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]" />
            ))}
          </div>
        </div>
      </div>

      {/* Full-width sections */}
      {[1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-24 rounded bg-[var(--cb-border)]" />
          <div className="h-40 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]" />
        </div>
      ))}
    </div>
  );
}
