/**
 * Applied Default Badge
 * 
 * Shows when a field value was applied from Settings.
 */

import type { AppliedDefault } from '@/lib/settings/schema';

interface AppliedDefaultBadgeProps {
  appliedDefault: AppliedDefault;
  className?: string;
}

export function AppliedDefaultBadge({ appliedDefault, className = '' }: AppliedDefaultBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--cb-green)]/10 px-2 py-0.5 text-xs font-medium text-[var(--cb-green)] ${className}`}
      title={`Applied from ${appliedDefault.source === 'settings' ? 'Settings' : 'System defaults'}`}
    >
      <span className="text-[var(--cb-green)]">⚙️</span>
      <span>From {appliedDefault.source === 'settings' ? 'Settings' : 'Defaults'}</span>
    </span>
  );
}

interface AppliedDefaultsListProps {
  appliedDefaults: AppliedDefault[];
  className?: string;
}

/**
 * Display a list of applied defaults
 */
export function AppliedDefaultsList({ appliedDefaults, className = '' }: AppliedDefaultsListProps) {
  if (appliedDefaults.length === 0) return null;

  return (
    <div className={`space-y-2 rounded-lg border border-[var(--cb-green)]/20 bg-[var(--cb-green)]/5 p-3 ${className}`}>
      <p className="text-xs font-semibold text-[var(--cb-text-primary)]">
        Applied Defaults ({appliedDefaults.length})
      </p>
      <ul className="space-y-1 text-xs text-[var(--cb-text-muted)]">
        {appliedDefaults.map((applied, idx) => (
          <li key={idx} className="flex items-center justify-between">
            <span className="font-mono">{applied.path}</span>
            <span className="text-[var(--cb-green)]">
              {typeof applied.value === 'number' 
                ? applied.value.toLocaleString() 
                : String(applied.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
