"use client";

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--cb-text-secondary)] transition-colors hover:border-[var(--cb-green)] hover:text-[var(--cb-text-primary)]"
      aria-pressed={isDark}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--cb-green)]" aria-hidden="true" />
      <span>{isDark ? 'Dark · Switch to Light' : 'Light · Switch to Dark'}</span>
    </button>
  );
}
