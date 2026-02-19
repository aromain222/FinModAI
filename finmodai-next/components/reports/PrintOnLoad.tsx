'use client';

import { useEffect } from 'react';

type PrintOnLoadProps = {
  enabled: boolean;
};

export function PrintOnLoad({ enabled }: PrintOnLoadProps) {
  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => window.print(), 180);
    return () => window.clearTimeout(timeout);
  }, [enabled]);

  return null;
}
