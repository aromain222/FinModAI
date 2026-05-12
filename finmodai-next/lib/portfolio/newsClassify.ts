export type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string | null;
  provider?: string;
};

export type LabelKey = 'Estimate' | 'Risk' | 'Positioning' | 'Multiple' | 'Watch';

export type ClassifiedNewsItem = NewsItem & {
  label: LabelKey;
  reason: string;
};

export const LABEL_STYLE: Record<LabelKey, { border: string; text: string; bg: string }> = {
  Estimate:    { border: 'border-amber-400/30',   text: 'text-amber-300',  bg: 'bg-amber-500/10' },
  Risk:        { border: 'border-rose-400/30',    text: 'text-rose-300',   bg: 'bg-rose-500/10' },
  Positioning: { border: 'border-blue-400/30',    text: 'text-blue-300',   bg: 'bg-blue-500/10' },
  Multiple:    { border: 'border-purple-400/30',  text: 'text-purple-300', bg: 'bg-purple-500/10' },
  Watch:       { border: 'border-[var(--cb-border)]', text: 'text-[var(--cb-text-muted)]', bg: '' },
};

const LABEL_PRIORITY: LabelKey[] = ['Estimate', 'Risk', 'Positioning', 'Multiple', 'Watch'];

export function classifyHeadline(item: NewsItem): ClassifiedNewsItem {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();

  let label: LabelKey;
  let reason: string;

  if (/\b(earnings|guidance|revenue|margin|bookings|orders|gmv|growth rate|forecast|outlook|estimate|beat|miss|consensus|eps|sales|shipments)\b/.test(text)) {
    label  = 'Estimate';
    reason = 'Changes to revenue, margin, or EPS guidance can re-rate the score.';
  } else if (/\b(regulat|antitrust|lawsuit|probe|investigation|ban|tariff|policy|labor ruling|court|fine|sec|ftc|doj|penalty|compliance)\b/.test(text)) {
    label  = 'Risk';
    reason = 'Regulatory or legal risk can compress the multiple before numbers change.';
  } else if (/\b(upgrade|downgrade|price target|overweight|underweight|stake|flows|etf|short interest|rotation|activist|fund|position|held|owns|bought|sold)\b/.test(text)) {
    label  = 'Positioning';
    reason = 'Fast-money flows and analyst re-ratings can move the stock independently of fundamentals.';
  } else if (/\b(valuation|multiple|p\/e|ev\/ebitda|moat|competition|market share|pricing power|competitive|disruptive|alternative|substitute)\b/.test(text)) {
    label  = 'Multiple';
    reason = 'Changes to competitive moat or pricing power can reset what the market pays for earnings.';
  } else {
    label  = 'Watch';
    reason = 'Monitor whether this develops into an estimate, multiple, or risk catalyst.';
  }

  return { ...item, label, reason };
}

export function sortByPriority(items: ClassifiedNewsItem[]): ClassifiedNewsItem[] {
  return [...items].sort(
    (a, b) => LABEL_PRIORITY.indexOf(a.label) - LABEL_PRIORITY.indexOf(b.label),
  );
}
