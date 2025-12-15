"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { CompsOutput } from '@/lib/models/outputTypes';

interface CompsPreviewProps {
  output: CompsOutput;
  ticker: string;
}

export function CompsPreview({ output, ticker }: CompsPreviewProps) {
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-lg">Trading Comparables</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comps Table */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Peer Companies</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">EV/Revenue</TableHead>
                  <TableHead className="text-right">EV/EBITDA</TableHead>
                  <TableHead className="text-right">P/E</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Target (highlighted) */}
                {output.target.evRevenue !== undefined ||
                output.target.evEbitda !== undefined ||
                output.target.pe !== undefined ? (
                  <TableRow className="bg-[var(--cb-green)]/10">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{output.target.ticker}</span>
                        <Badge variant="default" className="text-xs">
                          Target
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {output.target.evRevenue !== undefined
                        ? output.target.evRevenue.toFixed(1)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {output.target.evEbitda !== undefined
                        ? output.target.evEbitda.toFixed(1)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {output.target.pe !== undefined ? output.target.pe.toFixed(1) : '—'}
                    </TableCell>
                  </TableRow>
                ) : null}
                {/* Peers */}
                {output.peers.map((peer, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{peer.ticker}</TableCell>
                    <TableCell className="text-right">
                      {peer.evRevenue !== undefined ? peer.evRevenue.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {peer.evEbitda !== undefined ? peer.evEbitda.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {peer.pe !== undefined ? peer.pe.toFixed(1) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary Ranges */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Summary Statistics</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
              <div className="text-xs text-[var(--cb-text-muted)] mb-2">EV/Revenue</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P25:</span>
                  <span className="font-medium">{output.summary.evRevenue.p25.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">Median:</span>
                  <span className="font-semibold">{output.summary.evRevenue.median.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P75:</span>
                  <span className="font-medium">{output.summary.evRevenue.p75.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
              <div className="text-xs text-[var(--cb-text-muted)] mb-2">EV/EBITDA</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P25:</span>
                  <span className="font-medium">{output.summary.evEbitda.p25.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">Median:</span>
                  <span className="font-semibold">{output.summary.evEbitda.median.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P75:</span>
                  <span className="font-medium">{output.summary.evEbitda.p75.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
              <div className="text-xs text-[var(--cb-text-muted)] mb-2">P/E</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P25:</span>
                  <span className="font-medium">{output.summary.pe.p25.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">Median:</span>
                  <span className="font-semibold">{output.summary.pe.median.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cb-text-muted)]">P75:</span>
                  <span className="font-medium">{output.summary.pe.p75.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
