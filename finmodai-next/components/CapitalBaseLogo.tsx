export function CapitalBaseLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--cb-green)]/50 bg-[var(--cb-green)]/10 text-lg font-semibold text-[var(--cb-green)]">
        CB
      </div>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-[0.5em] text-[var(--cb-text-muted)]">Capitalbase</p>
        <p className="text-base font-semibold tracking-wide text-[var(--cb-text-primary)]">
          Command <span className="text-[var(--cb-green)]">Center</span>
        </p>
      </div>
    </div>
  );
}

export function CapitalBaseIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--cb-green)]/40 bg-[var(--cb-green)]/10 text-lg font-semibold text-[var(--cb-green)]">
      CB
    </div>
  );
}
