'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error.message, error.digest);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--cb-bg)] px-4">
      <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
      <p className="mt-2 text-sm text-[var(--cb-text-muted)] text-center max-w-md">
        {process.env.NODE_ENV === 'development' && error.message
          ? error.message
          : 'An error occurred. Please try again.'}
      </p>
      {process.env.NODE_ENV === 'development' && error.digest && (
        <p className="mt-1 text-xs text-[var(--cb-text-muted)]">Digest: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-[var(--cb-green)] px-4 py-2 text-sm font-semibold text-slate-900"
      >
        Try again
      </button>
    </div>
  );
}
