'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, ChevronDown, FileText, Layers,
  MessageSquare, Newspaper, Radar, Settings,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/portfolio',          label: 'Portfolio',    icon: Briefcase },
  { href: '/models',             label: 'Models',       icon: Layers },
  { href: '/news',               label: 'News',         icon: Newspaper },
  { href: '/events',             label: 'Events',       icon: Radar },
  { href: '/reports',            label: 'Reports',      icon: FileText },
  { href: '/analyst-chat',       label: 'Analyst Chat', icon: MessageSquare },
  { href: '/dashboard/settings', label: 'Settings',     icon: Settings },
] as const;

export function WorkspaceBar() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div className="flex h-10 w-full shrink-0 items-center justify-between border-b border-[var(--cb-border)] bg-[var(--cb-surface)] px-3">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--cb-green)]/40 bg-[var(--cb-green)]/10 text-[10px] font-bold text-[var(--cb-green)]">
          CB
        </div>
        <span className="text-[11px] font-bold tracking-tight text-[var(--cb-text-primary)]">
          CapitalBase
        </span>
        <span className="text-[10px] text-[var(--cb-text-muted)]">/ Opportunities</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <ThemeToggle />

        {/* Navigate dropdown */}
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--cb-text-muted)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)]"
          >
            Navigate
            <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-180')} />
          </button>

          {open && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] py-1 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--cb-text-secondary)] transition-colors hover:bg-[var(--cb-surface-subtle)] hover:text-[var(--cb-text-primary)]"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--cb-text-muted)]" />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
