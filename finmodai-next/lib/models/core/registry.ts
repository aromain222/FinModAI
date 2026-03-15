import type { AnyModelDef, ModelMeta } from '@/lib/models/core/types';
import { driverThreeStatementModel } from '@/lib/models/modules/driverThreeStatement';
import { dcfValuationModel } from '@/lib/models/modules/dcfValuation';
import { journalToFsModel } from '@/lib/models/modules/journalToFs';
import { operatingModel } from '@/lib/models/modules/operatingModel';
import { tradingCompsModel } from '@/lib/models/modules/tradingComps';
import { lboLiteModel } from '@/lib/models/modules/lboLite';
import { capTableDilutionModel } from '@/lib/models/modules/capTableDilution';
import { vcReturnsIrrModel } from '@/lib/models/modules/vcReturnsIrr';
import { runwayBurnModel } from '@/lib/models/modules/runwayBurn';
import { saasKpiCohortModel } from '@/lib/models/modules/saasKpiCohort';
import { maAccretionDilutionModel } from '@/lib/models/modules/maAccretionDilution';
import { revenueRecognitionAsc606Model } from '@/lib/models/modules/revenueRecognitionAsc606';
import { inventoryCogsModel } from '@/lib/models/modules/inventoryCogs';
import { vcCapTableAdvancedModel } from '@/lib/models/modules/vcCapTableAdvanced';
import { saasCohortBoardModel } from '@/lib/models/modules/saasCohortBoard';
import { dividendDiscountModel } from '@/lib/models/modules/dividendDiscount';
import { residualIncomeModel } from '@/lib/models/modules/residualIncome';
import { debtAmortizationRefiModel } from '@/lib/models/modules/debtAmortizationRefi';
import { buybackEpsAccretionModel } from '@/lib/models/modules/buybackEpsAccretion';
import { purchasePriceAllocationModel } from '@/lib/models/modules/purchasePriceAllocation';

export const modelRegistry: Record<string, AnyModelDef> = {
  [driverThreeStatementModel.slug]: driverThreeStatementModel,
  [dcfValuationModel.slug]: dcfValuationModel,
  [journalToFsModel.slug]: journalToFsModel,
  [operatingModel.slug]: operatingModel,
  [tradingCompsModel.slug]: tradingCompsModel,
  [lboLiteModel.slug]: lboLiteModel,
  [capTableDilutionModel.slug]: capTableDilutionModel,
  [vcReturnsIrrModel.slug]: vcReturnsIrrModel,
  [runwayBurnModel.slug]: runwayBurnModel,
  [saasKpiCohortModel.slug]: saasKpiCohortModel,
  [maAccretionDilutionModel.slug]: maAccretionDilutionModel,
  [revenueRecognitionAsc606Model.slug]: revenueRecognitionAsc606Model,
  [inventoryCogsModel.slug]: inventoryCogsModel,
  [vcCapTableAdvancedModel.slug]: vcCapTableAdvancedModel,
  [saasCohortBoardModel.slug]: saasCohortBoardModel,
  [dividendDiscountModel.slug]: dividendDiscountModel,
  [residualIncomeModel.slug]: residualIncomeModel,
  [debtAmortizationRefiModel.slug]: debtAmortizationRefiModel,
  [buybackEpsAccretionModel.slug]: buybackEpsAccretionModel,
  [purchasePriceAllocationModel.slug]: purchasePriceAllocationModel,
};

const MODEL_SLUG_ALIASES: Record<string, string> = {
  'driver-based-3-statement-model': driverThreeStatementModel.slug,
  'driver-based-three-statement-model': driverThreeStatementModel.slug,
  'driver-three-statement': driverThreeStatementModel.slug,
  'driver-3-statement-model': driverThreeStatementModel.slug,
  'three-statement-driver': driverThreeStatementModel.slug,
};

function normalizeSlugLike(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveModelSlug(slug: string): string | null {
  if (!slug) return null;

  if (modelRegistry[slug]) return slug;

  const normalized = normalizeSlugLike(slug);
  if (modelRegistry[normalized]) return normalized;

  const aliasDirect = MODEL_SLUG_ALIASES[slug];
  if (aliasDirect && modelRegistry[aliasDirect]) return aliasDirect;

  const aliasNormalized = MODEL_SLUG_ALIASES[normalized];
  if (aliasNormalized && modelRegistry[aliasNormalized]) return aliasNormalized;

  // Final lightweight fuzzy fallback for the known driver three-statement naming variants.
  if (normalized.includes('driver') && normalized.includes('statement')) {
    return driverThreeStatementModel.slug;
  }

  return null;
}

export function getModel(slug: string): AnyModelDef | null {
  const resolved = resolveModelSlug(slug);
  return resolved ? modelRegistry[resolved] ?? null : null;
}

export function listModelMeta(): ModelMeta[] {
  return Object.values(modelRegistry).map((model) => ({
    slug: model.slug,
    name: model.name,
    category: model.category,
    description: model.description,
  }));
}
