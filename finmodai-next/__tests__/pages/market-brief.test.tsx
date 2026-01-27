/**
 * Smoke tests for Market Brief page
 * 
 * Ensures page renders main containers without crashing
 * even when APIs return empty arrays.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MarketBriefPage from '@/app/(app)/market-brief/page';
import React from 'react';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/market-brief',
}));

// Mock fetch to return empty arrays
global.fetch = vi.fn((url: string) => {
  if (typeof url === 'string') {
    if (url.includes('/api/market/chart') || url.includes('/api/market/index')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ series: [], data: [] }),
      } as Response);
    }
    if (url.includes('/api/market-brief/headlines') || url.includes('/api/market/headlines')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], headlines: [], data: [] }),
      } as Response);
    }
    if (url.includes('/api/market/sector-momentum')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], data: [] }),
      } as Response);
    }
    if (url.includes('/api/market/top-movers') || url.includes('/api/market/moves')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], data: [] }),
      } as Response);
    }
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response);
});

describe('Market Brief Page', () => {
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
        <MarketBriefPage />
      </QueryClientProvider>
    );

    // Check main title exists
    expect(screen.getByText('Market Brief')).toBeInTheDocument();
  });

  it('renders KPI cards section', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MarketBriefPage />
      </QueryClientProvider>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Period Return')).toBeInTheDocument();
      expect(screen.getByText('Last Level')).toBeInTheDocument();
      expect(screen.getByText('Volatility (proxy)')).toBeInTheDocument();
      expect(screen.getByText('Headlines')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('renders chart section even with empty data', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MarketBriefPage />
      </QueryClientProvider>
    );

    // Should render chart card title
    expect(screen.getByText('Benchmark Chart')).toBeInTheDocument();
  });

  it('renders headlines section even with empty data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MarketBriefPage />
      </QueryClientProvider>
    );

    // Should render headlines card
    expect(screen.getByText('Market Headlines')).toBeInTheDocument();
  });

  it('renders movers and sectors sections', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MarketBriefPage />
      </QueryClientProvider>
    );

    expect(screen.getByText('Top Movers')).toBeInTheDocument();
    expect(screen.getByText('Sector Momentum')).toBeInTheDocument();
  });

  it('does not throw when all APIs return empty arrays', () => {
    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <MarketBriefPage />
        </QueryClientProvider>
      );
    }).not.toThrow();
  });
});

