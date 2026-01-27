'use client';

import React, { useEffect, useRef } from 'react';

export function ChartFrame({
  title,
  loading,
  error,
  hasData,
  onRetry,
  children,
}: {
  title: string;
  loading: boolean;
  error?: string | null;
  hasData: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!bodyRef.current) return;
    const h = bodyRef.current.getBoundingClientRect().height;
    console.log('[ChartFrame] body height', h, { title, loading, error, hasData });
  }, [title, loading, error, hasData]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-lg font-semibold">{title}</div>
        {loading ? <span className="text-xs text-white/60">Loading…</span> : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-sm font-medium text-red-200">Chart failed to load</div>
          <div className="mt-1 text-xs text-red-200/80">{error}</div>
          {onRetry ? (
            <button
              className="mt-3 rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <div className="h-[320px] animate-pulse rounded-xl bg-white/5" />
      ) : !hasData ? (
        <div className="flex h-[320px] items-center justify-center rounded-xl bg-white/5 text-sm text-white/60">
          No data available
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="h-[320px] rounded-xl bg-black/20 p-2 relative"
        >
          <div className="absolute top-2 right-2 text-[10px] text-white/60 z-10">
            chart-body: 320px
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

