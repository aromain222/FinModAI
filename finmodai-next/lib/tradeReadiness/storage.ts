export type TradeReadinessStatus =
  | 'watch'
  | 'work-up'
  | 'paper-track'
  | 'queued'
  | 'ready';

export type TRStateConfig = {
  status:      TradeReadinessStatus;
  label:       string;
  description: string;
  textCls:     string;
  borderCls:   string;
  accentCls:   string;
};

export const TR_STATES: TRStateConfig[] = [
  {
    status:      'watch',
    label:       'Watch',
    description: 'On watchlist — monitoring, no action yet',
    textCls:     'text-[var(--cb-text-muted)]',
    borderCls:   'border-[var(--cb-border)]',
    accentCls:   'border-[var(--cb-border)]',
  },
  {
    status:      'work-up',
    label:       'Work up',
    description: 'Interesting setup — research phase, not sized',
    textCls:     'text-amber-300',
    borderCls:   'border-amber-400/30 bg-amber-500/8',
    accentCls:   'border-amber-400',
  },
  {
    status:      'paper-track',
    label:       'Paper Track',
    description: 'Tracking without capital — observing in real time',
    textCls:     'text-blue-300',
    borderCls:   'border-blue-400/30 bg-blue-500/8',
    accentCls:   'border-blue-400',
  },
  {
    status:      'queued',
    label:       'In Queue',
    description: 'Pitch queue — ready for team discussion',
    textCls:     'text-purple-300',
    borderCls:   'border-purple-400/30 bg-purple-500/8',
    accentCls:   'border-purple-400',
  },
  {
    status:      'ready',
    label:       'Ready',
    description: 'Thesis confirmed — ready to size the position',
    textCls:     'text-emerald-400',
    borderCls:   'border-emerald-400/30 bg-emerald-500/8',
    accentCls:   'border-emerald-400',
  },
];

const KEY_PREFIX = 'capitalbase:tr:';

function canUseStorage(): boolean {
  try {
    localStorage.setItem('__cb_tr__', '1');
    localStorage.removeItem('__cb_tr__');
    return true;
  } catch {
    return false;
  }
}

const VALID = new Set<string>(TR_STATES.map(s => s.status));

export function getTRState(ticker: string): TradeReadinessStatus | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${ticker.toUpperCase()}`);
    return raw && VALID.has(raw) ? (raw as TradeReadinessStatus) : null;
  } catch {
    return null;
  }
}

export function setTRState(ticker: string, status: TradeReadinessStatus): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${ticker.toUpperCase()}`, status);
  } catch { /* quota exceeded */ }
}

export function defaultTRState(computed: { label: string }): TradeReadinessStatus {
  if (computed.label === 'Ready')            return 'ready';
  if (computed.label === 'Work up')          return 'work-up';
  return 'watch';
}

export function nextTRState(current: TradeReadinessStatus): TradeReadinessStatus {
  const idx = TR_STATES.findIndex(s => s.status === current);
  return TR_STATES[(idx + 1) % TR_STATES.length]?.status ?? 'watch';
}
