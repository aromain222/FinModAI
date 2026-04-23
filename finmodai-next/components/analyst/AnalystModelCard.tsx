'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/types';
import {
  AnalystCompsControls,
  AnalystCustomAssumptionControls,
  AnalystCustomAssumptionSummaryCard,
  AnalystEventSummaryCard,
  AnalystModelVisualization,
  AnalystSmartAssumptionSummaryCard,
  AnalystThreeStatementControls,
  applyCompsTickerAdjustment,
  buildCompsTickerAdjustmentState,
  defaultCompsTickerAdjustment,
  type CompsTickerAdjustment,
} from '@/components/analyst/AnalystModelCardParts';
import {
  createGoogleSheetsPendingWindow,
  downloadWorkbookArtifact,
  fetchWorkbookArtifact,
  openWorkbookInGoogleSheets,
} from '@/lib/workbookOpen';
import { getModelBadgeLabel, replaceThreeStatementLabel } from '@/lib/modelDisplay';
import {
  buildAnalystCustomAssumptionOverrides,
  buildCurrentAssumptionsFromExtractedInputs,
  buildCustomAssumptionResult,
} from '@/lib/analyst/customAssumptions';

function isCurrencyKey(key?: string): boolean {
  if (!key) return false;
  return /(revenue|income|cash|debt|price|value|equity|ebitda|ebit|ev|capex|nwc|inventory|dividend|book|ppe|burn|fundraise|purchase|goodwill|assets|liab|sales|cogs|arr|arpu|cac|marketcap|valuation|proceeds|amount|principal|interest|expense|balance|amortization|buyback|repurchase|cashflow|fcf)/i.test(
    key
  );
}

function isPercentKey(key?: string): boolean {
  if (!key) return false;
  return /(margin|growth|rate|yield|pct|percent|ownership|churn|tax|wacc|discount|terminal|payout|roe|irr|probability)/i.test(
    key
  );
}

function isMultipleKey(key?: string): boolean {
  if (!key) return false;
  return /(multiple|coverage|leverage|moic|ltv|turnover)/i.test(key);
}

function formatAbsoluteCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatModelSharesMillions(value: number): string {
  const actualShares = value * 1_000_000;
  if (Math.abs(actualShares) >= 1_000_000_000) return `${(actualShares / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(actualShares) >= 1_000_000) return `${(actualShares / 1_000_000).toFixed(1)}M`;
  return actualShares.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function usesMillionCurrencyDisplay(modelType: AnalystGeneratedModelPayload['modelType'], key?: string): boolean {
  if (!key) return false;
  if (modelType !== 'DCF' && modelType !== 'THREE_STATEMENT' && modelType !== 'LBO') return false;
  if (isPercentKey(key) || isMultipleKey(key)) return false;
  if (key === 'sharePrice') return false;
  return isCurrencyKey(key);
}

function usesMillionShareDisplay(modelType: AnalystGeneratedModelPayload['modelType'], key?: string): boolean {
  return (modelType === 'DCF' || modelType === 'LBO') && key === 'sharesOutstanding';
}

function prettifySourceType(value: string): string {
  return value.replace(/_/g, ' ');
}

export function formatAnalystModelValue(
  value: unknown,
  key?: string,
  modelType?: AnalystGeneratedModelPayload['modelType'],
  fieldDisplayMap?: AnalystGeneratedModelPayload['fieldDisplayMap'],
): string {
  const semantic = key ? fieldDisplayMap?.[key] : undefined;
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return value
        .map((item) => {
          const row = item as Record<string, unknown>;
          return String(row.ticker ?? row.name ?? row.target ?? row.transaction ?? 'Structured row');
        })
        .join(', ');
    }
    return value.map((item) => formatAnalystModelValue(item, key, modelType, fieldDisplayMap)).join(', ');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
      .slice(0, 4)
      .map(([entryKey, item]) => `${entryKey}: ${formatAnalystModelValue(item, entryKey, modelType, fieldDisplayMap)}`);
    return entries.length > 0 ? entries.join(', ') : 'Structured object';
  }
  if (typeof value === 'number') {
    if (semantic === 'percent') {
      const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    }
    if (semantic === 'model_millions_shares') {
      return formatModelSharesMillions(value);
    }
    if (semantic === 'model_millions_currency') {
      return formatAbsoluteCurrencyCompact(value * 1_000_000);
    }
    if (semantic === 'multiple') {
      return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
    }
    if (semantic === 'currency') {
      return `$${value.toLocaleString('en-US', {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`;
    }
    if (isPercentKey(key)) {
      const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    }
    if (modelType && usesMillionShareDisplay(modelType, key)) {
      return formatModelSharesMillions(value);
    }
    if (modelType && usesMillionCurrencyDisplay(modelType, key)) {
      return formatAbsoluteCurrencyCompact(value * 1_000_000);
    }
    if (isMultipleKey(key)) return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
    if (isCurrencyKey(key)) {
      return `$${value.toLocaleString('en-US', {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`;
    }
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US');
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value);
}

function ObjectGrid(props: {
  title: string;
  values: Record<string, unknown>;
  emptyMessage: string;
  modelType?: AnalystGeneratedModelPayload['modelType'];
  fieldDisplayMap?: AnalystGeneratedModelPayload['fieldDisplayMap'];
}) {
  const entries = Object.entries(props.values);
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">{props.title}</div>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{key}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{formatAnalystModelValue(value, key, props.modelType, props.fieldDisplayMap)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ChartSpec =
  | {
      kind: 'line';
      title: string;
      data: Array<Record<string, string | number>>;
      lines: Array<{ key: string; label: string; color: string; valueType?: 'currency' | 'percent' | 'number' }>;
      yType?: 'currency' | 'percent' | 'number';
    }
  | {
      kind: 'bar';
      title: string;
      data: Array<Record<string, string | number>>;
      bars: Array<{ key: string; label: string; color: string; valueType?: 'currency' | 'percent' | 'number' }>;
      yType?: 'currency' | 'percent' | 'number';
    };


function normalizeModelTypeForReport(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'three-statement';
    case 'CAP_TABLE':
      return 'cap-table';
    case 'SAAS_OPERATING_MODEL':
      return 'saas-operating-model';
    case 'COMPS':
      return 'comps';
    case 'PRECEDENTS':
      return 'precedents';
    case 'LBO':
      return 'lbo';
    case 'FOOTBALL_FIELD':
      return 'football-field';
    case 'MERGER':
      return 'merger';
    case 'DEBT_CAPACITY_LITE':
      return 'debt-capacity-lite';
    default:
      return String(modelType).toLowerCase().replace(/_/g, '-');
  }
}

function displayWorkspaceTitle(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Forecast Model Workspace';
    case 'COMPS':
      return 'Trading Comparables Workspace';
    case 'FOOTBALL_FIELD':
      return 'Football Field Workspace';
    case 'LBO':
      return 'LBO Underwriting Workspace';
    default:
      return 'Model Template Workspace';
  }
}

function displayModelBadge(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return getModelBadgeLabel(modelType);
    case 'COMPS':
      return 'TRADING COMPARABLES';
    case 'FOOTBALL_FIELD':
      return 'FOOTBALL FIELD';
    case 'LBO':
      return 'LBO UNDERWRITING';
    default:
      return modelType;
  }
}

function displayModelTitle(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return replaceThreeStatementLabel(payload.title);
    case 'COMPS':
      return payload.title.replace(/Comparable Company Analysis/gi, 'Trading Comparables');
    case 'FOOTBALL_FIELD':
      return payload.title.replace(/Football Field/gi, 'Valuation Football Field');
    case 'LBO':
      return payload.title.replace(/\bLBO\b/gi, 'LBO Underwriting');
    default:
      return payload.title;
  }
}

function defaultWorkbookFilename(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return 'forecast_model_analyst_chat.xlsx';
    case 'COMPS':
      return 'trading_comparables_analyst_chat.xlsx';
    case 'FOOTBALL_FIELD':
      return 'valuation_football_field_analyst_chat.xlsx';
    case 'LBO':
      return 'lbo_underwriting_analyst_chat.xlsx';
    default:
      return `${payload.modelType}_Analyst_Chat.xlsx`;
  }
}

function defaultReportFilename(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return 'forecast_model_capitalbase_report.pdf';
    case 'COMPS':
      return 'trading_comparables_capitalbase_report.pdf';
    case 'FOOTBALL_FIELD':
      return 'valuation_football_field_capitalbase_report.pdf';
    case 'LBO':
      return 'lbo_underwriting_capitalbase_report.pdf';
    default:
      return `${payload.modelType.toLowerCase()}_capitalbase_report.pdf`;
  }
}

function artifactTypeNote(modelType: AnalystGeneratedModelPayload['modelType']): string | null {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Artifact type: Forecast model.';
    case 'COMPS':
      return 'Artifact type: Trading comparables.';
    case 'FOOTBALL_FIELD':
      return 'Artifact type: Valuation football field.';
    case 'LBO':
      return 'Artifact type: LBO underwriting.';
    default:
      return null;
  }
}

function pdfActionLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Download Forecast PDF';
    case 'COMPS':
      return 'Download Comps PDF';
    case 'FOOTBALL_FIELD':
      return 'Download Football Field PDF';
    case 'LBO':
      return 'Download LBO PDF';
    default:
      return 'Download PDF Report';
  }
}

function excelActionLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Download Forecast Excel';
    case 'COMPS':
      return 'Download Comps Excel';
    case 'FOOTBALL_FIELD':
      return 'Download Football Field Excel';
    case 'LBO':
      return 'Download LBO Excel';
    default:
      return 'Download Excel';
  }
}

const DynamicEventSummaryCard = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystEventSummaryCard),
);
const DynamicSmartAssumptionSummaryCard = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystSmartAssumptionSummaryCard),
);
const DynamicCustomAssumptionSummaryCard = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystCustomAssumptionSummaryCard),
);
const DynamicCustomAssumptionControls = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystCustomAssumptionControls),
);
const DynamicThreeStatementControls = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystThreeStatementControls),
);
const DynamicCompsControls = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystCompsControls),
);
const DynamicModelVisualization = dynamic(
  () => import('@/components/analyst/AnalystModelCardParts').then((mod) => mod.AnalystModelVisualization),
);

export function AnalystModelCard({
  payload,
  onAdjust,
  onAdjustFromEvent,
  onSuggestSmartAssumptions,
}: {
  payload: AnalystGeneratedModelPayload;
  onAdjust?: (adjustment: AnalystStructuredModelAdjustment) => Promise<void>;
  onAdjustFromEvent?: () => void;
  onSuggestSmartAssumptions?: () => Promise<void>;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isOpeningInSheets, setIsOpeningInSheets] = useState(false);
  const [sheetsNotice, setSheetsNotice] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [showCustomAssumptions, setShowCustomAssumptions] = useState(false);
  const [isApplyingControls, setIsApplyingControls] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [isApplyingEventShock, setIsApplyingEventShock] = useState(false);
  const [isApplyingCustomAssumptions, setIsApplyingCustomAssumptions] = useState(false);
  const [customAssumptionError, setCustomAssumptionError] = useState<string | null>(null);
  const [isApplyingSmartAssumptions, setIsApplyingSmartAssumptions] = useState(false);
  const [smartAssumptionError, setSmartAssumptionError] = useState<string | null>(null);
  const [smartAssumptionNotice, setSmartAssumptionNotice] = useState<string | null>(null);
  const exportRunId = payload.recentRun?.runId?.trim() ?? '';
  const exportVersionNumber = payload.recentRun?.versionNumber ?? undefined;
  const canExportWorkbook =
    exportRunId.length > 0 ||
    (typeof payload.title === 'string' &&
      Array.isArray(payload.tabs) &&
      Array.isArray(payload.keyOutputs) &&
      payload.extractedInputs !== null &&
      typeof payload.extractedInputs === 'object');
  const threeStatementInputs =
    payload.modelType === 'THREE_STATEMENT' ? (payload.extractedInputs as Record<string, unknown>) : null;
  const compsInputs =
    payload.modelType === 'COMPS' ? (payload.extractedInputs as Record<string, unknown>) : null;
  const compsSubject =
    payload.modelType === 'COMPS' && compsInputs?.subject && typeof compsInputs.subject === 'object'
      ? (compsInputs.subject as Record<string, unknown>)
      : null;
  const compsPeers = useMemo(
    () =>
      payload.modelType === 'COMPS' && Array.isArray(compsInputs?.peers)
        ? (compsInputs.peers as Array<Record<string, unknown>>)
        : [],
    [payload.modelType, compsInputs],
  );
  const [revenueGrowthShiftBps, setRevenueGrowthShiftBps] = useState(0);
  const [grossMarginPct, setGrossMarginPct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.grossMargin === 'number'
      ? Number(threeStatementInputs.grossMargin) * 100
      : 0,
  );
  const [opexPct, setOpexPct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.opexPctRevenue === 'number'
      ? Number(threeStatementInputs.opexPctRevenue) * 100
      : 0,
  );
  const [taxRatePct, setTaxRatePct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.taxRate === 'number'
      ? Number(threeStatementInputs.taxRate) * 100
      : 0,
  );
  const [compsTickerAdjustments, setCompsTickerAdjustments] = useState<Record<string, CompsTickerAdjustment>>({});
  const [compsAddPeers, setCompsAddPeers] = useState('');
  const [compsRemovePeers, setCompsRemovePeers] = useState('');
  const [compsEvRevenueMultiple, setCompsEvRevenueMultiple] = useState(0);
  const [compsEvEbitdaMultiple, setCompsEvEbitdaMultiple] = useState(0);
  const [compsPeMultiple, setCompsPeMultiple] = useState(0);
  const currentAssumptions = useMemo(
    () => buildCurrentAssumptionsFromExtractedInputs(payload.extractedInputs),
    [payload.extractedInputs],
  );
  const companyContextLine = useMemo(() => {
    const inputs = payload.extractedInputs as Record<string, unknown>;
    const companyName = typeof inputs.companyName === 'string' ? inputs.companyName : null;
    const ticker = typeof inputs.ticker === 'string' ? inputs.ticker : null;
    const companyType = typeof inputs.companyType === 'string' ? inputs.companyType : null;
    return [companyName, ticker, companyType].filter((value): value is string => Boolean(value)).join(' • ');
  }, [payload.extractedInputs]);
  const leadTakeaway = payload.narrativeBlocks[0]?.body?.trim() ?? null;
  const [customRevenueGrowth, setCustomRevenueGrowth] = useState(
    typeof currentAssumptions.revenue_growth === 'number' ? (currentAssumptions.revenue_growth * 100).toFixed(1) : '',
  );
  const [customOperatingMargin, setCustomOperatingMargin] = useState(
    typeof currentAssumptions.operating_margin === 'number' ? (currentAssumptions.operating_margin * 100).toFixed(1) : '',
  );
  const [customWacc, setCustomWacc] = useState(
    typeof currentAssumptions.wacc === 'number' ? (currentAssumptions.wacc * 100).toFixed(1) : '',
  );
  const [customTerminalGrowth, setCustomTerminalGrowth] = useState(
    typeof currentAssumptions.terminal_growth_rate === 'number'
      ? (currentAssumptions.terminal_growth_rate * 100).toFixed(1)
      : '',
  );
  useEffect(() => {
    if (payload.modelType !== 'THREE_STATEMENT') return;
    const inputs = payload.extractedInputs as Record<string, unknown>;
    setRevenueGrowthShiftBps(0);
    setGrossMarginPct(typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0);
    setOpexPct(typeof inputs.opexPctRevenue === 'number' ? Number(inputs.opexPctRevenue) * 100 : 0);
    setTaxRatePct(typeof inputs.taxRate === 'number' ? Number(inputs.taxRate) * 100 : 0);
    setControlsError(null);
  }, [payload]);

  useEffect(() => {
    setCustomRevenueGrowth(
      typeof currentAssumptions.revenue_growth === 'number' ? (currentAssumptions.revenue_growth * 100).toFixed(1) : '',
    );
    setCustomOperatingMargin(
      typeof currentAssumptions.operating_margin === 'number' ? (currentAssumptions.operating_margin * 100).toFixed(1) : '',
    );
    setCustomWacc(typeof currentAssumptions.wacc === 'number' ? (currentAssumptions.wacc * 100).toFixed(1) : '');
    setCustomTerminalGrowth(
      typeof currentAssumptions.terminal_growth_rate === 'number'
        ? (currentAssumptions.terminal_growth_rate * 100).toFixed(1)
        : '',
    );
    setCustomAssumptionError(null);
  }, [currentAssumptions]);

  const adjustedThreeStatementRevenueGrowth = useMemo(() => {
    if (payload.modelType !== 'THREE_STATEMENT') return [];
    const inputs = payload.extractedInputs as Record<string, unknown>;
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    return revenueGrowth.map((value) =>
      Math.min(0.3, Math.max(-0.05, Number(value) + revenueGrowthShiftBps / 10000)),
    );
  }, [payload, revenueGrowthShiftBps]);

  const hasThreeStatementControlChanges =
    payload.modelType === 'THREE_STATEMENT' &&
    (revenueGrowthShiftBps !== 0 ||
      Math.abs(grossMarginPct - ((Number(threeStatementInputs?.grossMargin ?? 0)) * 100)) > 0.001 ||
      Math.abs(opexPct - ((Number(threeStatementInputs?.opexPctRevenue ?? 0)) * 100)) > 0.001 ||
      Math.abs(taxRatePct - ((Number(threeStatementInputs?.taxRate ?? 0)) * 100)) > 0.001);

  const adjustedCompsSubject = useMemo(() => {
    if (payload.modelType !== 'COMPS' || !compsSubject) return null;
    const ticker = typeof compsSubject.ticker === 'string' ? compsSubject.ticker : '';
    return applyCompsTickerAdjustment(compsSubject, compsTickerAdjustments[ticker]);
  }, [payload, compsSubject, compsTickerAdjustments]);

  const adjustedCompsPeers = useMemo(() => {
    if (payload.modelType !== 'COMPS') return [];
    return compsPeers.map((peer) => {
      const ticker = typeof peer.ticker === 'string' ? peer.ticker : '';
      return applyCompsTickerAdjustment(peer, compsTickerAdjustments[ticker]);
    });
  }, [payload, compsPeers, compsTickerAdjustments]);

  const compsMultipleBaselines = useMemo(() => {
    if (payload.modelType !== 'COMPS') {
      return { evToRevenue: 0, evToEbitda: 0, peRatio: 0 };
    }
    const peers = Array.isArray(compsInputs?.peers) ? (compsInputs.peers as Array<Record<string, unknown>>) : [];
    const median = (values: number[]) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((left, right) => left - right);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const multipleValues = {
      evToRevenue: peers
        .map((peer) =>
          Number(
            peer.evToRevenue ??
              (peer.enterpriseValue && peer.revenue ? Number(peer.enterpriseValue) / Number(peer.revenue) : NaN),
          ),
        )
        .filter(Number.isFinite),
      evToEbitda: peers
        .map((peer) =>
          Number(
            peer.evToEbitda ??
              (peer.enterpriseValue && peer.ebitda ? Number(peer.enterpriseValue) / Number(peer.ebitda) : NaN),
          ),
        )
        .filter(Number.isFinite),
      peRatio: peers
        .map((peer) =>
          Number(
            peer.peRatio ?? (peer.marketCap && peer.netIncome ? Number(peer.marketCap) / Number(peer.netIncome) : NaN),
          ),
        )
        .filter(Number.isFinite),
    };
    const selectedMultiples =
      compsInputs?.selectedMultiples && typeof compsInputs.selectedMultiples === 'object'
        ? (compsInputs.selectedMultiples as Record<string, unknown>)
        : null;
    return {
      evToRevenue:
        typeof selectedMultiples?.evToRevenue === 'number'
          ? Number(selectedMultiples.evToRevenue)
          : median(multipleValues.evToRevenue),
      evToEbitda:
        typeof selectedMultiples?.evToEbitda === 'number'
          ? Number(selectedMultiples.evToEbitda)
          : median(multipleValues.evToEbitda),
      peRatio:
        typeof selectedMultiples?.peRatio === 'number'
          ? Number(selectedMultiples.peRatio)
          : median(multipleValues.peRatio),
    };
  }, [payload, compsInputs]);

  useEffect(() => {
    if (payload.modelType !== 'COMPS') return;
    setShowControls(false);
    setCompsTickerAdjustments(buildCompsTickerAdjustmentState(compsSubject, compsPeers));
    setCompsAddPeers('');
    setCompsRemovePeers('');
    setCompsEvRevenueMultiple(compsMultipleBaselines.evToRevenue);
    setCompsEvEbitdaMultiple(compsMultipleBaselines.evToEbitda);
    setCompsPeMultiple(compsMultipleBaselines.peRatio);
    setControlsError(null);
  }, [payload, compsMultipleBaselines, compsSubject, compsPeers]);

  const hasCompsControlChanges =
    payload.modelType === 'COMPS' &&
    (Object.values(compsTickerAdjustments).some((adjustment) =>
      adjustment.revenueShiftPct !== 0 ||
      adjustment.ebitdaShiftPct !== 0 ||
      adjustment.priceShiftPct !== 0 ||
      adjustment.sharesShiftPct !== 0
    ) ||
      compsAddPeers.trim().length > 0 ||
      compsRemovePeers.trim().length > 0 ||
      Math.abs(compsEvRevenueMultiple - compsMultipleBaselines.evToRevenue) > 0.0001 ||
      Math.abs(compsEvEbitdaMultiple - compsMultipleBaselines.evToEbitda) > 0.0001 ||
      Math.abs(compsPeMultiple - compsMultipleBaselines.peRatio) > 0.0001);

  function updateCompsTickerAdjustment(
    ticker: string,
    patch: Partial<CompsTickerAdjustment>,
  ) {
    setCompsTickerAdjustments((current) => ({
      ...current,
      [ticker]: {
        ...(current[ticker] ?? defaultCompsTickerAdjustment()),
        ...patch,
      },
    }));
  }

  async function handleDownload() {
    if (isDownloading) return;
    if (!canExportWorkbook) {
      setDownloadError('This model needs to be rerun before workbook export is available.');
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);
    setSheetsNotice(null);

    try {
      const exportRequestBody =
        exportRunId.length > 0
          ? {
              runId: exportRunId,
              versionNumber: exportVersionNumber,
            }
          : {
              payload,
            };
      const workbook = await fetchWorkbookArtifact(
        '/api/analyst-chat/model-export',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: JSON.stringify(exportRequestBody),
        },
        defaultWorkbookFilename(payload),
      );

      downloadWorkbookArtifact(workbook);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download workbook.');
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleOpenInGoogleSheets() {
    if (isOpeningInSheets) return;
    if (!canExportWorkbook) {
      setDownloadError('This model needs to be rerun before workbook export is available.');
      return;
    }

    setIsOpeningInSheets(true);
    setDownloadError(null);
    setSheetsNotice(null);
    const pendingWindow = typeof window !== 'undefined' ? createGoogleSheetsPendingWindow(window) : null;

    try {
      const exportRequestBody =
        exportRunId.length > 0
          ? {
              runId: exportRunId,
              versionNumber: exportVersionNumber,
            }
          : {
              payload,
            };
      const workbook = await fetchWorkbookArtifact(
        '/api/analyst-chat/model-export',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: JSON.stringify(exportRequestBody),
        },
        defaultWorkbookFilename(payload),
      );

      const result = await openWorkbookInGoogleSheets(workbook, { pendingWindow });
      if (result.status === 'downloaded_fallback') {
        setSheetsNotice(result.message);
      }
    } catch (error) {
      if (pendingWindow && !pendingWindow.closed) {
        pendingWindow.close();
      }
      setDownloadError(error instanceof Error ? error.message : 'Unable to open workbook in Google Sheets.');
    } finally {
      setIsOpeningInSheets(false);
    }
  }

  async function handleGenerateReport() {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      const response = await fetch('/api/generateReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:
            typeof (payload.extractedInputs as Record<string, unknown>).ticker === 'string'
              ? (payload.extractedInputs as Record<string, unknown>).ticker
              : undefined,
          companyName:
            typeof (payload.extractedInputs as Record<string, unknown>).companyName === 'string'
              ? (payload.extractedInputs as Record<string, unknown>).companyName
              : payload.title,
          asOfDate: payload.provenanceSummary.asOfDate,
          modelType: normalizeModelTypeForReport(payload.modelType),
          modelData: {
            extractedInputs: payload.extractedInputs,
            defaultsUsed: payload.defaultsUsed,
            narrativeBlocks: payload.narrativeBlocks,
            provenanceSummary: payload.provenanceSummary,
            comparisonSummary: payload.comparisonSummary,
            scenarioContext: payload.scenarioContext,
          },
          reportInput: {
            scenarioContext: payload.scenarioContext ?? undefined,
            highLevelNotes: [
              artifactTypeNote(payload.modelType),
              payload.scenarioContext ? `Scenario context: ${payload.scenarioContext}` : null,
              `Prompt run: ${payload.prompt}`,
              payload.narrativeBlocks.map((block) => `${block.title}: ${block.body}`).join(' '),
            ]
              .filter((item): item is string => Boolean(item))
              .join(' '),
          },
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to generate PDF report.');
      }

      const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : null;
      if (!pdfBase64) {
        throw new Error('Report generated but PDF output was missing.');
      }

      const binary = atob(pdfBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = defaultReportFilename(payload);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleApplyThreeStatementControls() {
    if (!onAdjust || payload.modelType !== 'THREE_STATEMENT' || isApplyingControls || !hasThreeStatementControlChanges) return;
    setIsApplyingControls(true);
    setControlsError(null);
    try {
      await onAdjust({
        changes: {
          revenueGrowth: adjustedThreeStatementRevenueGrowth,
          grossMargin: grossMarginPct / 100,
          opexPctRevenue: opexPct / 100,
          taxRate: taxRatePct / 100,
        },
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply model controls.');
    } finally {
      setIsApplyingControls(false);
    }
  }

  async function handleApplyThreeStatementEventShock(prompt: string) {
    if (!onAdjust || payload.modelType !== 'THREE_STATEMENT' || isApplyingControls || isApplyingEventShock) return;
    setIsApplyingEventShock(true);
    setControlsError(null);
    try {
      await onAdjust({
        changes: {},
        prompt,
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply event shock.');
    } finally {
      setIsApplyingEventShock(false);
    }
  }

  async function handleApplyCompsControls() {
    if (!onAdjust || payload.modelType !== 'COMPS' || isApplyingControls || !hasCompsControlChanges || !adjustedCompsSubject) return;
    setIsApplyingControls(true);
    setControlsError(null);
    try {
      const peerPrompt = [
        compsAddPeers.trim().length > 0 ? `add ${compsAddPeers.trim()} to peers` : null,
        compsRemovePeers.trim().length > 0 ? `remove ${compsRemovePeers.trim()} from peers` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join('. ');
      await onAdjust({
        changes: {
          subject: adjustedCompsSubject,
          peers: adjustedCompsPeers,
          selectedMultiples: {
            evToRevenue: compsEvRevenueMultiple,
            evToEbitda: compsEvEbitdaMultiple,
            peRatio: compsPeMultiple,
          },
        },
        prompt: peerPrompt || undefined,
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply comps controls.');
    } finally {
      setIsApplyingControls(false);
    }
  }

  function handleResetThreeStatementControls() {
    if (payload.modelType !== 'THREE_STATEMENT') return;
    const inputs = payload.extractedInputs as Record<string, unknown>;
    setRevenueGrowthShiftBps(0);
    setGrossMarginPct(typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0);
    setOpexPct(typeof inputs.opexPctRevenue === 'number' ? Number(inputs.opexPctRevenue) * 100 : 0);
    setTaxRatePct(typeof inputs.taxRate === 'number' ? Number(inputs.taxRate) * 100 : 0);
    setControlsError(null);
  }

  function handleResetCompsControls() {
    if (payload.modelType !== 'COMPS') return;
    setCompsTickerAdjustments(buildCompsTickerAdjustmentState(compsSubject, compsPeers));
    setCompsAddPeers('');
    setCompsRemovePeers('');
    setCompsEvRevenueMultiple(compsMultipleBaselines.evToRevenue);
    setCompsEvEbitdaMultiple(compsMultipleBaselines.evToEbitda);
    setCompsPeMultiple(compsMultipleBaselines.peRatio);
    setControlsError(null);
  }

  async function handleApplyCustomAssumptions() {
    if (!onAdjust || isApplyingCustomAssumptions) return;

    const { summary, errors } = buildCustomAssumptionResult({
      companyName:
        'companyName' in payload.extractedInputs && typeof payload.extractedInputs.companyName === 'string'
          ? payload.extractedInputs.companyName
          : payload.title,
      ticker:
        'ticker' in payload.extractedInputs && typeof payload.extractedInputs.ticker === 'string'
          ? payload.extractedInputs.ticker
          : null,
      currentAssumptions,
      requestedValues: {
        revenue_growth: customRevenueGrowth.trim().length > 0 ? Number(customRevenueGrowth) / 100 : undefined,
        operating_margin: customOperatingMargin.trim().length > 0 ? Number(customOperatingMargin) / 100 : undefined,
        wacc: customWacc.trim().length > 0 ? Number(customWacc) / 100 : undefined,
        terminal_growth_rate: customTerminalGrowth.trim().length > 0 ? Number(customTerminalGrowth) / 100 : undefined,
      },
    });

    if (!summary) {
      setCustomAssumptionError(errors[0] ?? 'No valid custom assumptions were provided.');
      return;
    }

    const changes = buildAnalystCustomAssumptionOverrides(
      payload.extractedInputs as Record<string, unknown>,
      Object.fromEntries(summary.changedDrivers.map((driver) => [driver.driver, driver.new])),
    );

    if (Object.keys(changes).length === 0) {
      setCustomAssumptionError('The active model does not expose compatible assumption fields for those inputs.');
      return;
    }

    setIsApplyingCustomAssumptions(true);
    setCustomAssumptionError(null);
    try {
      await onAdjust({
        changes,
        customAssumptionSummary: summary,
      });
    } catch (error) {
      setCustomAssumptionError(error instanceof Error ? error.message : 'Unable to apply custom assumptions.');
    } finally {
      setIsApplyingCustomAssumptions(false);
    }
  }

  async function handleSuggestSmartAssumptionsClick() {
    if (!onSuggestSmartAssumptions || isApplyingSmartAssumptions) return;

    setIsApplyingSmartAssumptions(true);
    setSmartAssumptionError(null);
    setSmartAssumptionNotice(null);
    try {
      await onSuggestSmartAssumptions();
      setSmartAssumptionNotice('Applied smart assumptions to the active model.');
    } catch (error) {
      setSmartAssumptionError(error instanceof Error ? error.message : 'Unable to derive smart assumptions.');
    } finally {
      setIsApplyingSmartAssumptions(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{displayWorkspaceTitle(payload.modelType)}</CardTitle>
            <CardDescription>{displayModelTitle(payload)}</CardDescription>
            <div className="text-xs text-[var(--cb-text-muted)]">
              Use Google Sheets to bypass local `.xlsx` app associations like Apple Numbers.
            </div>
            {!canExportWorkbook ? (
              <div className="text-xs text-[#fca5a5]">
                Workbook export is unavailable for this artifact until the model is rerun and saved server-side.
              </div>
            ) : null}
            {payload.modelType === 'COMPS' && payload.scenarioContext ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline">Scenario</Badge>
                <span className="text-xs text-[var(--cb-text-muted)]">{payload.scenarioContext}</span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{displayModelBadge(payload.modelType)}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleGenerateReport()} disabled={isGeneratingReport}>
              {isGeneratingReport ? 'Generating PDF…' : pdfActionLabel(payload.modelType)}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleOpenInGoogleSheets()} disabled={isOpeningInSheets || !canExportWorkbook}>
              {isOpeningInSheets ? 'Opening Google Sheets…' : 'Open in Google Sheets'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading || !canExportWorkbook}>
              {isDownloading ? 'Preparing Excel…' : excelActionLabel(payload.modelType)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSuggestSmartAssumptionsClick()}
              disabled={!onSuggestSmartAssumptions || isApplyingSmartAssumptions}
            >
              {isApplyingSmartAssumptions ? 'Applying smart assumptions…' : 'Suggest smart assumptions'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {downloadError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {downloadError}
          </div>
        ) : null}
        {sheetsNotice ? (
          <div className="rounded-xl border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] px-3 py-2 text-sm text-[#fde68a]">
            {sheetsNotice}
          </div>
        ) : null}
        {reportError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {reportError}
          </div>
        ) : null}
        {smartAssumptionError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {smartAssumptionError}
          </div>
        ) : null}
        {smartAssumptionNotice ? (
          <div className="rounded-xl border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] px-3 py-2 text-sm text-[#bbf7d0]">
            {smartAssumptionNotice}
          </div>
        ) : null}

        {(companyContextLine || leadTakeaway) ? (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Model Summary</div>
            {companyContextLine ? (
              <div className="text-sm font-medium text-[var(--cb-text-primary)]">{companyContextLine}</div>
            ) : null}
            {leadTakeaway ? (
              <p className="mt-2 text-sm leading-6 text-[var(--cb-text-primary)]">{leadTakeaway}</p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Decision Outputs</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.keyOutputs.join(', ')}</p>
        </div>

        <DynamicSmartAssumptionSummaryCard payload={payload} />
        <DynamicCustomAssumptionSummaryCard summary={payload.customAssumptionSummary} />

        <DynamicModelVisualization payload={payload} />

        <details className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--cb-text-primary)]">Adjust model</summary>
          <div className="mt-3 space-y-4">
            <DynamicEventSummaryCard payload={payload} onAdjustFromEvent={onAdjustFromEvent} />
            <DynamicCustomAssumptionControls
              visible={showCustomAssumptions}
              onToggle={() => setShowCustomAssumptions((value) => !value)}
              onApply={handleApplyCustomAssumptions}
              revenueGrowth={customRevenueGrowth}
              setRevenueGrowth={setCustomRevenueGrowth}
              operatingMargin={customOperatingMargin}
              setOperatingMargin={setCustomOperatingMargin}
              wacc={customWacc}
              setWacc={setCustomWacc}
              terminalGrowth={customTerminalGrowth}
              setTerminalGrowth={setCustomTerminalGrowth}
              error={customAssumptionError}
              isApplying={isApplyingCustomAssumptions}
            />

            {payload.modelType === 'THREE_STATEMENT' ? (
              <DynamicThreeStatementControls
                visible={showControls}
                onToggle={() => setShowControls((value) => !value)}
                onReset={handleResetThreeStatementControls}
                onApply={handleApplyThreeStatementControls}
                onShock={handleApplyThreeStatementEventShock}
                grossMarginPct={grossMarginPct}
                setGrossMarginPct={setGrossMarginPct}
                opexPct={opexPct}
                setOpexPct={setOpexPct}
                taxRatePct={taxRatePct}
                setTaxRatePct={setTaxRatePct}
                revenueGrowthShiftBps={revenueGrowthShiftBps}
                setRevenueGrowthShiftBps={setRevenueGrowthShiftBps}
                adjustedRevenueGrowth={adjustedThreeStatementRevenueGrowth}
                hasChanges={hasThreeStatementControlChanges}
                isApplyingControls={isApplyingControls}
                isApplyingEventShock={isApplyingEventShock}
                controlsError={controlsError}
                canAdjust={Boolean(onAdjust)}
              />
            ) : null}

            {payload.modelType === 'COMPS' ? (
              <DynamicCompsControls
                visible={showControls}
                onToggle={() => setShowControls((value) => !value)}
                onReset={handleResetCompsControls}
                onApply={handleApplyCompsControls}
                rows={[adjustedCompsSubject, ...adjustedCompsPeers].filter((row): row is Record<string, unknown> => Boolean(row))}
                adjustments={compsTickerAdjustments}
                updateAdjustment={updateCompsTickerAdjustment}
                addPeers={compsAddPeers}
                setAddPeers={setCompsAddPeers}
                removePeers={compsRemovePeers}
                setRemovePeers={setCompsRemovePeers}
                evRevenueMultiple={compsEvRevenueMultiple}
                setEvRevenueMultiple={setCompsEvRevenueMultiple}
                evEbitdaMultiple={compsEvEbitdaMultiple}
                setEvEbitdaMultiple={setCompsEvEbitdaMultiple}
                peMultiple={compsPeMultiple}
                setPeMultiple={setCompsPeMultiple}
                subjectTicker={typeof adjustedCompsSubject?.ticker === 'string' ? adjustedCompsSubject.ticker : null}
                hasChanges={hasCompsControlChanges}
                isApplyingControls={isApplyingControls}
                controlsError={controlsError}
              />
            ) : null}
          </div>
        </details>

        <details className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--cb-text-primary)]">Model details</summary>
          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Template Layout</div>
              <div className="flex flex-wrap gap-2">
                {payload.tabs.map((tab) => (
                  <Badge key={tab} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                    {tab}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Source Provenance</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Source Type</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{prettifySourceType(payload.provenanceSummary.sourceType)}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">As Of</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{payload.provenanceSummary.asOfDate ?? 'n/a'}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Sources</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                      {payload.provenanceSummary.sources.join(', ') || 'n/a'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Fallback Used</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                      {payload.provenanceSummary.fallbackUsed.join(', ') || 'None'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Version Context</div>
                <div className="grid gap-3">
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Saved Run</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                      {payload.recentRun ? `Version ${payload.recentRun.versionNumber ?? 'n/a'} • ${payload.recentRun.status}` : 'No saved analyst chat run'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Assumption Changes</div>
                    <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                      {payload.comparisonSummary?.changedKeys.length
                        ? payload.comparisonSummary.changedKeys.join(', ')
                        : 'No tracked changes versus prior saved version'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ObjectGrid title="Extracted Inputs" values={payload.extractedInputs as Record<string, unknown>} emptyMessage="No structured inputs were extracted." modelType={payload.modelType} fieldDisplayMap={payload.fieldDisplayMap} />
              <ObjectGrid title="Defaults Used" values={payload.defaultsUsed} emptyMessage="No defaults were required." modelType={payload.modelType} />
            </div>

            <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Analyst Framing</div>
              <div className="space-y-3">
                {payload.narrativeBlocks.map((block) => (
                  <div key={block.title} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{block.title}</div>
                    <div className="mt-2 text-sm leading-6 text-[var(--cb-text-primary)]">{block.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
