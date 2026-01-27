"use client";

import { useState, useEffect } from 'react';
import { StartupsLeaderboard } from './StartupsLeaderboard';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StartupsClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  
  // Load watchlist from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('startup-watchlist');
        if (saved) {
          setWatchlist(new Set(JSON.parse(saved)));
        }
      } catch (err) {
        console.error('[StartupsClient] Failed to load watchlist:', err);
      }
    }
  }, []);
  
  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/startups?window=7d&mode=live');
      
      if (!response.ok) {
        throw new Error('Failed to fetch startups data');
      }
      
      const json = await response.json();
      setData(json);
    } catch (err) {
      console.error('[StartupsClient] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Toggle watchlist
  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('startup-watchlist', JSON.stringify(Array.from(next)));
        } catch (err) {
          console.error('[StartupsClient] Failed to save watchlist:', err);
        }
      }
      
      return next;
    });
  };
  
  if (loading && !data) {
    return (
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="inline-block h-8 w-8 animate-spin text-emerald-400 mb-3" />
            <p className="text-body-muted">Loading startups intelligence...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error && !data) {
    return (
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        <div className="panel-institutional p-12 text-center border-rose-500/20">
          <AlertCircle className="inline-block h-8 w-8 text-rose-400 mb-3" />
          <p className="text-rose-400 font-medium mb-2">{error}</p>
          <button
            onClick={fetchData}
            className="btn-secondary mt-4"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-6 py-12 max-w-7xl">
      {/* Status Bar */}
      <div className="panel-institutional p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {data?.dataMode === 'live' ? (
            <span className="status-live">Live Data</span>
          ) : (
            <span className="status-demo">Demo Data</span>
          )}
          {data?.updatedAt && (
            <span className="text-xs text-slate-500">
              Updated {new Date(data.updatedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn-ghost text-xs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>
      
      {/* Leaderboard */}
      <StartupsLeaderboard
        startups={data?.startups || []}
        watchlist={watchlist}
        onToggleWatchlist={toggleWatchlist}
      />
    </div>
  );
}

