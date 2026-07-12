import { z } from 'zod';
import type { PortfolioPosition } from '@/lib/pm/types';

const importTickerSchema = z.string()
  .trim()
  .min(1)
  .max(16)
  .transform(value => value.toUpperCase().replace(/-/g, '.'));

export const holdingSnapshotSchema = z.object({
  ticker: importTickerSchema,
  shares: z.number().finite().positive(),
  costBasis: z.number().finite().nonnegative(),
  currentPrice: z.number().finite().positive(),
  account: z.string().trim().min(1).max(120),
}).strict();

export const holdingsImportSchema = z.array(holdingSnapshotSchema)
  .max(500)
  .superRefine((holdings, context) => {
    const seen = new Set<string>();
    holdings.forEach((holding, index) => {
      const key = holdingKey(holding.account, holding.ticker);
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate holding for ${holding.ticker} in ${holding.account}`,
          path: [index],
        });
      }
      seen.add(key);
    });
  });

export type HoldingSnapshot = z.infer<typeof holdingSnapshotSchema>;

export type HoldingsImportPlan = {
  upserts: PortfolioPosition[];
  closes: Array<{ id: string; ticker: string }>;
  created: number;
  updated: number;
};

function normalizedAccount(account: string | null | undefined): string | null {
  const value = account?.trim().toLowerCase();
  return value || null;
}

function holdingKey(account: string, ticker: string): string {
  return `${normalizedAccount(account)}:${ticker.toUpperCase()}`;
}

function importedPositionId(account: string, ticker: string): string {
  return `holdings-import:${encodeURIComponent(normalizedAccount(account) ?? 'account')}:${ticker.toUpperCase()}`;
}

function isHeldPosition(position: PortfolioPosition): boolean {
  return position.status === 'active' || position.status === 'trimmed';
}

export function buildHoldingsImportPlan(params: {
  existing: PortfolioPosition[];
  holdings: HoldingSnapshot[];
  now?: string;
}): HoldingsImportPlan {
  const now = params.now ?? new Date().toISOString();
  const nonWatch = params.existing.filter(position => position.status !== 'watch');
  const usedIds = new Set<string>();
  let created = 0;
  let updated = 0;

  const upserts = params.holdings.map(holding => {
    const ticker = holding.ticker.toUpperCase();
    const account = holding.account.trim();
    const exact = nonWatch.find(position => (
      !usedIds.has(position.id)
      && position.ticker.toUpperCase() === ticker
      && normalizedAccount(position.account) === normalizedAccount(account)
    ));
    const legacyActive = nonWatch.find(position => (
      !usedIds.has(position.id)
      && isHeldPosition(position)
      && position.ticker.toUpperCase() === ticker
      && normalizedAccount(position.account) === null
    ));
    const existing = exact ?? legacyActive;
    const id = existing?.id ?? importedPositionId(account, ticker);
    usedIds.add(id);
    if (existing) updated += 1;
    else created += 1;

    return {
      id,
      ticker,
      companyName: existing?.companyName ?? null,
      shares: holding.shares,
      costBasis: holding.costBasis,
      currentPrice: holding.currentPrice,
      notionalExposure: Math.round(holding.shares * holding.currentPrice * 100) / 100,
      account,
      targetAllocation: existing?.targetAllocation ?? null,
      currentAllocation: existing?.currentAllocation ?? null,
      portfolioTheme: existing?.portfolioTheme ?? null,
      portfolioRole: existing?.portfolioRole ?? null,
      timeHorizon: existing?.timeHorizon ?? null,
      status: 'active' as const,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.pmNotes ? { pmNotes: existing.pmNotes } : {}),
      ...(existing?.approvalStatus ? { approvalStatus: existing.approvalStatus } : {}),
      ...(existing?.thesisIntegrity ? { thesisIntegrity: existing.thesisIntegrity } : {}),
      ...(existing?.agentConsensus ? { agentConsensus: existing.agentConsensus } : {}),
      ...(existing?.convictionScore !== undefined ? { convictionScore: existing.convictionScore } : {}),
      ...(existing?.entryScore !== undefined ? { entryScore: existing.entryScore } : {}),
      ...(existing?.currentScore !== undefined ? { currentScore: existing.currentScore } : {}),
      ...(existing?.targetPrice !== undefined ? { targetPrice: existing.targetPrice } : {}),
      ...(existing?.stopLoss !== undefined ? { stopLoss: existing.stopLoss } : {}),
      entryPrice: existing?.entryPrice ?? holding.costBasis,
      ...(existing?.lastPmAnalysisAt !== undefined ? { lastPmAnalysisAt: existing.lastPmAnalysisAt } : {}),
    } satisfies PortfolioPosition;
  });

  const closes = nonWatch
    .filter(position => isHeldPosition(position) && !usedIds.has(position.id))
    .map(position => ({ id: position.id, ticker: position.ticker.toUpperCase() }));

  return { upserts, closes, created, updated };
}
