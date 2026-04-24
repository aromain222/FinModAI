import { looksLikeTeslaMacroScenarioPrompt } from '@/lib/analyst/scenarioCard';

export type AnalystDemoStep = 'earnings' | 'scenario' | 'interpretation';

function normalizePrompt(message: string): string {
  return message.trim().toLowerCase();
}

export function isTeslaTicker(value?: string | null): boolean {
  return value?.trim().toUpperCase() === 'TSLA';
}

export function looksLikeTeslaDemoEntryPrompt(message: string, explicitTicker?: string | null): boolean {
  const text = normalizePrompt(message);
  const hasTeslaContext = /\b(tesla|tsla)\b/.test(text) || isTeslaTicker(explicitTicker);
  if (!hasTeslaContext) return false;
  return (
    /\btesla earnings\b/.test(text) ||
    /\btsla earnings\b/.test(text) ||
    /\btell me about tesla\b/.test(text)
  );
}

export function looksLikeTeslaDemoInterpretationPrompt(message: string): boolean {
  const text = normalizePrompt(message);
  return (
    /\bis this(?: actually)? bullish\b/.test(text) ||
    /\bbull case\b/.test(text) ||
    /\bbear case\b/.test(text)
  );
}

export function isTeslaDemoProgressionPrompt(message: string, explicitTicker?: string | null): boolean {
  return (
    looksLikeTeslaDemoEntryPrompt(message, explicitTicker) ||
    looksLikeTeslaMacroScenarioPrompt(message, explicitTicker ?? undefined) ||
    looksLikeTeslaDemoInterpretationPrompt(message)
  );
}

export function getTeslaDemoGuidedHint(step: AnalystDemoStep | null): string | null {
  if (step === 'earnings') {
    return 'Try asking: What happens to Tesla if rates drop 100bps?';
  }
  if (step === 'scenario') {
    return 'Ask: Is this actually bullish for Tesla?';
  }
  return null;
}

export function buildTeslaDemoInterpretationReply(): string {
  return [
    'Bull Case:',
    '',
    '- Demand accelerates due to lower financing costs',
    '- Revenue growth improves',
    '- Valuation expands from lower discount rate',
    '',
    'Bear Case:',
    '',
    '- Margins remain under pressure',
    '- Earnings do not scale with demand',
    '- Valuation driven more by macro than fundamentals',
    '',
    'Conclusion:',
    'The scenario is positive for valuation, but operational performance remains a constraint.',
  ].join('\n');
}

function readMessageMeta(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== 'object' || !('meta' in message)) return null;
  const meta = (message as { meta?: unknown }).meta;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
}

function readMessageContent(message: unknown): string {
  if (!message || typeof message !== 'object' || !('content' in message)) return '';
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

export function hasTeslaDemoHistory(messages: unknown[]): boolean {
  let sawTeslaEarningsContext = false;
  let sawTeslaScenarioCard = false;

  for (const message of messages) {
    const content = readMessageContent(message);
    if (looksLikeTeslaDemoEntryPrompt(content)) {
      sawTeslaEarningsContext = true;
    }

    const meta = readMessageMeta(message);
    if (!meta) continue;

    const earningsSummary =
      meta.earningsSummary && typeof meta.earningsSummary === 'object'
        ? (meta.earningsSummary as { ticker?: unknown })
        : null;
    if (isTeslaTicker(typeof earningsSummary?.ticker === 'string' ? earningsSummary.ticker : null)) {
      sawTeslaEarningsContext = true;
    }

    const scenarioCard =
      meta.scenarioCard && typeof meta.scenarioCard === 'object'
        ? (meta.scenarioCard as { company?: unknown })
        : null;
    if (typeof scenarioCard?.company === 'string' && scenarioCard.company.trim().toLowerCase() === 'tesla') {
      sawTeslaScenarioCard = true;
    }
  }

  return sawTeslaEarningsContext && sawTeslaScenarioCard;
}
