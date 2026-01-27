import type { CompanyProfile } from '@/lib/companyProfile';

const MARKET_CAP_PREFERENCE_RATIO = 3;

export function scorePeerSimilarity(target: CompanyProfile, candidate: CompanyProfile): number {
  let score = 0;

  if (isSameText(target.sector, candidate.sector)) {
    score += 40;
  }

  if (isSameText(target.industry, candidate.industry)) {
    score += 40;
  }

  if (isSameText(target.country, candidate.country)) {
    score += 5;
  }

  if (target.isMediaOrStreaming && candidate.isMediaOrStreaming) {
    score += 25;
  }

  if (target.isSubscription && candidate.isSubscription) {
    score += 15;
  }

  if (target.isMarketplace && candidate.isMarketplace) {
    score += 10;
  }

  if (target.isMediaOrStreaming) {
    if (candidate.isRetail || candidate.isEnergyOrMaterials) {
      score -= 50;
    }
    if (!target.isFinancial && candidate.isFinancial) {
      score -= 30;
    }
  }

  if (!target.isFinancial && candidate.isFinancial) {
    score -= 30;
  }

  if (target.isRetail && candidate.isRetail) {
    score += 10;
  }

  if (typeof target.marketCap === 'number' && typeof candidate.marketCap === 'number') {
    const ratio = target.marketCap > 0 && candidate.marketCap > 0
      ? Math.max(target.marketCap, candidate.marketCap) / Math.min(target.marketCap, candidate.marketCap)
      : Infinity;
    if (ratio <= MARKET_CAP_PREFERENCE_RATIO) {
      score += 10;
    } else if (ratio <= 5) {
      score += 5;
    } else if (ratio > 10) {
      score -= 5;
    }
  }

  return score;
}

function isSameText(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
