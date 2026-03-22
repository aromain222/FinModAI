'use client';

import { useMemo, useReducer, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssumptionsPanel } from '@/components/investment-analysis/AssumptionsPanel';
import { InvestmentChartArea } from '@/components/investment-analysis/InvestmentChartArea';
import { InvestmentMemoPanel } from '@/components/investment-analysis/InvestmentMemoPanel';
import { InvestmentValuationSummary } from '@/components/investment-analysis/InvestmentValuationSummary';
import {
  createInvestmentWorkspaceState,
  investmentWorkspaceReducer,
} from '@/lib/investment-analysis/workspaceState';
import type {
  InvestmentAnalysisDocument,
  InvestmentMemoSections,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';

type InvestmentAnalysisWorkspaceProps = {
  initialDocument: InvestmentAnalysisDocument;
  onRefreshMemo?: (args: {
    document: InvestmentAnalysisDocument;
    activeScenario: InvestmentScenarioKey;
  }) => Promise<InvestmentMemoSections>;
};

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      className={active ? 'bg-[var(--cb-green)] text-black hover:bg-[var(--cb-green)]/90' : undefined}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function InvestmentAnalysisWorkspace({
  initialDocument,
  onRefreshMemo,
}: InvestmentAnalysisWorkspaceProps) {
  const [state, dispatch] = useReducer(
    investmentWorkspaceReducer,
    initialDocument,
    createInvestmentWorkspaceState,
  );
  const [isRefreshingMemo, startMemoRefresh] = useTransition();
  const activeScenario = state.document.scenarios[state.document.activeScenario];

  const warningList = useMemo(
    () => Array.from(new Set(activeScenario.result.warnings)),
    [activeScenario.result.warnings],
  );
  const chartDocument = useMemo(
    () => ({
      activeScenario: state.document.activeScenario,
      scenarios: state.document.scenarios,
    }),
    [state.document.activeScenario, state.document.scenarios],
  );

  const activeScenarioSummary = {
    revenueYears: activeScenario.assumptions.revenueGrowthByYear.length,
    wacc: `${(activeScenario.assumptions.wacc * 100).toFixed(1)}%`,
    terminalGrowth: `${(activeScenario.assumptions.terminalGrowthRate * 100).toFixed(1)}%`,
  };

  const handleMemoRefresh = async () => {
    if (!onRefreshMemo) return;
    startMemoRefresh(async () => {
      const nextMemo = await onRefreshMemo({
        document: state.document,
        activeScenario: state.document.activeScenario,
      });
      dispatch({ type: 'replace_memo', memo: nextMemo });
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{state.document.company.companyName}</CardTitle>
                <CardDescription>
                  Interactive investment workspace. Chat starts the workflow, structured scenarios drive the state.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{state.document.company.ticker}</Badge>
                {state.document.company.sector ? <Badge variant="outline">{state.document.company.sector}</Badge> : null}
                <Badge variant="outline">DCF</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <PresetButton
                label="Bull"
                active={state.document.activeScenario === 'bull'}
                onClick={() => dispatch({ type: 'set_active_scenario', scenario: 'bull' })}
              />
              <PresetButton
                label="Base"
                active={state.document.activeScenario === 'base'}
                onClick={() => dispatch({ type: 'set_active_scenario', scenario: 'base' })}
              />
              <PresetButton
                label="Bear"
                active={state.document.activeScenario === 'bear'}
                onClick={() => dispatch({ type: 'set_active_scenario', scenario: 'bear' })}
              />
              <PresetButton
                label="Custom"
                active={state.document.activeScenario === 'custom'}
                onClick={() => dispatch({ type: 'activate_custom_from_current' })}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Active Scenario</div>
                <div className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{activeScenario.label}</div>
                <div className="mt-1 text-xs text-[var(--cb-text-muted)]">Live deterministic updates from local state</div>
              </div>
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Forecast Years</div>
                <div className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{activeScenarioSummary.revenueYears}</div>
                <div className="mt-1 text-xs text-[var(--cb-text-muted)]">Revenue and margin paths are editable</div>
              </div>
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Discount / Terminal</div>
                <div className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">
                  {activeScenarioSummary.wacc} / {activeScenarioSummary.terminalGrowth}
                </div>
                <div className="mt-1 text-xs text-[var(--cb-text-muted)]">WACC and terminal growth are editable</div>
              </div>
            </div>

            {warningList.length > 0 ? (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900">
                {warningList.join(' ')}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <InvestmentValuationSummary document={state.document} activeScenario={activeScenario} />
        <InvestmentChartArea document={chartDocument} />
        <InvestmentMemoPanel
          memo={state.document.memo}
          activeScenarioLabel={activeScenario.label}
          onRefresh={onRefreshMemo ? handleMemoRefresh : undefined}
          isRefreshing={isRefreshingMemo}
        />
      </div>

      <AssumptionsPanel
        activeScenario={state.document.activeScenario}
        assumptions={activeScenario.assumptions}
        onPatch={(patch) => dispatch({ type: 'patch_active_assumptions', patch })}
        onReset={() => dispatch({ type: 'reset_active_scenario' })}
        onActivateCustom={() => dispatch({ type: 'activate_custom_from_current' })}
      />
    </div>
  );
}
