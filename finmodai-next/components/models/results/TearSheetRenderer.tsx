"use client";

import React from 'react';
import { ModelResultsShell } from './ModelResultsShell';
import { KpiStrip } from './blocks/KpiStrip';
import { DataTable } from './blocks/DataTable';
import { BridgeTable } from './blocks/BridgeTable';
import { AssumptionChips } from './blocks/AssumptionChips';
import { DiagnosticsPanel } from './blocks/DiagnosticsPanel';
import { CalloutBlock } from './blocks/CalloutBlock';
import type { TearSheet } from '@/lib/models/tearSheet/types';

export interface TearSheetRendererProps {
  tearSheet: TearSheet;
  actions: {
    onDownload?: () => void;
    onEditInputs?: () => void;
    onRunAgain?: () => void;
    onDuplicate?: () => void;
  };
}

/**
 * Renders a TearSheet using the universal shell and blocks
 * 
 * This is the single entry point for rendering any model's results.
 * All models must provide a TearSheet object.
 */
export function TearSheetRenderer({
  tearSheet,
  actions,
}: TearSheetRendererProps) {
  // Build title
  const title = `${tearSheet.header.ticker} — ${tearSheet.header.modelName}`;
  const subtitle = tearSheet.header.createdAt
    ? `Generated ${new Date(tearSheet.header.createdAt).toLocaleString()}`
    : undefined;

  // Build badges
  const badges = [];
  if (tearSheet.header.scenario) {
    badges.push({ label: tearSheet.header.scenario, tone: 'neutral' as const });
  }

  // Render main blocks
  const mainBlocks = tearSheet.mainBlocks.map((block, idx) => {
    switch (block.type) {
      case 'table':
        return (
          <DataTable
            key={idx}
            title={block.title}
            columns={block.columns}
            rows={block.rows}
            unitNote={block.unitNote}
          />
        );
      case 'bridge':
        return (
          <BridgeTable
            key={idx}
            title={block.title}
            lines={block.lines}
          />
        );
      case 'callout':
        return (
          <CalloutBlock
            key={idx}
            tone={block.tone}
            title={block.title}
            bullets={block.bullets}
            ctaLabel={block.ctaLabel}
            ctaHref={block.ctaHref}
          />
        );
      case 'chart':
        // TODO: Implement chart rendering
        return null;
      default:
        return null;
    }
  }).filter(Boolean);

  // Render bottom blocks
  const bottomBlocks = tearSheet.bottomBlocks
    ? tearSheet.bottomBlocks.map((block, idx) => {
        switch (block.type) {
          case 'table':
            return (
              <DataTable
                key={idx}
                title={block.title}
                columns={block.columns}
                rows={block.rows}
                unitNote={block.unitNote}
              />
            );
          case 'bridge':
            return (
              <BridgeTable
                key={idx}
                title={block.title}
                lines={block.lines}
              />
            );
          case 'callout':
            return (
              <CalloutBlock
                key={idx}
                tone={block.tone}
                title={block.title}
                bullets={block.bullets}
                ctaLabel={block.ctaLabel}
                ctaHref={block.ctaHref}
              />
            );
          default:
            return null;
        }
      }).filter(Boolean)
    : null;

  // Render sidebar
  const sidebar = (
    <div className="space-y-6">
      {/* Assumptions */}
      {tearSheet.sidebar.assumptions && tearSheet.sidebar.assumptions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--cb-text-primary)] mb-3">
            Assumptions
          </h3>
          <AssumptionChips assumptions={tearSheet.sidebar.assumptions.map(a => ({
            label: a.label,
            value: a.value,
            format: 'text',
          }))} />
        </div>
      )}

      {/* Diagnostics */}
      <DiagnosticsPanel
        coverage={tearSheet.sidebar.diagnostics.coverage}
        defaults={tearSheet.sidebar.diagnostics.defaults}
        warnings={tearSheet.sidebar.diagnostics.warnings}
      />
    </div>
  );

  return (
    <ModelResultsShell
      title={title}
      subtitle={subtitle}
      badges={badges}
      actions={actions}
      kpis={<KpiStrip items={tearSheet.kpis} />}
      main={<div className="space-y-6">{mainBlocks}</div>}
      sidebar={sidebar}
      bottom={bottomBlocks ? <div className="space-y-6">{bottomBlocks}</div> : undefined}
    />
  );
}
