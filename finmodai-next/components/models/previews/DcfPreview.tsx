"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DCFOutput } from '@/lib/models/outputTypes';
import { formatMoney, formatPrice, formatPct } from '@/lib/models/formatHelpers';
import { TrendingUp, DollarSign, Building2, Calculator } from 'lucide-react';
import { PreviewShell } from './PreviewShell';

interface DcfPreviewProps {
  output: DCFOutput;
  ticker: string;
  onEditAssumptions?: () => void;
  rawDcfOutput?: any;
}

/**
 * Clean, Modern DCF Preview - Built from Scratch
 * 
 * Simple, clear layout with key metrics front and center
 */
export function DcfPreview({ output, ticker }: DcfPreviewProps) {
  const safeTicker = ticker ?? (output as any)?.ticker ?? '';
  // Safely extract valuation data
  const valuation = output?.valuation || {};
  const bridge = output?.valuationBridge || {};
  const assumptions = output?.assumptions || {};
  const projections = output?.projections || {};

  const impliedValue = valuation.impliedValuePerShare ?? null;
  const enterpriseValue = valuation.enterpriseValue ?? null;
  const equityValue = valuation.equityValue ?? null;
  const currentPrice = valuation.currentPrice ?? null;
  const upside = valuation.upsideDownside ?? null;

  const pvFCF = bridge.pvOfFCF ?? null;
  const pvTerminal = bridge.pvOfTerminalValue ?? null;
  const netDebt = bridge.netDebt ?? null;

  const wacc = assumptions.wacc ?? null;
  const terminalGrowth = assumptions.terminalGrowth ?? null;
  const years = projections.years || [];
  const revenue = projections.revenue || [];
  const ebitda = projections.ebitda || [];
  const fcf = projections.freeCashFlow || [];

  return (
    <PreviewShell
      title="DCF Preview"
      subtitle="Implied value, enterprise bridge, and core assumptions"
      badgeText="DCF"
      ticker={safeTicker}
    >
      <div className="space-y-6">
      {/* Hero Section - Key Valuation */}
      <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 border-emerald-500/20">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Implied Value per Share */}
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                <div className="text-sm text-slate-400">Implied Value / Share</div>
              </div>
              <div className="text-4xl font-bold text-white mb-2">
                {formatPrice(impliedValue)}
              </div>
              {currentPrice !== null && upside !== null && (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-400">Current: {formatPrice(currentPrice)}</div>
                  <Badge
                    variant="outline"
                    className={
                      upside > 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }
                  >
                    {upside > 0 ? '+' : ''}
                    {formatPct(upside / 100)}
                  </Badge>
                </div>
              )}
            </div>

            {/* Enterprise Value */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-blue-400" />
                <div className="text-sm text-slate-400">Enterprise Value</div>
              </div>
              <div className="text-3xl font-bold text-white">
                {formatMoney(enterpriseValue)}
              </div>
            </div>

            {/* Equity Value */}
            <div className="text-center md:text-right">
              <div className="flex items-center justify-center md:justify-end gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-purple-400" />
                <div className="text-sm text-slate-400">Equity Value</div>
              </div>
              <div className="text-3xl font-bold text-white">
                {formatMoney(equityValue)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Assumptions */}
      <Card className="bg-slate-900/60 border-white/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-400" />
            <CardTitle className="text-lg text-white">Key Assumptions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {wacc !== null && (
              <div className="bg-slate-950/60 rounded-lg p-4 border border-white/5">
                <div className="text-xs text-slate-500 mb-1">WACC</div>
                <div className="text-xl font-bold text-emerald-400">{formatPct(wacc)}</div>
              </div>
            )}
            {terminalGrowth !== null && (
              <div className="bg-slate-950/60 rounded-lg p-4 border border-white/5">
                <div className="text-xs text-slate-500 mb-1">Terminal Growth</div>
                <div className="text-xl font-bold text-blue-400">{formatPct(terminalGrowth)}</div>
              </div>
            )}
            {pvFCF !== null && (
              <div className="bg-slate-950/60 rounded-lg p-4 border border-white/5">
                <div className="text-xs text-slate-500 mb-1">PV of FCF</div>
                <div className="text-xl font-bold text-purple-400">{formatMoney(pvFCF)}</div>
              </div>
            )}
            {pvTerminal !== null && (
              <div className="bg-slate-950/60 rounded-lg p-4 border border-white/5">
                <div className="text-xs text-slate-500 mb-1">PV Terminal</div>
                <div className="text-xl font-bold text-orange-400">{formatMoney(pvTerminal)}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Projections Table */}
      {years.length > 0 && (
        <Card className="bg-slate-900/60 border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white">Financial Projections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-400">Metric</th>
                    {years.map((year, idx) => (
                      <th key={idx} className="text-right py-3 px-4 text-sm font-semibold text-slate-400">
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {revenue.length > 0 && (
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4 text-sm text-slate-300 font-medium">Revenue</td>
                      {revenue.map((val, idx) => (
                        <td key={idx} className="text-right py-3 px-4 text-sm text-white">
                          {formatMoney(val)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {ebitda.length > 0 && (
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4 text-sm text-slate-300 font-medium">EBITDA</td>
                      {ebitda.map((val, idx) => (
                        <td key={idx} className="text-right py-3 px-4 text-sm text-white">
                          {formatMoney(val)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {fcf.length > 0 && (
                    <tr>
                      <td className="py-3 px-4 text-sm text-emerald-400 font-bold">Free Cash Flow</td>
                      {fcf.map((val, idx) => (
                        <td key={idx} className="text-right py-3 px-4 text-sm text-emerald-400 font-bold">
                          {formatMoney(val)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Valuation Bridge */}
      <Card className="bg-slate-900/60 border-white/5">
        <CardHeader>
          <CardTitle className="text-lg text-white">Valuation Bridge</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pvFCF !== null && (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-slate-300">PV of Explicit FCF</span>
                <span className="text-sm font-semibold text-white">{formatMoney(pvFCF)}</span>
              </div>
            )}
            {pvTerminal !== null && (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-slate-300">PV of Terminal Value</span>
                <span className="text-sm font-semibold text-white">{formatMoney(pvTerminal)}</span>
              </div>
            )}
            {enterpriseValue !== null && (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm font-bold text-blue-400">Enterprise Value</span>
                <span className="text-sm font-bold text-blue-400">{formatMoney(enterpriseValue)}</span>
              </div>
            )}
            {netDebt !== null && (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-slate-300">Less: Net Debt</span>
                <span className="text-sm text-slate-300">({formatMoney(Math.abs(netDebt))})</span>
              </div>
            )}
            {equityValue !== null && (
              <div className="flex items-center justify-between py-3 bg-emerald-500/5 rounded-lg px-3 mt-2">
                <span className="text-base font-bold text-emerald-400">Equity Value</span>
                <span className="text-base font-bold text-emerald-400">{formatMoney(equityValue)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </PreviewShell>
  );
}
