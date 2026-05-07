import { cn } from '@/lib/utils';

export const CONVICTION_LEVELS = [
  'Low',
  'Low-Moderate',
  'Moderate',
  'Moderate-High',
  'High',
] as const;

export type ConvictionLevel = (typeof CONVICTION_LEVELS)[number];

export function parseConvictionLevel(content: string): ConvictionLevel | null {
  const match = content.match(
    /Conviction:\s*(Low-Moderate|Moderate-High|Low|Moderate|High)/,
  );
  return match ? (match[1] as ConvictionLevel) : null;
}

const SEGMENT_COLOR: Record<ConvictionLevel, string> = {
  Low:             'bg-rose-400',
  'Low-Moderate':  'bg-amber-400',
  Moderate:        'bg-yellow-300',
  'Moderate-High': 'bg-emerald-300',
  High:            'bg-emerald-400',
};

const LABEL_COLOR: Record<ConvictionLevel, string> = {
  Low:             'text-rose-400',
  'Low-Moderate':  'text-amber-400',
  Moderate:        'text-yellow-300',
  'Moderate-High': 'text-emerald-300',
  High:            'text-emerald-400',
};

type Props = { level: ConvictionLevel };

export function ConvictionMeter({ level }: Props) {
  const activeIdx = CONVICTION_LEVELS.indexOf(level);

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[9px] uppercase tracking-widest text-[var(--cb-text-muted)]">
        Conviction
      </span>
      <div className="flex flex-1 items-center gap-0.5">
        {CONVICTION_LEVELS.map((l, i) => (
          <div
            key={l}
            title={l}
            className={cn(
              'h-2.5 flex-1 rounded-sm transition-all duration-300',
              i <= activeIdx ? SEGMENT_COLOR[level] : 'bg-white/10',
              i === activeIdx && 'ring-1 ring-white/25',
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          'shrink-0 text-[10px] font-semibold tabular-nums',
          LABEL_COLOR[level],
        )}
      >
        {level}
      </span>
    </div>
  );
}
