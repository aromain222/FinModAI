'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/trackEvent';

type CompanyViewTrackerProps = {
  ticker: string;
  userId?: string | null;
};

export function CompanyViewTracker({ ticker, userId }: CompanyViewTrackerProps) {
  useEffect(() => {
    const normalizedTicker = ticker?.trim().toUpperCase();
    if (!normalizedTicker) return;

    void trackEvent('viewed_company', userId ?? undefined, {
      ticker: normalizedTicker,
    });
  }, [ticker, userId]);

  return null;
}
