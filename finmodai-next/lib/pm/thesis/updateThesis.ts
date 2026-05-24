import type { PMAlert, PositionThesis, ThesisStatus, ThesisUpdateInput, ThesisUpdateResult } from '@/lib/pm/types';
import { saveAlert } from '@/lib/pm/alerts/alertStore';
import { getLatestThesis, saveThesis, saveThesisUpdate } from '@/lib/pm/thesis/thesisStore';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function inferChangedFactors(evidence: string): string[] {
  const text = evidence.toLowerCase();
  const factors: string[] = [];
  if (/(earnings|guidance|eps|revenue|margin|bookings|loan growth|cloud)/.test(text)) factors.push('estimate_revision');
  if (/(multiple|valuation|rate|wacc|yield|discount)/.test(text)) factors.push('multiple');
  if (/(positioning|flows|short interest|crowded|squeeze)/.test(text)) factors.push('positioning');
  if (/(risk|regulat|lawsuit|antitrust|export|policy|macro)/.test(text)) factors.push('risk');
  if (/(catalyst|launch|event|approval|deal)/.test(text)) factors.push('catalyst');
  return factors.length > 0 ? factors : ['thesis_evidence'];
}

function conditionTriggered(conditions: string[], evidence: string): boolean {
  const text = evidence.toLowerCase();
  return conditions.some(condition => {
    const words = condition.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 4);
    return words.length > 0 && words.some(word => text.includes(word));
  });
}

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 4 && !['thesis', 'stock', 'agent', 'market', 'update', 'evidence'].includes(word)),
  );
}

function compareEvidence(previous: PositionThesis | null, evidence: string): string {
  if (!previous) return 'No prior thesis existed, so this opens the official PM record.';
  const previousText = [
    previous.thesisSummary,
    previous.whyWeOwnIt,
    ...previous.catalysts,
    ...previous.keyRisks,
    ...previous.invalidationConditions,
  ].join(' ');
  const oldWords = extractKeywords(previousText);
  const newWords = extractKeywords(evidence);
  const overlap = [...newWords].filter(word => oldWords.has(word));
  const additions = [...newWords].filter(word => !oldWords.has(word)).slice(0, 5);
  if (additions.length === 0) {
    return overlap.length > 0
      ? `Evidence mostly confirms existing thesis terms: ${overlap.slice(0, 5).join(', ')}.`
      : 'Evidence did not introduce a clear new thesis driver.';
  }
  return `New evidence adds ${additions.join(', ')}${overlap.length > 0 ? ` while overlapping prior drivers ${overlap.slice(0, 3).join(', ')}` : ''}.`;
}

function determineStatus(params: {
  previous: PositionThesis | null;
  evidence: string;
  convictionBefore: number | null;
  convictionAfter: number;
}): ThesisStatus {
  const { previous, evidence, convictionBefore, convictionAfter } = params;
  const text = evidence.toLowerCase();
  if (previous && conditionTriggered(previous.invalidationConditions, evidence)) return 'broken';
  if (/(broken|invalidated|missed badly|materially worse|guidance cut|fraud)/.test(text)) return 'broken';
  if (convictionBefore !== null) {
    const delta = convictionAfter - convictionBefore;
    if (delta <= -20) return 'weakening';
    if (delta >= 15) return 'strengthening';
  }
  if (/(beats|accelerat|raises|stronger|expands|upside|approved|wins)/.test(text)) return 'strengthening';
  if (/(miss|slows|weak|cuts|pressure|declines|worse|risk)/.test(text)) return 'weakening';
  return previous?.thesisStatus ?? 'under_review';
}

function buildAlert(update: ThesisUpdateResult['update'], thesis: PositionThesis): PMAlert | null {
  if (!update.shouldNotifyPM) return null;
  const severity = update.thesisStatusAfter === 'broken'
    ? 'critical'
    : update.thesisStatusAfter === 'weakening'
      ? 'high'
      : 'medium';
  return {
    id: crypto.randomUUID(),
    ticker: thesis.ticker,
    alertType: update.thesisStatusAfter === 'broken' ? 'thesis_break' : 'score_change',
    severity,
    title: `${thesis.ticker} thesis ${update.thesisStatusAfter.replace('_', ' ')}`,
    summary: update.explanation,
    impactDirection:
      update.thesisStatusAfter === 'strengthening' ? 'bullish' :
      update.thesisStatusAfter === 'weakening' || update.thesisStatusAfter === 'broken' ? 'bearish' : 'neutral',
    suggestedAction: update.thesisStatusAfter === 'broken' ? 'exit' : 'review',
    confidence: Math.max(50, Math.min(90, update.convictionAfter)),
    affectedTheme: null,
    affectedThesis: thesis.thesisSummary,
    shouldNotifyPM: true,
    evidence: [{
      source: update.source ?? 'pm_brain',
      summary: update.newEvidence,
      impactDirection:
        update.thesisStatusAfter === 'strengthening' ? 'bullish' :
        update.thesisStatusAfter === 'weakening' || update.thesisStatusAfter === 'broken' ? 'bearish' : 'neutral',
    }],
    createdAt: update.createdAt,
    resolvedAt: null,
  };
}

export async function updateThesis(input: ThesisUpdateInput): Promise<ThesisUpdateResult> {
  const ticker = input.ticker.toUpperCase();
  const previous = await getLatestThesis(ticker);
  const convictionBefore = previous?.convictionScore ?? null;
  const agentConviction = input.agentViews && input.agentViews.length > 0
    ? Math.round(input.agentViews.reduce((sum, view) => sum + view.conviction, 0) / input.agentViews.length)
    : null;
  const convictionAfter = clampScore(input.convictionScore ?? agentConviction ?? convictionBefore ?? 50);
  const statusAfter = determineStatus({
    previous,
    evidence: input.newEvidence,
    convictionBefore,
    convictionAfter,
  });
  const changedFactors = inferChangedFactors(input.newEvidence);
  const convictionDelta = convictionBefore === null ? null : convictionAfter - convictionBefore;
  const materialConvictionMove = convictionDelta !== null && Math.abs(convictionDelta) >= 12;
  const shouldNotifyPM = statusAfter === 'broken' || statusAfter === 'weakening' || materialConvictionMove;
  const now = new Date().toISOString();

  const updatedSummary = input.newThesisSummary
    ?? previous?.thesisSummary
    ?? `${ticker} thesis opened from new PM evidence.`;
  const explanation = previous
    ? `Changed from ${previous.thesisStatus} to ${statusAfter}. ${compareEvidence(previous, input.newEvidence)} Evidence affected ${changedFactors.join(', ')}; conviction ${convictionBefore} -> ${convictionAfter}.`
    : `Created initial PM thesis record. Evidence affected ${changedFactors.join(', ')}; starting conviction ${convictionAfter}.`;
  const currentThesis = input.newThesisSummary
    ?? previous?.currentThesis
    ?? previous?.thesisSummary
    ?? updatedSummary;

  const updatedThesis: PositionThesis = {
    id: previous?.id ?? crypto.randomUUID(),
    ticker,
    originalThesis: previous?.originalThesis ?? previous?.thesisSummary ?? updatedSummary,
    currentThesis,
    thesisSummary: updatedSummary,
    whyWeOwnIt: previous?.whyWeOwnIt ?? input.newEvidence,
    addConditions: previous?.addConditions ?? [],
    sellConditions: previous?.sellConditions ?? [],
    invalidationConditions: previous?.invalidationConditions ?? [],
    keyRisks: previous?.keyRisks ?? [],
    catalysts: previous?.catalysts ?? [],
    convictionScore: convictionAfter,
    status: statusAfter,
    integrityStatus:
      statusAfter === 'closed' ? 'resolved' :
      statusAfter === 'holding' ? 'intact' :
      statusAfter === 'building' ? 'under_review' :
      statusAfter,
    thesisStatus: statusAfter,
    currentScore: convictionAfter,
    entryScore: previous?.entryScore ?? convictionBefore ?? convictionAfter,
    timeHorizon: previous?.timeHorizon ?? null,
    lastReviewedAt: now,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    history: previous?.history ?? [],
  };

  const update = await saveThesisUpdate({
    ticker,
    thesisId: updatedThesis.id,
    previousThesis: previous?.thesisSummary ?? null,
    newEvidence: input.newEvidence,
    updatedThesis: updatedSummary,
    convictionBefore,
    convictionAfter,
    thesisStatusBefore: previous?.thesisStatus ?? null,
    thesisStatusAfter: statusAfter,
    changedFactors,
    shouldNotifyPM,
    explanation,
    source: input.source ?? 'manual',
    createdAt: now,
  });

  updatedThesis.history = [...(updatedThesis.history ?? []), update].slice(-50);
  const savedThesis = await saveThesis(updatedThesis);
  const alertPayload = buildAlert(update, savedThesis);
  const alert = alertPayload ? await saveAlert(alertPayload) : null;

  return {
    previousThesis: previous,
    updatedThesis: savedThesis,
    update,
    convictionDelta,
    changedFactors,
    shouldNotifyPM,
    alert,
  };
}
