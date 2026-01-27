'use client';

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PreviewV3Table } from '@/components/models/PreviewV3Table';
import { PreviewChartsPanel } from '@/components/models/PreviewChartsPanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModelRow } from '@/types/modelContracts';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import type { PreviewV3 } from '@/types/preview-v3';
import type { ChartSpec } from '@/types/chartSpecs';
import { buildPreviewCharts } from '@/lib/previewCharts/adapters';
import { buildDerivedPreview } from '@/lib/previewDerived/buildDerivedPreview';
import { formatMoney, formatPercent as formatPercentDisplay, formatSharesMm } from '@/lib/formatters/previewFormat';
import { isFileReady } from '@/lib/fileContracts';
import { resolveFacts } from '@/lib/facts/resolveFacts';
import type { ResolvedModelFacts } from '@/lib/facts/factsTypes';
import { getSourceLabel, getSourceBadgeClass, getMissingReason } from '@/lib/formatters/valuationOutput';

type ModelResponse = Omit<ModelRow, 'user_id'> & {
  notes?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (value?: number | null, scale?: any, mode: 'card' | 'table' = 'card') => {
  return formatMoney(value ?? null, scale ?? 'UNKNOWN', mode);
};

const formatUsdPrice = (value?: number | null) => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  return `$${num.toFixed(2)}`;
};

const unwrapApiData = <T,>(payload: any): T => (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload);

const toErrorText = (err: unknown): string | null => {
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const maybe = (err as any).message || (err as any).detail || (err as any).details || (err as any).error;
    if (typeof maybe === 'string') return maybe;
    try {
      return JSON.stringify(err);
    } catch {
      return null;
    }
  }
  return null;
};

export default function ModelDetailPage({ params }: { params: { modelId: string } }) {
  const { modelId } = params;
  const router = useRouter();
  const [model, setModel] = useState<ModelResponse | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [previewV3, setPreviewV3] = useState<PreviewV3 | null>(null);
  const [previewReason, setPreviewReason] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewInFlight = useRef(false);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previewSeqRef = useRef(0);
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [derivedPreview, setDerivedPreview] = useState<any>(null);
  const unitsScale = derivedPreview?.units?.scale ?? 'UNKNOWN';
  const [enrichingShares, setEnrichingShares] = useState(false);
  const sharesEnrichedRef = useRef(false);
  const [reconcilingFile, setReconcilingFile] = useState(false);
  const fileReconciledRef = useRef(false);
  const [facts, setFacts] = useState<ResolvedModelFacts | null>(null);
  const factsEnrichedRef = useRef(false);
  const [enrichingFacts, setEnrichingFacts] = useState(false);
  const marketPriceFetchedRef = useRef(false);
  const [refreshingMarketPrice, setRefreshingMarketPrice] = useState(false);
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const modelKind = useMemo(() => (model?.model_type ?? model?.type ?? 'dcf').toString(), [model]);
  useEffect(() => {
    setPreviewV3(null);
    setPreviewReason(null);
    setCharts([]);
    setDerivedPreview(null);
    sharesEnrichedRef.current = false;
    fileReconciledRef.current = false;
    setFacts(null);
    factsEnrichedRef.current = false;
    setEnrichingFacts(false);
    marketPriceFetchedRef.current = false;
    setRefreshingMarketPrice(false);
  }, [modelId]);
  const hasAnyOutput = useMemo(
    () =>
      Boolean(previewV3) ||
      Boolean(model?.preview) ||
      Boolean((model as any)?.results) ||
      Boolean((model as any)?.results?.preview) ||
      Boolean(model?.r2_key) ||
      Boolean(model?.file_name),
    [model, previewV3]
  );

  const handleDownload = useCallback(async () => {
    if (!modelId) return;
    if (downloading) return;
    setDownloading(true);
    const endpoint = `/api/models/${encodeURIComponent(modelId)}/download`;
    try {
      const res = await fetch(endpoint, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = `Download failed (HTTP ${res.status})`;
        try {
          const payload = text ? JSON.parse(text) : null;
          if (payload && (payload.details || payload.error)) {
            message = payload.details || payload.error;
          }
        } catch {
          if (text) message = text;
        }
        showToast({
          title: 'Download unavailable',
          description: String(message),
          variant: 'destructive',
        });
        return;
      }
      const text = await res.text().catch(() => '');
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      const downloadUrl = payload?.url || payload?.downloadUrl;
      if (!downloadUrl) {
        showToast({
          title: 'Download unavailable',
          description: 'No download URL returned.',
          variant: 'destructive',
        });
        return;
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      if (payload?.filename) {
        link.download = payload.filename;
      }
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      showToast({
        title: 'Download failed',
        description: toErrorText(e) || 'Unable to download.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }, [model, modelId, modelKind, showToast, downloading]);

  const fetchModel = useCallback(async () => {
    setModelLoading(true);
    setModelError(null);
    setPreviewReason(null);
    try {
      const res = await fetch(`/api/models/${encodeURIComponent(modelId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ModelResponse;
      setModel(data);
    } catch (e: any) {
      setModelError(e?.message || 'Failed to load model');
    } finally {
      setModelLoading(false);
    }
  }, [modelId]);

  const fetchPreview = useCallback(async () => {
    if (previewInFlight.current) return;
    previewInFlight.current = true;
    setPreviewLoading(true);
    const seq = ++previewSeqRef.current;
    try {
      const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/preview`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (seq !== previewSeqRef.current) return;

      setPreviewV3((prev) => (json?.preview_v3 ? (json.preview_v3 as PreviewV3) : prev));
      setPreviewReason(
        typeof json?.reason === 'string'
          ? json.reason
          : toErrorText(json?.reason)
      );
    } catch (e: any) {
      if (seq !== previewSeqRef.current) return;
      setPreviewReason(e?.message || 'preview fetch failed');
    } finally {
      previewInFlight.current = false;
      setPreviewLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (!model) {
      setCharts([]);
      setDerivedPreview(null);
      sharesEnrichedRef.current = false;
      factsEnrichedRef.current = false;
      return;
    }
    try {
      const resObj =
        typeof (model as any)?.results === 'string'
          ? JSON.parse((model as any).results as any)
          : (model as any)?.results;
      const derived = buildDerivedPreview({ model: model as any, preview: previewV3, results: resObj });
      setDerivedPreview(derived);
      setFacts(resolveFacts({ model, derivedPreview: derived }));
      const derivedChartSpecs: ChartSpec[] = [];
      if (derived?.series?.revenue || derived?.series?.fcf) {
        const revenueSeries = derived?.series?.revenue || [];
        const fcfSeries = derived?.series?.fcf || [];
        const maxLen = Math.max(revenueSeries.length, fcfSeries.length);
        const data = Array.from({ length: maxLen }).map((_, idx) => ({
          year: revenueSeries[idx]?.year ?? fcfSeries[idx]?.year ?? idx,
          revenue: revenueSeries[idx]?.value,
          fcf: fcfSeries[idx]?.value,
        }));
        derivedChartSpecs.push({
          type: 'line',
          id: 'revenue-fcf',
          title: 'Revenue & FCF',
          xKey: 'year',
          series: [
            ...(revenueSeries.length ? [{ key: 'revenue', label: 'Revenue' }] : []),
            ...(fcfSeries.length ? [{ key: 'fcf', label: 'Unlevered FCF' }] : []),
          ],
          data,
          yFormat: 'currency',
        } as ChartSpec);
      }
      if (derived?.series?.ebitMargin) {
        derivedChartSpecs.push({
          type: 'line',
          id: 'ebit-margin',
          title: 'EBIT Margin',
          xKey: 'year',
          series: [{ key: 'ebitMargin', label: 'EBIT Margin' }],
          data: derived.series.ebitMargin.map((pt: any) => ({
            year: pt.year,
            ebitMargin: pt.value,
          })),
          yFormat: 'percent',
        } as ChartSpec);
      }

      const adapterChartSpecs = buildPreviewCharts(model as any, resObj, previewV3);
      const seen = new Set<string>();
      const merged: ChartSpec[] = [];
      const addChart = (chart: ChartSpec) => {
        const key = `${chart.type}:${(chart as any).id ?? chart.title}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(chart);
      };
      derivedChartSpecs.forEach(addChart);
      adapterChartSpecs.forEach(addChart);
      setCharts(merged);
    } catch {
      setCharts([]);
      setDerivedPreview(null);
    }
  }, [model, previewV3]);

  useEffect(() => {
    fetchModel();
    // Preview is best-effort; failures should not block model load
    fetchPreview().catch(() => {});
    return () => {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [fetchModel, fetchPreview]);

  useEffect(() => {
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
    if (model?.status === 'generating') {
      previewIntervalRef.current = setInterval(() => {
        fetchPreview();
      }, 1500);
    }
    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }
    };
  }, [model?.status, fetchPreview]);

  useEffect(() => {
    if (model?.status === 'ready' && !previewV3 && !previewLoading) {
      fetchPreview();
    }
  }, [model?.status, previewV3, previewLoading, fetchPreview]);

  useEffect(() => {
    if (!model || !derivedPreview) return;
    const priceMissing = !derivedPreview?.keyOutputs?.pricePerShare;
    const equity = derivedPreview?.keyOutputs?.equityValue;
    const shares = derivedPreview?.keyOutputs?.sharesMm;
    if (shares && shares > 0) return; // already have
    if (!priceMissing && shares) return;
    if (!equity) return;
    if (enrichingShares || sharesEnrichedRef.current) return;

	    const runEnrich = async () => {
	      try {
	        setEnrichingShares(true);
	        const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/enrich`, { method: 'POST' });
	        const raw = await res.json().catch(() => null);
	        const json = unwrapApiData<any>(raw);
	        sharesEnrichedRef.current = true;
	        if (!res.ok) return;
	        const updatedResults = {
	          ...((model as any)?.results || {}),
	          facts: json?.facts ?? (model as any)?.results?.facts,
          sharesOutstandingMm: json?.sharesOutstandingMm ?? shares,
          pricePerShare: json?.pricePerShare ?? derivedPreview?.keyOutputs?.pricePerShare,
          sharesSource: json?.source,
          marketPrice: json?.marketPrice ?? (model as any)?.results?.marketPrice,
	        };
	        setModel((prev) => (prev ? { ...prev, results: updatedResults } : prev));
	      } catch {
	        // best-effort; enrichment should not block
	      } finally {
	        setEnrichingShares(false);
	      }
	    };
    runEnrich();
  }, [model, derivedPreview, modelId, enrichingShares]);

	  useEffect(() => {
	    if (!model) return;
	    const needsShares = !facts?.sharesOutstandingMm?.value || facts.sharesOutstandingMm.value <= 0;
	    const needsPrice = !facts?.marketPrice?.value;
	    if ((!needsShares && !needsPrice) || factsEnrichedRef.current || enrichingFacts) return;
	    const run = async () => {
	      try {
	        setEnrichingFacts(true);
	        const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/facts`, { method: 'POST' });
	        const raw = await res.json().catch(() => null);
	        const json = unwrapApiData<any>(raw);
	        factsEnrichedRef.current = true;
	        if (res.ok) {
	          const updatedResults = {
	            ...((model as any)?.results || {}),
            facts: json?.facts ?? (model as any)?.results?.facts,
            sharesOutstandingMm: json?.sharesOutstandingMm ?? (model as any)?.results?.sharesOutstandingMm,
            marketPrice: json?.marketPrice ?? (model as any)?.results?.marketPrice,
            marketCap: json?.marketCap ?? (model as any)?.results?.marketCap,
            netDebt: json?.netDebt ?? (model as any)?.results?.netDebt,
            companyName: json?.companyName ?? (model as any)?.results?.companyName ?? model.company_name,
	          };
	          setModel((prev) => (prev ? { ...prev, results: updatedResults, company_name: updatedResults.companyName ?? prev.company_name } : prev));
	        }
	      } catch {
	        // best-effort; facts enrichment should not block
	      } finally {
	        setEnrichingFacts(false);
	      }
	    };
	    run();
	  }, [model, modelId, facts, enrichingFacts]);

  useEffect(() => {
    if (!model?.ticker) return;
    if (marketPriceFetchedRef.current) return;
    marketPriceFetchedRef.current = true;

    const run = async () => {
      try {
        setRefreshingMarketPrice(true);
        const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/market-price`, { method: 'POST' });
        const raw = await res.json().catch(() => null);
        const payload = unwrapApiData<any>(raw);
        if (!res.ok) return;

        const marketPrice =
          typeof payload?.marketPrice === 'number' && Number.isFinite(payload.marketPrice) ? payload.marketPrice : null;
        const source = typeof payload?.source === 'string' ? payload.source : null;
        const asOf = typeof payload?.asOf === 'string' ? payload.asOf : null;

        setModel((prev) => {
          if (!prev) return prev;
          const prevResults =
            (prev as any)?.results && typeof (prev as any).results === 'object' ? (prev as any).results : {};
          return {
            ...prev,
            results: {
              ...prevResults,
              marketPrice,
              marketPriceSource: source === 'unavailable' ? null : source,
              ...(asOf ? { marketPriceAsOf: asOf } : {}),
            },
          };
        });
      } catch {
        // best-effort; keep marketPrice null
      } finally {
        setRefreshingMarketPrice(false);
      }
    };

    run();
  }, [model?.ticker, modelId]);

  useEffect(() => {
    if (!model || fileReconciledRef.current || reconcilingFile) return;
    if (model.status !== 'ready') return;
    const ready = isFileReady(model);
    if (ready) {
      fileReconciledRef.current = true;
      return;
    }
    const runReconcile = async () => {
      try {
        setReconcilingFile(true);
        const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/reconcile-file`, { method: 'POST' });
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          fileReconciledRef.current = true;
          setModel((prev) => (prev ? { ...prev, r2_key: json?.r2_key ?? prev.r2_key, file_name: json?.file_name ?? prev.file_name } : prev));
        }
      } finally {
        setReconcilingFile(false);
      }
    };
    runReconcile();
  }, [model, modelId, reconcilingFile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    const match = path.match(/^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (match && path !== `/models/${match[1]}`) {
      router.replace(`/models/${match[1]}`);
    }
  }, [router, modelId]);

  const assumptionSource = useMemo(() => {
    const normalized = (model?.normalized_assumptions as Record<string, any>) || {};
    const base = (model?.assumptions as Record<string, any>) || {};
    const derivedAssumptions = derivedPreview?.assumptions || {};
    const merged = { ...base, ...normalized, ...derivedAssumptions };
    return merged;
  }, [model, derivedPreview]);

  const numberFrom = (...candidates: any[]): number | null => {
    for (const val of candidates) {
      if (typeof val === 'number' && !Number.isNaN(val)) return val;
      if (typeof val === 'string' && val.trim().length > 0) {
        const parsed = Number(val);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return null;
  };

  const keyOutputs = useMemo(() => {
    const results = (model?.results as any) || {};
    const outputs = results?.outputs || results?.summary || {};
    const valuation = results?.valuation || results?.valuationResults || outputs?.valuation || {};
    const bridge = results?.valuationBridge || results?.valuation_bridge || outputs?.valuationBridge || {};

    const derivedOutputs = derivedPreview?.keyOutputs || {};

    const enterpriseValue = numberFrom(
        valuation.enterpriseValue,
        outputs.enterpriseValue,
        results.enterpriseValue,
        derivedOutputs.enterpriseValue
      );
    const equityValue = numberFrom(
        valuation.equityValue,
        outputs.equityValue,
        results.equityValue,
        derivedOutputs.equityValue
      );
    
    // Price per share from model results (highest priority)
    const pricePerShareFromModel = numberFrom(
        valuation.impliedValuePerShare,
        valuation.pricePerShare,
        outputs.pricePerShare,
        results.pricePerShare,
        derivedOutputs.pricePerShare
      );
    
    const netDebt = numberFrom(
        facts?.netDebtMillions?.value,
        bridge.netDebt,
        valuation.netDebt,
        outputs.netDebt,
        results.netDebt,
        derivedOutputs.netDebt
      );
    
    // Shares: prioritize workbook (sheet) over market data
    const sharesFromWorkbook = derivedOutputs.sharesMm;
    const sharesFromResults = numberFrom(
        results.sharesOutstanding,
        results.shares,
        results.capitalization?.sharesOutstanding,
        results.shareCount,
        results.shares_outstanding
      );
    const sharesFromFacts = facts?.sharesOutstandingMm?.value;
    const sharesSource = facts?.sharesOutstandingMm?.source;
    
    // Prefer workbook shares, then results, then facts
    const shares = sharesFromWorkbook ?? sharesFromResults ?? sharesFromFacts ?? null;
    const effectiveShareSource = sharesFromWorkbook ? 'sheet' : sharesFromResults ? 'results' : sharesSource ?? null;
    
    // Price per share computation logic:
    // 1. Use model result if available (highest priority)
    // 2. Compute from equity/shares ONLY if shares are from workbook (sheet) or results
    // 3. If shares are from market data (polygon, etc), don't auto-compute - show reason instead
    let pricePerShare: number | null = null;
    let pricePerShareSource: string | null = null;
    let pricePerShareReason: string | null = null;
    
    if (pricePerShareFromModel !== null) {
      pricePerShare = pricePerShareFromModel;
      pricePerShareSource = 'workbook'; // From model calculation
    } else if (equityValue && shares && shares > 0) {
      // Only compute if shares are from workbook/results (not market data)
      if (effectiveShareSource === 'sheet' || effectiveShareSource === 'results' || effectiveShareSource === 'workbook') {
        pricePerShare = equityValue / shares;
        pricePerShareSource = 'workbook';
      } else {
        // Market data shares - don't auto-compute, show reason
        pricePerShare = null;
        const sourceLabel = effectiveShareSource === 'polygon' ? 'Polygon' :
                           effectiveShareSource === 'fmp' ? 'FMP' :
                           effectiveShareSource === 'finnhub' ? 'Finnhub' :
                           effectiveShareSource || 'market data';
        pricePerShareReason = `Shares from ${sourceLabel} - compute manually if needed`;
      }
    } else {
      // Missing required inputs
      if (!equityValue) {
        pricePerShareReason = 'Equity value missing';
      } else if (!shares || shares <= 0) {
        pricePerShareReason = 'Shares missing from model';
      } else {
        pricePerShareReason = 'Cannot compute price per share';
      }
    }

    return {
      enterpriseValue,
      equityValue,
      pricePerShare,
      pricePerShareSource,
      pricePerShareReason,
      netDebt,
      shares,
      shareSource: effectiveShareSource,
      shareConfidence: facts?.sharesOutstandingMm?.confidence ?? null,
      marketPrice: facts?.marketPrice?.value ?? null,
      marketPriceSource: facts?.marketPrice?.source ?? null,
      marketPriceConfidence: facts?.marketPrice?.confidence ?? null,
    };
  }, [model, derivedPreview, facts]);

  const valuationSignal = useMemo(() => {
    const marketPrice = keyOutputs.marketPrice;
    const intrinsicPrice = keyOutputs.pricePerShare;
    if (!marketPrice || !intrinsicPrice) return null;
    if (!Number.isFinite(marketPrice) || !Number.isFinite(intrinsicPrice)) return null;
    if (marketPrice === intrinsicPrice) return null;
    return marketPrice < intrinsicPrice ? 'LOW' : 'HIGH';
  }, [keyOutputs.marketPrice, keyOutputs.pricePerShare]);

  const keyOutputNotes = useMemo(() => {
    const set = new Set<string>();
    (derivedPreview?.keyOutputs?.notes ?? []).forEach((n: any) => {
      const text = toErrorText(n);
      if (text) set.add(text);
    });
    if (!keyOutputs.shares) {
      set.add('Model price/share pending: shares outstanding unavailable.');
    }
    return Array.from(set);
  }, [derivedPreview, keyOutputs.shares]);

  type EditableAssumptions = {
    revenueGrowth: number | null;
    ebitMargin: number | null;
    taxRate: number | null;
    wacc: number | null;
    terminalGrowth: number | null;
    capexPercentOfRevenue: number | null;
    changeInWCPercentOfRevenue: number | null;
  };

  const editableAssumptionDefaults = useMemo<EditableAssumptions>(() => {
    const source = assumptionSource || {};
    const derivedAssumptions = derivedPreview?.assumptions || {};

    const numberFromLoose = (...candidates: any[]): number | null => {
      const stack = [...candidates];
      while (stack.length) {
        const val = stack.shift();
        if (val === null || val === undefined) continue;
        if (typeof val === 'number' && !Number.isNaN(val)) return val;
        if (typeof val === 'string' && val.trim().length > 0) {
          const parsed = Number(val);
          if (!Number.isNaN(parsed)) return parsed;
        }
        if (Array.isArray(val)) {
          stack.unshift(...val);
          continue;
        }
        if (typeof val === 'object' && val) {
          if ('value' in val) {
            stack.unshift((val as any).value);
            continue;
          }
        }
      }
      return null;
    };

    const normalizePct = (val: number | null): number | null => {
      if (val === null || val === undefined || Number.isNaN(val)) return null;
      return Math.abs(val) > 1 ? val / 100 : val;
    };

    const pickPct = (key: string, ...fallbackKeys: string[]) => {
      const raw = numberFromLoose(
        derivedAssumptions[key]?.value,
        (source as any)[key],
        ...fallbackKeys.map((k) => (source as any)[k])
      );
      return normalizePct(raw);
    };

    return {
      revenueGrowth: pickPct('revenueGrowth', 'revenueGrowthPct', 'revenue_growth'),
      ebitMargin: pickPct('ebitMargin', 'ebit_margin'),
      taxRate: pickPct('taxRate', 'tax_rate'),
      wacc: pickPct('wacc', 'discount_rate', 'discountRate'),
      terminalGrowth: pickPct('terminalGrowth', 'terminal_growth', 'longTermGrowth'),
      capexPercentOfRevenue: pickPct(
        'capexPercentOfRevenue',
        'capexPctRevenue',
        'capex_pct_revenue',
        'capexPercent',
        'capex_percent'
      ),
      changeInWCPercentOfRevenue: pickPct(
        'changeInWCPercentOfRevenue',
        'changeInWcPctRevenue',
        'nwcPctRevenue',
        'workingCapitalPctRevenue',
        'deltaWcPctRevenue'
      ),
    };
  }, [assumptionSource, derivedPreview]);

  const [editableAssumptions, setEditableAssumptions] = useState<EditableAssumptions>(editableAssumptionDefaults);
  useEffect(() => {
    setEditableAssumptions(editableAssumptionDefaults);
  }, [editableAssumptionDefaults]);

  const pctToInput = (value: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return (value * 100).toFixed(2).replace(/\.?0+$/, '');
  };

  const inputToPct = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return null;
    return parsed / 100;
  };

  // Reports temporarily disabled until generation pipeline is stabilized

  if (modelLoading && !model) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          <span className="text-sm text-slate-300">Loading model...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 flex min-h-screen flex-col gap-4">
        <div className="sticky top-4 z-10 rounded-xl border border-white/10 bg-black/60 px-4 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Model Detail</p>
              <h1 className="text-2xl font-semibold text-slate-50">
                {model?.ticker ?? '—'} {model?.company_name ? `· ${model.company_name}` : ''}
              </h1>
              {((modelError && model) || model?.status === 'generating') && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {model?.status === 'generating' && (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/5 text-emerald-200">
                      Generating…
                    </Badge>
                  )}
                  {modelError && model && (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/5 text-amber-200">
                      Update failed; showing last saved
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">
                {modelKind.toUpperCase()}
              </Badge>
              <Badge className="bg-amber-500/15 text-amber-100 border-amber-500/30">
                {model?.scenario ?? 'Scenario'}
              </Badge>
              <Badge
                className={
                  model?.status === 'ready'
                    ? 'bg-emerald-500/15 text-emerald-100 border-emerald-500/30'
                    : model?.status === 'generating'
                    ? 'bg-emerald-500/10 text-emerald-100 border-emerald-500/25'
                    : 'bg-rose-500/15 text-rose-100 border-rose-500/30'
                }
              >
                {model?.status ?? 'unknown'}
              </Badge>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1 text-xs text-slate-300 backdrop-blur">
                <Clock className="h-4 w-4 text-slate-400" />
                Updated {formatDate(model?.updated_at || model?.created_at)}
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={!model || model.status === 'generating' || downloading}
              >
                {downloading ? 'Downloading…' : 'Download'}
              </Button>
            </div>
          </div>
        </div>

        {modelError && !model && (
          <Card className="border-rose-500/30 bg-rose-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-100">
                <AlertTriangle className="h-5 w-5" />
                Unable to load model
              </CardTitle>
              <CardDescription className="text-slate-200">{modelError}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Tabs defaultValue="preview" className="flex flex-1 min-h-0 flex-col">
              <TabsList className="w-full justify-start flex flex-wrap gap-1 border border-white/10 bg-black/40 backdrop-blur text-slate-300 shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                {[
                  { value: 'preview', label: 'Preview' },
                  { value: 'assumptions', label: 'Assumptions' },
                  { value: 'charts', label: 'Charts' },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-xs data-[state=active]:text-emerald-200 data-[state=active]:bg-emerald-500/10 data-[state=active]:shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="preview" className="mt-3 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-x-hidden overflow-y-auto space-y-4 pr-1">
	                  <Card className="border border-white/10 bg-black/50 backdrop-blur">
	                    <CardHeader className="p-3 pb-2 space-y-0.5">
	                      <div className="flex items-center justify-between gap-2">
	                        <CardTitle className="text-sm text-white">Valuation outputs</CardTitle>
                        {derivedPreview?.units?.label ? (
                          <span className="text-xs text-slate-500">Units: {derivedPreview.units.label}</span>
                        ) : null}
                      </div>
	                    </CardHeader>
	                    <CardContent className="p-3 pt-0">
	                      <TooltipProvider>
	                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
	                          {[
	                            { 
	                              label: 'Enterprise Value', 
	                              value: formatCurrency(keyOutputs.enterpriseValue, unitsScale),
	                              source: 'workbook' as const,
	                            },
	                            { 
	                              label: 'Equity Value', 
	                              value: formatCurrency(keyOutputs.equityValue, unitsScale),
	                              source: 'workbook' as const,
	                            },
	                            {
	                              label: 'Price / Share',
	                              value: keyOutputs.pricePerShare !== null ? formatCurrency(keyOutputs.pricePerShare, 'RAW') : '—',
	                              source: keyOutputs.pricePerShareSource,
	                              reason: keyOutputs.pricePerShareReason,
	                              shareSource: keyOutputs.shareSource,
	                            },
	                            {
	                              label: 'Market Price',
	                              value:
	                                typeof keyOutputs.marketPrice === 'number' && Number.isFinite(keyOutputs.marketPrice) && keyOutputs.marketPrice > 0
	                                  ? formatUsdPrice(keyOutputs.marketPrice)
	                                  : 'N/A',
	                              tooltip:
	                                typeof keyOutputs.marketPrice === 'number' && Number.isFinite(keyOutputs.marketPrice) && keyOutputs.marketPrice > 0
	                                  ? null
	                                  : 'Market price unavailable',
	                              source:
	                                typeof keyOutputs.marketPrice === 'number' && Number.isFinite(keyOutputs.marketPrice) && keyOutputs.marketPrice > 0
	                                  ? keyOutputs.marketPriceSource
	                                  : null,
	                              confidence:
	                                typeof keyOutputs.marketPrice === 'number' && Number.isFinite(keyOutputs.marketPrice) && keyOutputs.marketPrice > 0
	                                  ? keyOutputs.marketPriceConfidence ?? null
	                                  : null,
	                              signal:
	                                typeof keyOutputs.marketPrice === 'number' && Number.isFinite(keyOutputs.marketPrice) && keyOutputs.marketPrice > 0
	                                  ? valuationSignal
	                                  : null,
	                            },
	                            { 
	                              label: 'Net Debt', 
	                              value: formatCurrency(keyOutputs.netDebt, unitsScale),
	                              source: keyOutputs.netDebt !== null ? 'workbook' as const : null,
	                            },
	                            {
	                              label: 'Shares (mm)',
	                              value: formatSharesMm(keyOutputs.shares),
	                              source: keyOutputs.shares ? keyOutputs.shareSource : null,
	                              confidence: keyOutputs.shareConfidence ?? null,
	                            },
	                          ].map((item: any) => {
	                            const isMarketPrice = item.label === 'Market Price';
	                            const isPricePerShare = item.label === 'Price / Share';
	                            const hasTooltip = typeof item.tooltip === 'string' && item.tooltip.length > 0;
	                            const hasReason = typeof item.reason === 'string' && item.reason.length > 0;
	                            const isUnavailable = isMarketPrice && item.value === 'N/A';
	                            const isPriceUnavailable = isPricePerShare && item.value === '—';

	                            // Build tooltip content for Price / Share
	                            let tooltipContent = item.tooltip;
	                            if (isPricePerShare && hasReason) {
	                              tooltipContent = item.reason;
							} else if (isPricePerShare && isPriceUnavailable) {
								tooltipContent = 'Price per share cannot be computed';
							}

	                            const valueSpan = (
	                              <span
	                                className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isUnavailable || isPriceUnavailable ? 'text-slate-400' : 'text-slate-100'} ${(hasTooltip || hasReason) ? 'cursor-help' : ''}`}
	                                tabIndex={(hasTooltip || hasReason) ? 0 : undefined}
	                              >
	                                {String(item.value)}
	                              </span>
	                            );

	                            const valueNode = (hasTooltip || hasReason) ? (
	                              <Tooltip>
	                                <TooltipTrigger asChild>{valueSpan}</TooltipTrigger>
	                                <TooltipContent className="border border-white/10 bg-black/90 text-xs text-slate-100 max-w-xs">
	                                  {tooltipContent}
	                                </TooltipContent>
	                              </Tooltip>
	                            ) : (
	                              valueSpan
	                            );

	                            return (
	                              <div key={item.label} className="rounded-lg border border-white/10 bg-black/60 px-3 py-2">
	                                <div className="flex items-center justify-between gap-2">
	                                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{item.label}</span>
	                                  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
	                                    {valueNode}
	                                    {isMarketPrice && item.signal && (
	                                      <span
	                                        className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide whitespace-nowrap ${
	                                          item.signal === 'LOW'
	                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
	                                            : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
	                                        }`}
	                                      >
	                                        {String(item.signal)}
	                                      </span>
	                                    )}
	                                    {item.source && (
	                                      <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide whitespace-nowrap ${getSourceBadgeClass(item.source)}`}>
	                                        {getSourceLabel(item.source)}
	                                      </span>
	                                    )}
	                                    {isPricePerShare && item.shareSource && item.shareSource !== 'sheet' && item.shareSource !== 'results' && item.shareSource !== 'workbook' && (
	                                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 whitespace-nowrap">
	                                        {getSourceLabel(item.shareSource)} shares
	                                      </span>
	                                    )}
	                                    {item.confidence && (
	                                      <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300 tabular-nums whitespace-nowrap">
	                                        {String(item.confidence)}
	                                      </span>
	                                    )}
	                                    {item.label === 'Price / Share' && (enrichingShares || enrichingFacts) && (
	                                      <span className="text-[10px] text-emerald-300">Enriching…</span>
	                                    )}
	                                    {item.label === 'Market Price' && refreshingMarketPrice && (
	                                      <span className="text-[10px] text-emerald-300">Fetching…</span>
	                                    )}
	                                  </div>
	                                </div>
	                              </div>
	                            );
	                          })}
	                        </div>
	                      </TooltipProvider>

	                      {keyOutputNotes.length ? (
	                        <div className="mt-2 space-y-1 text-xs text-amber-200">
	                          {keyOutputNotes.slice(0, 2).map((n: string, idx: number) => (
                            <div key={idx}>• {n}</div>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  {(() => {
                    const series = derivedPreview?.series || {};
                    const years = new Set<string>();
                    const addYears = (arr?: Array<{ year: number | string; value: number }>) => {
                      (arr || []).forEach((pt) => years.add(String(pt.year)));
                    };
                    addYears(series.revenue);
                    addYears(series.ebit);
                    addYears(series.nopat);
                    addYears(series.fcf);
                    addYears(series.ebitMargin);
                    const sortedYears = Array.from(years).sort((a, b) => {
                      const na = Number(a);
                      const nb = Number(b);
                      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
                      return a.localeCompare(b);
                    });
                    const shownYears = sortedYears.slice(Math.max(0, sortedYears.length - 6));
                    const mapSeries = (arr?: Array<{ year: number | string; value: number }>) => {
                      const map = new Map<string, number>();
                      (arr || []).forEach((pt) => map.set(String(pt.year), pt.value));
                      return map;
                    };
                    const revenue = mapSeries(series.revenue);
                    const ebit = mapSeries(series.ebit);
                    const nopat = mapSeries(series.nopat);
                    const fcf = mapSeries(series.fcf);
                    const ebitMargin = mapSeries(series.ebitMargin);

                    const hasAny =
                      shownYears.length > 0 && (series.revenue?.length || series.ebit?.length || series.fcf?.length);
                    if (!hasAny) {
                      return (
                        <Card className="border border-white/10 bg-black/50 backdrop-blur">
                          <CardHeader className="p-3 pb-2 space-y-0.5">
                            <CardTitle className="text-sm text-white">Financial highlights</CardTitle>
                            <CardDescription className="text-xs text-slate-500">
                              No structured series were found in the preview payload.
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      );
                    }

                    const formatMoneyCell = (val: number | undefined) => formatCurrency(val ?? null, unitsScale, 'card');
                    const formatPctCell = (val: number | undefined) =>
                      val === null || val === undefined ? '—' : formatPercentDisplay(val);

                    const TableBlock = ({
                      title,
                      rows,
                    }: {
                      title: string;
                      rows: Array<{ label: string; kind: 'money' | 'percent'; values: Map<string, number> }>;
                    }) => (
                      <Card className="border border-white/10 bg-black/50 backdrop-blur">
                        <CardHeader className="p-3 pb-2 space-y-0.5">
                          <CardTitle className="text-sm text-white">{title}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="overflow-hidden rounded-lg border border-white/10">
                            <table className="w-full table-fixed text-[11px] leading-tight text-slate-200">
                              <colgroup>
                                <col style={{ width: shownYears.length <= 4 ? '38%' : '30%' }} />
                                {shownYears.map((_, idx) => (
                                  <col
                                    key={idx}
                                    style={{
                                      width: `${
                                        (shownYears.length <= 4 ? 62 : 70) / Math.max(1, shownYears.length)
                                      }%`,
                                    }}
                                  />
                                ))}
                              </colgroup>
                              <thead className="bg-black/60">
                                <tr className="border-b border-white/10">
                                  <th className="px-2 py-1.5 text-left font-medium text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">
                                    Metric
                                  </th>
                                  {shownYears.map((y) => (
                                    <th
                                      key={y}
                                      className="px-2 py-2 text-right text-[12px] font-semibold text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap"
                                    >
                                      {y}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => (
                                  <tr
                                    key={row.label}
                                    className={`border-b border-white/5 last:border-0 ${
                                      ['Revenue', 'EBIT', 'Unlevered FCF'].includes(row.label) ? 'bg-white/[0.03]' : ''
                                    }`}
                                  >
                                    <td
                                      className={`px-2 py-1.5 text-left overflow-hidden text-ellipsis whitespace-nowrap ${
                                        ['Revenue', 'EBIT', 'Unlevered FCF'].includes(row.label)
                                          ? 'text-slate-50 font-semibold'
                                          : 'text-slate-300'
                                      }`}
                                    >
                                      {row.label}
                                    </td>
                                    {shownYears.map((y) => {
                                      const v = row.values.get(y);
                                      const display = row.kind === 'money' ? formatMoneyCell(v) : formatPctCell(v);
                                      return (
                                        <td
                                          key={`${row.label}-${y}`}
                                          className={`px-2 py-1.5 text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap ${
                                            ['Revenue', 'EBIT', 'Unlevered FCF'].includes(row.label)
                                              ? 'text-slate-50 font-semibold'
                                              : ''
                                          }`}
                                          title={display}
                                        >
                                          {display}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    );

                    return (
                      <div className="grid gap-4 md:grid-cols-2">
                        <TableBlock
                          title="Income statement"
                          rows={[
                            { label: 'Revenue', kind: 'money', values: revenue },
                            { label: 'EBIT', kind: 'money', values: ebit },
                            { label: 'EBIT Margin', kind: 'percent', values: ebitMargin },
                            { label: 'NOPAT', kind: 'money', values: nopat },
                          ]}
                        />
                        <TableBlock
                          title="Cash flow"
                          rows={[
                            { label: 'Unlevered FCF', kind: 'money', values: fcf },
                          ]}
                        />
                      </div>
                    );
                  })()}

                  {hasAnyOutput ? (
                    <PreviewV3Table
                      preview={previewV3}
                      reason={previewReason}
                      loading={previewLoading}
                      status={model?.status ?? null}
                      derived={derivedPreview}
                    />
                  ) : model?.status === 'generating' ? (
                    <Card className="border border-white/10 bg-black/50">
                      <CardHeader className="p-3 pb-2 space-y-0.5">
                        <CardTitle className="text-sm text-white">Generating model…</CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Preview will appear once ready.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) : (
                    <Card className="border border-white/10 bg-black/50">
                      <CardHeader className="p-3 pb-2 space-y-0.5">
                        <CardTitle className="text-sm text-white">No output yet</CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          No preview or results are available for this model yet.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="charts" className="mt-3 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-auto pr-1">
                  <PreviewChartsPanel charts={charts} density="compact" chartHeightClass="h-64" title={null} />
                </div>
              </TabsContent>

              <TabsContent value="assumptions" className="mt-3 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-auto space-y-4 pr-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">
                      Edit key inputs (draft-only; apply is stubbed).
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditableAssumptions(editableAssumptionDefaults);
                          showToast({
                            title: 'Reset assumptions',
                            description: 'Draft values reset to the latest detected inputs.',
                          });
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={() => {
                          showToast({
                            title: 'Apply assumptions',
                            description: 'Apply is not wired yet in this build (draft values only).',
                          });
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="border border-white/10 bg-black/50 backdrop-blur">
                      <CardHeader className="p-3 pb-2 space-y-0.5">
                        <CardTitle className="text-sm text-white">Growth & margins</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">Revenue growth (%)</div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                              value={pctToInput(editableAssumptions.revenueGrowth)}
                              onChange={(e) =>
                                setEditableAssumptions((prev) => ({
                                  ...prev,
                                  revenueGrowth: inputToPct(e.target.value),
                                }))
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">EBIT margin (%)</div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                              value={pctToInput(editableAssumptions.ebitMargin)}
                              onChange={(e) =>
                                setEditableAssumptions((prev) => ({
                                  ...prev,
                                  ebitMargin: inputToPct(e.target.value),
                                }))
                              }
                              placeholder="—"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border border-white/10 bg-black/50 backdrop-blur">
                      <CardHeader className="p-3 pb-2 space-y-0.5">
                        <CardTitle className="text-sm text-white">Valuation</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">WACC (%)</div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                              value={pctToInput(editableAssumptions.wacc)}
                              onChange={(e) =>
                                setEditableAssumptions((prev) => ({
                                  ...prev,
                                  wacc: inputToPct(e.target.value),
                                }))
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">Terminal growth (%)</div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                              value={pctToInput(editableAssumptions.terminalGrowth)}
                              onChange={(e) =>
                                setEditableAssumptions((prev) => ({
                                  ...prev,
                                  terminalGrowth: inputToPct(e.target.value),
                                }))
                              }
                              placeholder="—"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border border-white/10 bg-black/50 backdrop-blur">
                    <CardHeader className="p-3 pb-2 space-y-0.5">
                      <CardTitle className="text-sm text-white">Taxes & reinvestment</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="text-xs text-slate-400">Tax rate (%)</div>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                            value={pctToInput(editableAssumptions.taxRate)}
                            onChange={(e) =>
                              setEditableAssumptions((prev) => ({
                                ...prev,
                                taxRate: inputToPct(e.target.value),
                              }))
                            }
                            placeholder="—"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-slate-400">Capex % of revenue</div>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                            value={pctToInput(editableAssumptions.capexPercentOfRevenue)}
                            onChange={(e) =>
                              setEditableAssumptions((prev) => ({
                                ...prev,
                                capexPercentOfRevenue: inputToPct(e.target.value),
                              }))
                            }
                            placeholder="—"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-slate-400">NWC % of revenue</div>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white tabular-nums"
                            value={pctToInput(editableAssumptions.changeInWCPercentOfRevenue)}
                            onChange={(e) =>
                              setEditableAssumptions((prev) => ({
                                ...prev,
                                changeInWCPercentOfRevenue: inputToPct(e.target.value),
                              }))
                            }
                            placeholder="—"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
