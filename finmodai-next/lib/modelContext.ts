export type ModelRequestContext = {
  requestId: string;
  ticker: string;
  modelType: string;
  startedAtIso: string;
};

export function createRequestContext(ticker: string, modelType: string): ModelRequestContext {
  return {
    requestId: crypto.randomUUID(),
    ticker,
    modelType,
    startedAtIso: new Date().toISOString(),
  };
}
