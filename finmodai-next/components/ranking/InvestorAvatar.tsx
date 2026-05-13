'use client';

import { cn } from '@/lib/utils';

export type InvestorMeta = {
  initials: string;
  gradient: string;
  style: string;
  textColor?: string;
};

export const INVESTOR_META: Record<string, InvestorMeta> = {
  'Warren Buffett':        { initials: 'WB', gradient: 'from-amber-500 to-orange-700',    style: 'Value Oracle',     textColor: '#fff' },
  'Ben Graham':            { initials: 'BG', gradient: 'from-slate-400 to-slate-700',     style: 'Father of Value',  textColor: '#fff' },
  'Charlie Munger':        { initials: 'CM', gradient: 'from-yellow-600 to-amber-800',    style: 'Mental Models',    textColor: '#fff' },
  'Peter Lynch':           { initials: 'PL', gradient: 'from-green-500 to-emerald-700',   style: 'Growth at Value',  textColor: '#fff' },
  'Nassim Taleb':          { initials: 'NT', gradient: 'from-zinc-500 to-zinc-800',       style: 'Anti-fragile',     textColor: '#fff' },
  'Michael Burry':         { initials: 'MB', gradient: 'from-red-600 to-rose-800',        style: 'Big Short',        textColor: '#fff' },
  'Cathie Wood':           { initials: 'CW', gradient: 'from-sky-400 to-blue-600',        style: 'Disruptive Tech',  textColor: '#fff' },
  'Aswath Damodaran':      { initials: 'AD', gradient: 'from-violet-500 to-purple-700',   style: 'Valuation Prof',   textColor: '#fff' },
  'Stanley Druckenmiller': { initials: 'SD', gradient: 'from-teal-500 to-cyan-700',       style: 'Macro Legend',     textColor: '#fff' },
  'George Soros':          { initials: 'GS', gradient: 'from-indigo-500 to-blue-700',     style: 'Global Macro',     textColor: '#fff' },
  'Ray Dalio':             { initials: 'RD', gradient: 'from-cyan-500 to-teal-700',       style: 'All Weather',      textColor: '#fff' },
  'Howard Marks':          { initials: 'HM', gradient: 'from-blue-500 to-indigo-700',     style: 'Risk Cycles',      textColor: '#fff' },
  'Technical Analyst':     { initials: 'TA', gradient: 'from-indigo-400 to-blue-600',     style: 'Charts & Tape',    textColor: '#fff' },
  'Valuation Analyst':     { initials: 'VA', gradient: 'from-violet-400 to-purple-600',   style: 'DCF Models',       textColor: '#fff' },
  'Momentum Analyst':      { initials: 'MA', gradient: 'from-emerald-400 to-green-600',   style: 'Price Momentum',   textColor: '#fff' },
  'Risk Analyst':          { initials: 'RA', gradient: 'from-rose-400 to-red-600',        style: 'Tail Risk',        textColor: '#fff' },
  'Macro Analyst':         { initials: 'MC', gradient: 'from-teal-400 to-cyan-600',       style: 'Global Macro',     textColor: '#fff' },
};

function getInitials(name: string): string {
  const words = name.split(' ');
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getMeta(name: string): InvestorMeta {
  return INVESTOR_META[name] ?? {
    initials: getInitials(name),
    gradient: 'from-slate-500 to-slate-700',
    style: 'Analyst',
    textColor: '#fff',
  };
}

const SIGNAL_RING: Record<string, string> = {
  bullish: 'ring-2 ring-emerald-400/70 shadow-[0_0_8px_rgba(52,211,153,0.35)]',
  bearish: 'ring-2 ring-rose-400/70    shadow-[0_0_8px_rgba(251,113,133,0.35)]',
  neutral: 'ring-2 ring-amber-400/60   shadow-[0_0_8px_rgba(251,191,36,0.25)]',
};

type Props = {
  name: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
};

const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[8px]',
  sm: 'h-8 w-8 text-[9px]',
  md: 'h-10 w-10 text-[11px]',
  lg: 'h-12 w-12 text-xs',
};

export function InvestorAvatar({ name, signal, size = 'sm', pulse = false, className }: Props) {
  const meta = getMeta(name);
  return (
    <div
      title={`${name} · ${meta.style}`}
      className={cn(
        'shrink-0 rounded-full bg-gradient-to-br font-bold text-white flex items-center justify-center select-none transition-transform duration-200 hover:scale-110',
        SIZE_CLASSES[size],
        `${meta.gradient}`,
        signal && SIGNAL_RING[signal],
        pulse && 'animate-pulse',
        className,
      )}
    >
      {meta.initials}
    </div>
  );
}

export function InvestorAvatarStack({ names, signal, max = 5 }: { names: string[]; signal?: 'bullish' | 'bearish' | 'neutral'; max?: number }) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((name, i) => (
        <InvestorAvatar
          key={name}
          name={name}
          signal={signal}
          size="xs"
          className={cn('ring-1 ring-[var(--cb-bg)]', i > 0 && '-ml-1.5')}
        />
      ))}
      {overflow > 0 && (
        <span className={cn(
          '-ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ring-1 ring-[var(--cb-bg)]',
          signal === 'bullish' ? 'bg-emerald-500/30 text-emerald-300'
          : signal === 'bearish' ? 'bg-rose-500/30 text-rose-300'
          : 'bg-white/10 text-[var(--cb-text-muted)]',
        )}>
          +{overflow}
        </span>
      )}
    </div>
  );
}
