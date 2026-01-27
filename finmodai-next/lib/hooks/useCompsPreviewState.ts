'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MetricType } from '@/components/comps/CompsDistributionChart';

/**
 * Schema for Comps Preview state persistence
 * This can be extended for DB persistence later
 */
export interface CompsPreviewState {
  selectedMetric: MetricType;
  excludedOutliers: Set<string>; // Set of ticker symbols that are excluded
  customPeers?: string[]; // Optional custom peer tickers (for future use)
}

export interface CompsPreviewStateStore {
  getState: (ticker: string) => CompsPreviewState | null;
  setState: (ticker: string, state: Partial<CompsPreviewState>) => void;
  clearState: (ticker: string) => void;
}

/**
 * Default state factory
 */
function createDefaultState(): CompsPreviewState {
  return {
    selectedMetric: 'pe', // Default to P/E, will be overridden by component logic
    excludedOutliers: new Set(),
    customPeers: undefined,
  };
}

/**
 * localStorage-based state store
 * Can be swapped for DB-backed store later
 */
class LocalStorageCompsPreviewStore implements CompsPreviewStateStore {
  private readonly keyPrefix = 'comps_preview_state:';

  private getKey(ticker: string): string {
    return `${this.keyPrefix}${ticker.toUpperCase()}`;
  }

  getState(ticker: string): CompsPreviewState | null {
    if (typeof window === 'undefined') return null;

    try {
      const key = this.getKey(ticker);
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return {
        selectedMetric: parsed.selectedMetric || 'pe',
        excludedOutliers: new Set(parsed.excludedOutliers || []),
        customPeers: parsed.customPeers || undefined,
      };
    } catch (error) {
      console.warn('[useCompsPreviewState] Failed to load state from localStorage:', error);
      return null;
    }
  }

  setState(ticker: string, updates: Partial<CompsPreviewState>): void {
    if (typeof window === 'undefined') return;

    try {
      const key = this.getKey(ticker);
      const current = this.getState(ticker) || createDefaultState();

      const newState: CompsPreviewState = {
        selectedMetric: updates.selectedMetric ?? current.selectedMetric,
        excludedOutliers: updates.excludedOutliers ?? current.excludedOutliers,
        customPeers: updates.customPeers ?? current.customPeers,
      };

      // Convert Set to Array for JSON serialization
      const serializable = {
        ...newState,
        excludedOutliers: Array.from(newState.excludedOutliers),
      };

      localStorage.setItem(key, JSON.stringify(serializable));
    } catch (error) {
      console.warn('[useCompsPreviewState] Failed to save state to localStorage:', error);
    }
  }

  clearState(ticker: string): void {
    if (typeof window === 'undefined') return;

    try {
      const key = this.getKey(ticker);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[useCompsPreviewState] Failed to clear state from localStorage:', error);
    }
  }
}

// Default store instance (can be replaced with DB-backed store)
const defaultStore = new LocalStorageCompsPreviewStore();

/**
 * Hook for managing Comps Preview state persistence
 *
 * @param ticker - Company ticker symbol
 * @param defaultMetric - Default metric if no saved state exists
 * @param store - Optional store instance (defaults to localStorage)
 * @returns State and setters
 */
export function useCompsPreviewState(
  ticker: string,
  defaultMetric: MetricType,
  store: CompsPreviewStateStore = defaultStore
) {
  // Initialize state from localStorage or defaults
  const [state, setStateInternal] = useState<CompsPreviewState>(() => {
    const saved = store.getState(ticker);
    if (saved) {
      return saved;
    }
    return {
      selectedMetric: defaultMetric,
      excludedOutliers: new Set(),
      customPeers: undefined,
    };
  });

  // Update selected metric and persist
  const setSelectedMetric = useCallback(
    (metric: MetricType) => {
      setStateInternal((prev) => {
        const newState = { ...prev, selectedMetric: metric };
        store.setState(ticker, newState);
        return newState;
      });
    },
    [ticker, store]
  );

  // Update excluded outliers and persist
  const setExcludedOutliers = useCallback(
    (outliers: Set<string>) => {
      setStateInternal((prev) => {
        const newState = { ...prev, excludedOutliers: outliers };
        store.setState(ticker, newState);
        return newState;
      });
    },
    [ticker, store]
  );

  // Toggle outlier exclusion for a single ticker
  const toggleOutlierExclusion = useCallback(
    (tickerToToggle: string) => {
      setStateInternal((prev) => {
        const newOutliers = new Set(prev.excludedOutliers);
        if (newOutliers.has(tickerToToggle)) {
          newOutliers.delete(tickerToToggle);
        } else {
          newOutliers.add(tickerToToggle);
        }
        const newState = { ...prev, excludedOutliers: newOutliers };
        store.setState(ticker, newState);
        return newState;
      });
    },
    [ticker, store]
  );

  // Update custom peers and persist
  const setCustomPeers = useCallback(
    (peers: string[] | undefined) => {
      setStateInternal((prev) => {
        const newState = { ...prev, customPeers: peers };
        store.setState(ticker, newState);
        return newState;
      });
    },
    [ticker, store]
  );

  // Load state from store on ticker change
  useEffect(() => {
    const saved = store.getState(ticker);
    if (saved) {
      setStateInternal(saved);
    } else {
      // Reset to defaults if no saved state
      setStateInternal({
        selectedMetric: defaultMetric,
        excludedOutliers: new Set(),
        customPeers: undefined,
      });
    }
  }, [ticker, defaultMetric, store]);

  return {
    selectedMetric: state.selectedMetric,
    excludedOutliers: state.excludedOutliers,
    customPeers: state.customPeers,
    setSelectedMetric,
    setExcludedOutliers,
    toggleOutlierExclusion,
    setCustomPeers,
  };
}

