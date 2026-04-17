import {
  buildMappedModelInputs,
  buildValidatedSnapshot,
} from '@/lib/data/financial-extraction/modelInputBuilder';
import type {
  FinancialExtractionLane,
  FinancialValidationFinding,
  FinancialValidationState,
  NormalizedFinancialFact,
  ResolvedCompanyIdentity,
  ValidatedFinancialSnapshot,
} from '@/lib/data/financial-extraction/types';

const SOURCE_PRIORITY: Record<NormalizedFinancialFact['sourceType'], number> = {
  stored_company_snapshot: 95,
  provider_snapshot: 85,
  sec_companyfacts: 90,
  uploaded_spreadsheet: 100,
  uploaded_pdf: 80,
  uploaded_cim: 60,
  uploaded_deck: 50,
  local_file: 40,
  unknown_private_file: 10,
};

function metricTolerance(metricKey: NormalizedFinancialFact['metricKey']): number {
  switch (metricKey) {
    case 'share_price':
      return 0.03;
    case 'shares_outstanding':
      return 0.02;
    default:
      return 0.05;
  }
}

function relativeDiff(left: number, right: number): number {
  const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / denominator;
}

function chooseCanonicalFact(facts: NormalizedFinancialFact[]): NormalizedFinancialFact {
  return [...facts].sort((left, right) => {
    const priorityDelta = SOURCE_PRIORITY[right.sourceType] - SOURCE_PRIORITY[left.sourceType];
    if (priorityDelta !== 0) return priorityDelta;
    const confidenceDelta = right.confidence - left.confidence;
    if (confidenceDelta !== 0) return confidenceDelta;
    return String(right.asOfDate ?? '').localeCompare(String(left.asOfDate ?? ''));
  })[0];
}

function validateFiniteFacts(facts: NormalizedFinancialFact[]): FinancialValidationFinding[] {
  return facts.flatMap((fact) => {
    if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) {
      return [{
        severity: 'blocking_error' as const,
        code: 'non_finite_value',
        message: `${fact.metricKey} is non-finite and cannot be mapped into a model.`,
        metricKey: fact.metricKey,
        sourceRef: fact.sourceUrlOrFileId,
      }];
    }
    if (fact.metricKey === 'shares_outstanding' && fact.value <= 0) {
      return [{
        severity: 'blocking_error' as const,
        code: 'invalid_share_count',
        message: 'Shares outstanding must be positive.',
        metricKey: fact.metricKey,
        sourceRef: fact.sourceUrlOrFileId,
      }];
    }
    if ((fact.metricKey === 'revenue' || fact.metricKey === 'cash' || fact.metricKey === 'total_debt' || fact.metricKey === 'market_cap') && fact.value < 0) {
      return [{
        severity: 'blocking_error' as const,
        code: 'unexpected_negative_value',
        message: `${fact.metricKey} cannot be negative in the extracted snapshot.`,
        metricKey: fact.metricKey,
        sourceRef: fact.sourceUrlOrFileId,
      }];
    }
    return [];
  });
}

function validateConflicts(
  lane: FinancialExtractionLane,
  groupedFacts: Map<NormalizedFinancialFact['metricKey'], NormalizedFinancialFact[]>,
): FinancialValidationFinding[] {
  const findings: FinancialValidationFinding[] = [];

  for (const [metricKey, facts] of groupedFacts.entries()) {
    if (facts.length < 2) continue;
    const canonical = chooseCanonicalFact(facts);
    for (const candidate of facts) {
      if (candidate === canonical) continue;
      if (relativeDiff(canonical.value, candidate.value) <= metricTolerance(metricKey)) continue;

      const samePriority = SOURCE_PRIORITY[candidate.sourceType] === SOURCE_PRIORITY[canonical.sourceType];
      findings.push({
        severity: lane === 'public' && samePriority ? 'blocking_error' : 'warning',
        code: samePriority ? 'conflicting_primary_values' : 'conflicting_values',
        message: `${metricKey} has conflicting extracted values between ${canonical.sourceLabel} and ${candidate.sourceLabel}.`,
        metricKey,
        sourceRef: `${canonical.sourceUrlOrFileId}|${candidate.sourceUrlOrFileId}`,
      });
    }
  }

  return findings;
}

export function normalizeAndReconcileFinancialFacts(params: {
  lane: FinancialExtractionLane;
  identity: ResolvedCompanyIdentity;
  facts: NormalizedFinancialFact[];
  sourceArtifacts: ValidatedFinancialSnapshot['sourceArtifacts'];
}): {
  facts: NormalizedFinancialFact[];
  validationFindings: FinancialValidationFinding[];
  snapshot: ValidatedFinancialSnapshot;
} {
  const finiteFindings = validateFiniteFacts(params.facts);
  const groupedFacts = new Map<NormalizedFinancialFact['metricKey'], NormalizedFinancialFact[]>();

  for (const fact of params.facts) {
    const bucket = groupedFacts.get(fact.metricKey) ?? [];
    bucket.push(fact);
    groupedFacts.set(fact.metricKey, bucket);
  }

  const canonicalFacts = Array.from(groupedFacts.values()).map(chooseCanonicalFact);
  const conflictFindings = validateConflicts(params.lane, groupedFacts);
  const findings = [...finiteFindings, ...conflictFindings];

  if (params.lane === 'private') {
    const hasRevenue = canonicalFacts.some((fact) => fact.metricKey === 'revenue');
    const hasEarnings = canonicalFacts.some((fact) => fact.metricKey === 'ebitda' || fact.metricKey === 'ebit');
    if (!hasRevenue && !hasEarnings) {
      findings.push({
        severity: 'blocking_error',
        code: 'missing_private_operating_anchors',
        message: 'Private-company extraction is incomplete: both revenue and EBITDA/EBIT are still missing.',
      });
    }
  }

  const warnings = findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.message);
  const blockingErrors = findings
    .filter((finding) => finding.severity === 'blocking_error')
    .map((finding) => finding.message);
  const validationState: FinancialValidationState =
    blockingErrors.length > 0 ? 'blocking_error' : warnings.length > 0 ? 'warning' : 'ok';

  const mappedModelInputs =
    validationState === 'blocking_error'
      ? null
      : buildMappedModelInputs({
          identity: params.identity,
          facts: canonicalFacts,
        });

  const snapshot = buildValidatedSnapshot({
    identity: params.identity,
    validationState,
    warnings,
    blockingErrors,
    facts: canonicalFacts,
    mappedModelInputs,
    sourceArtifacts: params.sourceArtifacts,
  });

  return {
    facts: canonicalFacts,
    validationFindings: findings,
    snapshot,
  };
}
