"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { format } from 'date-fns';

interface CompsPreviewProps {
  output: any;
  ticker: string;
  preview?: any;
  onEditPeers?: () => void;
}

interface PeerRow {
  company: string;
  ticker: string;
  marketCap: number | null;
  price: number | null;
  sharesOutstanding: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  ev: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
  isTarget?: boolean;
}

// Format number in USD millions: 0 decimals, thousands separators
function formatMillions(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const normalized = value > 100000000 ? value / 1000000 : value;
  const rounded = Math.round(normalized);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(rounded) + ' (mm)';
}

// Format price per share: 2 decimals max
function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || value <= 0) return '—';
  const rounded = Number(value.toFixed(2));
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded);
}

// Format multiple: 1 decimal
function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || value <= 0) return '—';
  const rounded = Number(value.toFixed(1));
  return `${rounded}x`;
}

export function CompsPreview({ output, ticker, preview, onEditPeers }: CompsPreviewProps) {
  const compsState = useMemo(() => {
    const data = output?.model ?? output ?? {};
    const subjectRaw = data.subject || data.target || data.targetCompany || null;
    const peersRaw = Array.isArray(data.peers || data.comps) ? (data.peers || data.comps) : [];
    const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];

    const mapRow = (row: any, isTarget: boolean): PeerRow => ({
      company: row?.name || row?.companyName || row?.ticker || (isTarget ? ticker : 'Unknown'),
      ticker: row?.ticker || (isTarget ? ticker : '—'),
      marketCap: row?.marketCap ?? null,
      price: row?.price ?? null,
      sharesOutstanding: row?.sharesOutstanding ?? row?.shares ?? null,
      cash: row?.cash ?? null,
      totalDebt: row?.totalDebt ?? row?.debt ?? null,
      netDebt: row?.netDebt ?? null,
      ev: row?.enterpriseValue ?? row?.ev ?? null,
      revenue: row?.revenue ?? null,
      ebitda: row?.ebitda ?? null,
      netIncome: row?.netIncome ?? null,
      evToRevenue: row?.evToRevenue ?? null,
      evToEbitda: row?.evToEbitda ?? null,
      peRatio: row?.peRatio ?? null,
      isTarget,
    });

    let subject: PeerRow | null = subjectRaw ? mapRow(subjectRaw, true) : null;
    let peers: PeerRow[] = peersRaw.map((peer: any) => mapRow(peer, false));

    if ((!subject || peers.length === 0) && preview?.rows) {
      const rows = preview.rows;
      const cols = preview.columns || [];
      const companyIdx = cols.findIndex((c: string) => c === 'Company' || c?.includes('Company'));
      const tickerIdx = cols.findIndex((c: string) => c === 'Ticker' || c?.includes('Ticker'));
      const priceIdx = cols.findIndex((c: string) => c?.includes('Price'));
      const sharesIdx = cols.findIndex((c: string) => c?.includes('Shares'));
      const mcapIdx = cols.findIndex((c: string) => c?.includes('Market Cap'));
      const cashIdx = cols.findIndex((c: string) => c === 'Cash' || c?.includes('Cash'));
      const debtIdx = cols.findIndex((c: string) => c?.includes('Total Debt'));
      const netDebtIdx = cols.findIndex((c: string) => c?.includes('Net Debt'));
      const evIdx = cols.findIndex((c: string) => c?.includes('Enterprise Value') || c === 'EV');
      const revIdx = cols.findIndex((c: string) => c === 'Revenue' || c?.includes('Revenue'));
      const ebitdaIdx = cols.findIndex((c: string) => c === 'EBITDA' || c?.includes('EBITDA'));
      const netIncomeIdx = cols.findIndex((c: string) => c?.includes('Net Income'));
      const evRevIdx = cols.findIndex((c: string) => c?.includes('EV / Revenue') || c?.includes('EV/Revenue'));
      const evEbitdaIdx = cols.findIndex((c: string) => c?.includes('EV / EBITDA') || c?.includes('EV/EBITDA'));
      const peIdx = cols.findIndex((c: string) => c?.includes('P / E') || c?.includes('P/E'));

      const parsedRows: PeerRow[] = rows
        .filter((row: any[]) => row && row.length > 0)
        .map((row: any[], idx: number) => {
          const parseValue = (index: number, isMultiple: boolean = false): number | null => {
            if (index < 0 || row[index] === undefined || row[index] === null) return null;
            const val = parseFloat(String(row[index]));
            if (Number.isNaN(val)) return null;
            if (isMultiple) return val;
            return val;
          };

          return {
            company: row[companyIdx] || 'Unknown',
            ticker: row[tickerIdx] || '—',
            marketCap: parseValue(mcapIdx),
            price: parseValue(priceIdx, true),
            sharesOutstanding: parseValue(sharesIdx),
            cash: parseValue(cashIdx),
            totalDebt: parseValue(debtIdx),
            netDebt: parseValue(netDebtIdx),
            ev: parseValue(evIdx),
            revenue: parseValue(revIdx),
            ebitda: parseValue(ebitdaIdx),
            netIncome: parseValue(netIncomeIdx),
            evToRevenue: parseValue(evRevIdx, true),
            evToEbitda: parseValue(evEbitdaIdx, true),
            peRatio: parseValue(peIdx, true),
            isTarget: idx === 0,
          };
        });

      subject = parsedRows.find((row) => row.isTarget) || null;
      peers = parsedRows.filter((row) => !row.isTarget);
    }

    const medianMultiples = data.medianMultiples || {};
    const meanMultiples = data.meanMultiples || {};
    const minMaxMultiples = data.minMaxMultiples || {};
    const impliedValuation = data.impliedValuation || {};

    return {
      subject,
      peers,
      warnings,
      medianMultiples,
      meanMultiples,
      minMaxMultiples,
      impliedValuation,
      sector: data?.sector || data?.metadata?.sector || null,
      industry: data?.industry || data?.metadata?.industry || null,
    };
  }, [output, preview, ticker]);
  
  const medians = useMemo(() => {
    const evRevenue = compsState.medianMultiples?.evToRevenue ?? null;
    const evEbitda = compsState.medianMultiples?.evToEbitda ?? null;
    const pe = compsState.medianMultiples?.peRatio ?? null;
    return { evRevenue, evEbitda, pe };
  }, [compsState.medianMultiples]);
  
  if (!compsState.subject && compsState.peers.length === 0) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>Trading Comps</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">
            Preview data not available. Download Excel to view the full model.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const currentDate = format(new Date(), 'MMM d, yyyy');
  const subject = compsState.subject;
  const peers = compsState.peers;
  const subjectTotalDebt =
    typeof subject?.totalDebt === 'number' && Number.isFinite(subject.totalDebt) ? subject.totalDebt : null;
  const subjectCash =
    typeof subject?.cash === 'number' && Number.isFinite(subject.cash) ? subject.cash : null;
  const netDebt =
    (typeof subject?.netDebt === 'number' && Number.isFinite(subject.netDebt) ? subject.netDebt : null) ??
    (subjectTotalDebt !== null && subjectCash !== null ? subjectTotalDebt - subjectCash : null);
  const sharesRaw = subject?.sharesOutstanding ?? null;
  const shares = sharesRaw !== null && sharesRaw !== undefined
    ? (sharesRaw < 1000000 ? sharesRaw * 1000000 : sharesRaw)
    : null;
  const implied = compsState.impliedValuation || {};
  const blendedPrice =
    typeof implied.blendedPricePerShare === 'number' && Number.isFinite(implied.blendedPricePerShare)
      ? implied.blendedPricePerShare
      : null;
  const blendedEquity =
    typeof implied.blendedEquityValue === 'number' && Number.isFinite(implied.blendedEquityValue)
      ? implied.blendedEquityValue
      : null;
  const impliedRows = [
    {
      label: 'EV / Revenue',
      multiple: medians.evRevenue,
      metric: subject?.revenue,
      impliedEv: implied.byEvRevenue ?? (medians.evRevenue && subject?.revenue ? medians.evRevenue * subject.revenue : null),
    },
    {
      label: 'EV / EBITDA',
      multiple: medians.evEbitda,
      metric: subject?.ebitda,
      impliedEv: implied.byEvEbitda ?? (medians.evEbitda && subject?.ebitda ? medians.evEbitda * subject.ebitda : null),
    },
    {
      label: 'P / E',
      multiple: medians.pe,
      metric: subject?.netIncome,
      impliedEv: implied.byPe ?? (medians.pe && subject?.netIncome ? medians.pe * subject.netIncome : null),
      isPe: true,
    },
  ].filter((row) => row.multiple !== null && row.metric !== null);

  const impliedPrices = impliedRows
    .map((row) => {
      if (!shares || shares <= 0) return null;
      const equityValue = row.isPe
        ? row.impliedEv
        : row.impliedEv !== null && netDebt !== null
          ? row.impliedEv - netDebt
          : null;
      return equityValue !== null ? (equityValue * 1_000_000) / shares : null;
    })
    .filter((value): value is number => value !== null && !Number.isNaN(value));
  const impliedRange =
    impliedPrices.length >= 2
      ? { min: Math.min(...impliedPrices), max: Math.max(...impliedPrices) }
      : null;
  
  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="border-b border-[var(--cb-border-subtle)] pb-4">
        <h2 className="text-2xl font-bold mb-1">Trading Comps</h2>
        <p className="text-sm text-[var(--cb-text-muted)]">
          As of {currentDate} · Currency: USD · Financials in USD millions (mm) · TTM
        </p>
        <p className="text-xs text-[var(--cb-text-muted)] mt-1">
          Values shown where publicly available
        </p>
      </div>

      {/* Target Snapshot */}
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Target Company Snapshot</CardTitle>
            <p className="text-sm text-[var(--cb-text-muted)]">Reported public data (LTM)</p>
          </div>
          {onEditPeers ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onEditPeers}
                className="text-xs font-semibold text-[var(--cb-primary)] hover:text-[var(--cb-primary)]/80"
              >
                Add peer
              </button>
              <button
                type="button"
                onClick={onEditPeers}
                className="text-xs font-semibold text-[var(--cb-primary)] hover:text-[var(--cb-primary)]/80"
              >
                Edit peers
              </button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">Company</div>
              <div className="text-sm font-semibold">{subject?.company || subject?.ticker || ticker}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">Sector / Industry</div>
              <div className="text-sm">
                {[compsState.sector, compsState.industry].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">Market Cap</div>
              <div className="text-sm font-semibold">{formatMillions(subject?.marketCap ?? null)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">Share Price</div>
              <div className="text-sm font-semibold">{formatPrice(subject?.price ?? null)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">Revenue (LTM)</div>
              <div className="text-sm font-semibold">{formatMillions(subject?.revenue ?? null)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--cb-text-muted)]">EBITDA (LTM)</div>
              <div className="text-sm font-semibold">{formatMillions(subject?.ebitda ?? null)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Selected Peer Group */}
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg">Selected Peer Group</CardTitle>
          <p className="text-sm text-[var(--cb-text-muted)]">USD millions · Reported public data (LTM)</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Company</TableHead>
                  <TableHead className="font-semibold text-right">Market Cap</TableHead>
                  <TableHead className="font-semibold text-right">Revenue (LTM)</TableHead>
                  <TableHead className="font-semibold text-right">EBITDA (LTM)</TableHead>
                  <TableHead className="font-semibold text-right">EV / Revenue</TableHead>
                  <TableHead className="font-semibold text-right">EV / EBITDA</TableHead>
                  <TableHead className="font-semibold text-right">P / E</TableHead>
                  {onEditPeers ? <TableHead className="font-semibold text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {peers.map((comp, idx) => (
                  <TableRow key={idx} className={idx % 2 === 0 ? 'bg-[var(--cb-surface-alt)]' : ''}>
                    <TableCell className="font-medium">{comp.company}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMillions(comp.marketCap)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMillions(comp.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMillions(comp.ebitda)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${comp.evToRevenue ? '' : 'text-[var(--cb-text-muted)]'}`}>
                      {formatMultiple(comp.evToRevenue || (comp.ev && comp.revenue && comp.revenue > 0 ? comp.ev / comp.revenue : null))}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${comp.evToEbitda ? '' : 'text-[var(--cb-text-muted)]'}`}>
                      {formatMultiple(comp.evToEbitda || (comp.ev && comp.ebitda && comp.ebitda > 0 ? comp.ev / comp.ebitda : null))}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${comp.peRatio ? '' : 'text-[var(--cb-text-muted)]'}`}>
                      {formatMultiple(comp.peRatio)}
                    </TableCell>
                    {onEditPeers ? (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[var(--cb-primary)] hover:text-[var(--cb-primary)]/80"
                          onClick={onEditPeers}
                        >
                          Remove
                        </button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {onEditPeers ? (
            <div className="mt-3 text-xs text-[var(--cb-text-muted)]">
              Use “Edit peers” to add or remove companies from the peer set.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Multiple Summary */}
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg">Multiple Summary</CardTitle>
          <p className="text-sm text-[var(--cb-text-muted)]">Based on selected peers</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                label: 'EV / Revenue',
                median: medians.evRevenue,
                mean: compsState.meanMultiples?.evToRevenue,
                min: compsState.minMaxMultiples?.evToRevenue?.min,
                max: compsState.minMaxMultiples?.evToRevenue?.max,
              },
              {
                label: 'EV / EBITDA',
                median: medians.evEbitda,
                mean: compsState.meanMultiples?.evToEbitda,
                min: compsState.minMaxMultiples?.evToEbitda?.min,
                max: compsState.minMaxMultiples?.evToEbitda?.max,
              },
              {
                label: 'P / E',
                median: medians.pe,
                mean: compsState.meanMultiples?.peRatio,
                min: compsState.minMaxMultiples?.peRatio?.min,
                max: compsState.minMaxMultiples?.peRatio?.max,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--cb-border-subtle)] p-4">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-2 text-sm text-[var(--cb-text-muted)]">Median</div>
                <div className="text-lg font-semibold">{formatMultiple(item.median)}</div>
                <div className="mt-2 text-xs text-[var(--cb-text-muted)]">
                  Mean: {formatMultiple(item.mean)} · Min/Max: {formatMultiple(item.min)} / {formatMultiple(item.max)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Implied Valuation */}
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg">Implied Valuation (Target)</CardTitle>
          <p className="text-sm text-[var(--cb-text-muted)]">Median multiples applied to target metrics</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Method</TableHead>
                  <TableHead className="font-semibold text-right">Selected Multiple</TableHead>
                  <TableHead className="font-semibold text-right">Target Metric</TableHead>
                  <TableHead className="font-semibold text-right">Implied EV</TableHead>
                  <TableHead className="font-semibold text-right">Net Debt</TableHead>
                  <TableHead className="font-semibold text-right">Implied Equity</TableHead>
                  <TableHead className="font-semibold text-right">Implied Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {impliedRows.map((row) => {
                  const equityValue = row.isPe
                    ? row.impliedEv
                    : row.impliedEv !== null && netDebt !== null
                      ? row.impliedEv - netDebt
                      : null;
                  const impliedPrice =
                    equityValue !== null && shares && shares > 0 ? (equityValue * 1_000_000) / shares : null;
                  return (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMultiple(row.multiple)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMillions(row.metric)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMillions(row.impliedEv)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMillions(netDebt)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMillions(equityValue)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatPrice(impliedPrice)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {impliedRange ? (
            <div className="mt-3 text-sm text-[var(--cb-text-muted)]">
              Implied price range: {formatPrice(impliedRange.min)} – {formatPrice(impliedRange.max)}
            </div>
          ) : null}
          {blendedPrice !== null ? (
            <div className="mt-2 text-sm text-[var(--cb-text-muted)]">
              Weighted blended implied price (40/40/20):{' '}
              <span className="font-semibold text-[var(--cb-text-primary)]">{formatPrice(blendedPrice)}</span>
              {blendedEquity !== null ? (
                <>
                  {' '}· Implied equity value: <span className="font-semibold text-[var(--cb-text-primary)]">{formatMillions(blendedEquity)}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
      
      {/* Warnings & Context */}
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardContent className="pt-6">
          <div className="text-sm font-semibold mb-2">Warnings & Context</div>
          {compsState.warnings.length > 0 ? (
            <ul className="list-disc pl-4 text-sm text-[var(--cb-text-muted)] space-y-1">
              {compsState.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--cb-text-muted)]">
              No material data warnings reported.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
