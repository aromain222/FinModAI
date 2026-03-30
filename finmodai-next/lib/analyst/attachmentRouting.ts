import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AnalystRoute } from '@/lib/analyst/router';

export function overrideRouteFromAttachment(
  route: AnalystRoute,
  userMessage: string,
  attachment: UploadedAttachmentContext | null,
): AnalystRoute {
  if (!attachment) return route;
  const text = userMessage.toLowerCase();
  const genericExplain =
    /\b(explain|interpret|summari[sz]e|walk me through|what matters|what are the drivers|driving factors|what is this|read this|analy[sz]e this|what stands out|break this down)\b/.test(
      text,
    );
  const genericModelingAsk =
    /\b(turn this into|use this to build|build from this|model this|create.*from this|make a model from this|use this report|plug this in)\b/.test(
      text,
    ) ||
    (/\b(build|create|generate|run|make|turn|convert)\b/.test(text) &&
      /\b(model|dcf|lbo|comps|three[- ]?statement|3[- ]?statement|scorecard|valuation|forecast|operating model)\b/.test(
        text,
      ));
  const hasStructuredSignals =
    Boolean(attachment.signals?.ticker) ||
    Boolean(attachment.signals?.companyName) ||
    Boolean(attachment.signals?.fiscalPeriod) ||
    Boolean(attachment.signals?.modelTypeHint) ||
    Boolean(attachment.signals?.extractedMetrics && attachment.signals.extractedMetrics.length > 0);
  const attachmentTicker = attachment.signals?.ticker?.trim().toUpperCase() ?? null;
  const routeTickers = route.tickers.map((ticker) => ticker.trim().toUpperCase());
  const clearCompanyQuarterLookup =
    route.intent === 'company_question' &&
    routeTickers.length > 0 &&
    /\b(q[1-4]|quarter|financials|financial report|results|earnings|release)\b/.test(text) &&
    !genericModelingAsk;
  const attachmentTickerMismatch = Boolean(
    clearCompanyQuarterLookup &&
      attachmentTicker &&
      routeTickers.length > 0 &&
      !routeTickers.includes(attachmentTicker),
  );

  if (attachmentTickerMismatch) {
    return route;
  }

  if (attachment.kind === 'model_workbook' && genericModelingAsk) {
    return {
      intent: 'financial_model',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: true,
      prefersEarningsContext: false,
      requiresQuarterReportContext: false,
    };
  }

  if (attachment.kind === 'model_workbook' && (genericExplain || route.intent === 'general_finance')) {
    return {
      intent: 'general_finance',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: false,
      prefersEarningsContext: false,
      requiresQuarterReportContext: false,
    };
  }

  if (attachment.kind === 'earnings_report') {
    if (genericModelingAsk || route.intent === 'financial_model') {
      return {
        intent: 'financial_model',
        tickers: route.tickers,
        requiresLiveData: false,
        requiresNews: false,
        requiresFinancials: true,
        prefersEarningsContext: false,
        requiresQuarterReportContext: false,
      };
    }
    if (genericExplain || route.intent === 'general_finance') {
      return {
        intent: 'company_question',
        tickers: route.tickers,
        requiresLiveData: false,
        requiresNews: false,
        requiresFinancials: true,
        prefersEarningsContext: true,
        requiresQuarterReportContext: true,
      };
    }
  }

  if ((attachment.kind === 'document' || attachment.kind === 'spreadsheet') && genericModelingAsk) {
    return {
      intent: 'financial_model',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: true,
      prefersEarningsContext: false,
      requiresQuarterReportContext: false,
    };
  }

  if (hasStructuredSignals && genericExplain && route.intent === 'general_finance') {
    return {
      intent: attachment.kind === 'model_workbook' ? 'general_finance' : 'company_question',
      tickers: route.tickers,
      requiresLiveData: false,
      requiresNews: false,
      requiresFinancials: attachment.kind !== 'model_workbook',
      prefersEarningsContext: attachment.kind !== 'model_workbook',
      requiresQuarterReportContext: attachment.kind === 'earnings_report',
    };
  }

  return route;
}
