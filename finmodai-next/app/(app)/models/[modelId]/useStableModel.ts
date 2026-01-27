"use client";

/**
 * Root cause of the previous request storm/flicker:
 * - Poller kept firing even after preview existed or status was ready, so we hammered /api/models.
 * - No explicit in-flight guard meant overlapping fetches; thin responses overwrote last good preview.
 * - Missing stop condition + StrictMode re-runs caused multiple intervals and preview regressions.
 * This hook dedupes fetches, preserves last good output, and stops polling once output/ready is present.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type AnyModel = Record<string, any>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hasPreviewData = (value: any) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const hasResultsData = (value: any) => {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const hasOutput = (model: AnyModel | null | undefined) => {
  if (!model) return false;
  return hasPreviewData(model.preview) || hasResultsData(model.results) || Boolean(model.r2_key);
};

const normalizeMaybeJson = (value: any) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const normalizeModel = (payload: AnyModel | null): AnyModel | null => {
  if (!payload) return payload;
  return {
    ...payload,
    results: normalizeMaybeJson(payload.results),
    assumptions: normalizeMaybeJson(payload.assumptions),
    normalized_assumptions: normalizeMaybeJson(
      payload.normalized_assumptions ?? payload.normalizedAssumptions
    ),
    preview: payload.preview ?? null,
  };
};

const mergeModels = <T extends AnyModel>(prev: T | null, next: T | null) => {
  if (!prev && !next) return { merged: null as T | null, usedPrev: false };
  if (!prev) return { merged: next, usedPrev: false };
  if (!next) return { merged: prev, usedPrev: true };

  const merged = { ...prev, ...next } as T;
  let usedPrev = false;

  if (!hasPreviewData((next as any).preview) && hasPreviewData((prev as any).preview)) {
    (merged as any).preview = (prev as any).preview;
    usedPrev = true;
  }
  if (!hasResultsData((next as any).results) && hasResultsData((prev as any).results)) {
    (merged as any).results = (prev as any).results;
    usedPrev = true;
  }
  if (!(next as any).r2_key && (prev as any).r2_key) {
    (merged as any).r2_key = (prev as any).r2_key;
    usedPrev = true;
  }
  if (!(next as any).file_name && (prev as any).file_name) {
    (merged as any).file_name = (prev as any).file_name;
    usedPrev = true;
  }

  return { merged, usedPrev };
};

type Options = { pollMs?: number; stopWhenReady?: boolean };

export function useStableModel<T extends AnyModel = AnyModel>(
  modelId: string,
  { pollMs = 2000, stopWhenReady = true }: Options = {}
) {
  const [model, setModel] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastGoodRef = useRef<T | null>(null);
  const modelRef = useRef<T | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopLoggedRef = useRef(false);

  const resetState = () => {
    lastGoodRef.current = null;
    modelRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    stopLoggedRef.current = false;
    setModel(null);
    setStale(false);
    setError(null);
    setLoading(true);
  };

  const shouldStop = (candidate: AnyModel | null | undefined) => {
    if (!candidate) return false;
    const ready = candidate.status === "ready" || Boolean(candidate.r2_key) || Boolean(candidate.file_name);
    if (stopWhenReady && ready) return true;
    if (hasOutput(candidate)) return true;
    return false;
  };

  const fetchModel = async () => {
    if (!modelId || !UUID_REGEX.test(modelId)) {
      setError("Invalid model id");
      setLoading(false);
      return;
    }

    if (inFlightRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    const startedAt = performance.now();

    try {
      setError(null);
      const res = await fetch(`/api/models/${encodeURIComponent(modelId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const ok = res.ok;
      const payload = ok ? (normalizeModel(await res.json()) as T | null) : null;
      if (!ok) throw new Error(`GET /api/models/${modelId} failed: ${res.status}`);

      if (controller.signal.aborted) return;

      const baseline = (lastGoodRef.current ?? modelRef.current ?? null) as T | null;
      const { merged, usedPrev } = mergeModels(baseline, payload);
      const hasIncomingOutput = hasOutput(payload);
      const mergedHasOutput = hasOutput(merged);

      if (mergedHasOutput && merged) {
        lastGoodRef.current = merged;
      }

      modelRef.current = merged;
      setModel(merged);
      setStale(!hasIncomingOutput && mergedHasOutput || usedPrev);
      setLoading(false);

      const status = (merged as any)?.status;
      console.debug("[useStableModel] fetch", {
        modelId,
        ok,
        ms: Math.round(performance.now() - startedAt),
        hasPreview: hasPreviewData(merged?.preview),
        hasResults: hasResultsData(merged?.results),
        status,
      });

      if (shouldStop(merged) && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (!stopLoggedRef.current) {
          console.debug("[useStableModel] poll-stop", { reason: "ready or output present", modelId });
          stopLoggedRef.current = true;
        }
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      setError(e?.message ?? "Unknown error");
      if (lastGoodRef.current) {
        modelRef.current = lastGoodRef.current;
        setModel(lastGoodRef.current);
        setStale(true);
      }
      console.debug("[useStableModel] fetch", {
        modelId,
        ok: false,
        ms: Math.round(performance.now() - startedAt),
        error: e?.message,
      });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    resetState();
    fetchModel();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = setInterval(() => {
      const candidate = lastGoodRef.current ?? modelRef.current;
      if (shouldStop(candidate)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (!stopLoggedRef.current) {
          console.debug("[useStableModel] poll-stop", { reason: "ready or output present", modelId });
          stopLoggedRef.current = true;
        }
        return;
      }
      fetchModel();
    }, Math.max(1500, pollMs));

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, pollMs, stopWhenReady]);

  const stableModel = useMemo(() => model, [model]);

  return { model: stableModel, loading, error, stale, refetch: fetchModel };
}
