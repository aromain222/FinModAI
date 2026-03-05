/* eslint-disable no-console */

const baseUrl = process.env.EVENTS_BASE_URL || process.argv[2] || 'http://localhost:3000';
const endpoint = `${baseUrl.replace(/\/$/, '')}/api/market/events?provider=live&view=active&debug=1&force=1`;

async function main() {
  console.log(`[events-smoke] GET ${endpoint}`);
  const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
  const payload = (await response.json()) as Record<string, unknown>;

  const diagnostics = (payload.diagnostics ?? {}) as Record<string, unknown>;
  const counts = {
    fetchedCandidatesCount: diagnostics.fetchedCandidatesCount ?? 0,
    dedupedCount: diagnostics.dedupedCount ?? 0,
    gatedCount: diagnostics.gatedCount ?? 0,
    clusteredCount: diagnostics.clusteredCount ?? 0,
    classifiedCount: diagnostics.classifiedCount ?? 0,
    persistedCount: diagnostics.persistedCount ?? 0,
    returnedCount: diagnostics.returnedCount ?? 0,
  };

  console.log('[events-smoke] status', response.status);
  console.log('[events-smoke] provider', payload.provider);
  console.log('[events-smoke] warning', payload.warning ?? null);
  console.log('[events-smoke] error', payload.error ?? null);
  console.log('[events-smoke] counts', counts);
  console.log('[events-smoke] cacheHit', diagnostics.cacheHit ?? false);
  console.log('[events-smoke] openaiCallCount', diagnostics.openaiCallCount ?? 0);
  console.log('[events-smoke] schemaParseFailures', diagnostics.schemaParseFailures ?? 0);
  console.log('[events-smoke] openaiErrors', diagnostics.openaiErrors ?? []);
}

main().catch((error) => {
  console.error('[events-smoke] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
