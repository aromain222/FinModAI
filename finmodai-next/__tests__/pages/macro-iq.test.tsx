/**
 * Smoke tests for Macro IQ page
 * 
 * Ensures page renders main containers without crashing
 * even when APIs return empty arrays.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MacroIQAntDPage from '@/app/(app)/macro-iq/page';
import React from 'react';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/macro-iq',
}));

// Mock fetch to return empty arrays
global.fetch = vi.fn((url: string) => {
  if (typeof url === 'string') {
    if (url.includes('/api/macro/summary') || url.includes('/api/macro/snapshot')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: {}, items: [] }),
      } as Response);
    }
    if (url.includes('/api/macro/market')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ series: [], data: [] }),
      } as Response);
    }
    if (url.includes('/api/macro/events') || url.includes('/api/events/intelligence')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], events: [], data: [] }),
      } as Response);
    }
    if (url.includes('/api/macro/headlines') || url.includes('/api/market/headlines')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], headlines: [], data: [] }),
      } as Response);
    }
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response);
});

describe('Macro IQ Page', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });
    vi.clearAllMocks();
  });

  it('renders main containers without crashing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MacroIQAntDPage />
      </QueryClientProvider>
    );

    // Check main title exists
    expect(screen.getByText('Macro IQ')).toBeInTheDocument();
  });

  it('renders snapshot cards section', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MacroIQAntDPage />
      </QueryClientProvider>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Inflation')).toBeInTheDocument();
      expect(screen.getByText('Growth')).toBeInTheDocument();
      expect(screen.getByText('Labor')).toBeInTheDocument();
      expect(screen.getByText('Rates')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('renders chart sections even with empty data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MacroIQAntDPage />
      </QueryClientProvider>
    );

    // Should render chart card titles
    expect(screen.getByText('Macro Market Composite')).toBeInTheDocument();
    expect(screen.getByText('Growth vs Inflation Regime')).toBeInTheDocument();
  });

  it('renders headlines section even with empty data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MacroIQAntDPage />
      </QueryClientProvider>
    );

    // Should render headlines card
    expect(screen.getByText('Macro Headlines')).toBeInTheDocument();
  });

  it('renders event intelligence section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MacroIQAntDPage />
      </QueryClientProvider>
    );

    expect(screen.getByText('Event Intelligence')).toBeInTheDocument();
  });

  it('does not throw when all APIs return empty arrays', () => {
    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <MacroIQAntDPage />
        </QueryClientProvider>
      );
    }).not.toThrow();
  });
});

