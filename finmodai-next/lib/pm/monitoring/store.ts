import { createClient } from '@supabase/supabase-js';
import type { QuantScoreSnapshot, QuantSignalEvent } from '@/lib/pm/monitoring/types';

type Row = { payload?: unknown };
type QueryResult = { data: Row[] | null; error: { message?: string } | null };

type SelectQuery = {
  eq(column: string, value: string): SelectQuery;
  order(column: string, options: { ascending: boolean }): SelectQuery;
  limit(count: number): PromiseLike<QueryResult>;
};

type TableAdapter = {
  select(columns: 'payload'): SelectQuery;
  upsert(row: Record<string, unknown>, options: { onConflict: 'id' }): PromiseLike<{ error: { message?: string } | null }>;
};

const snapshotMemory = new Map<string, QuantScoreSnapshot>();
const eventMemory = new Map<string, QuantSignalEvent>();

function table(name: 'pm_quant_score_snapshots' | 'pm_signal_events'): TableAdapter | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_API_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } }).from(name) as unknown as TableAdapter;
}

function payload<T>(row: Row): T | null {
  return row.payload && typeof row.payload === 'object' ? row.payload as T : null;
}

async function save(
  name: 'pm_quant_score_snapshots' | 'pm_signal_events',
  record: QuantScoreSnapshot | QuantSignalEvent,
): Promise<void> {
  const adapter = table(name);
  if (!adapter) return;
  const isSnapshot = name === 'pm_quant_score_snapshots';
  const { error } = await adapter.upsert({
    id: record.id,
    ticker: record.ticker,
    analyst_key: record.analystKey,
    status: isSnapshot ? null : (record as QuantSignalEvent).status,
    severity: isSnapshot ? null : (record as QuantSignalEvent).severity,
    should_escalate: isSnapshot ? null : (record as QuantSignalEvent).shouldEscalate,
    payload: record,
    created_at: isSnapshot ? (record as QuantScoreSnapshot).observedAt : record.createdAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message ?? `Could not save ${name} record`);
}

export async function saveQuantScoreSnapshot(snapshot: QuantScoreSnapshot): Promise<QuantScoreSnapshot> {
  snapshotMemory.set(snapshot.id, snapshot);
  await save('pm_quant_score_snapshots', snapshot);
  return snapshot;
}

export async function latestQuantScore(
  ticker: string,
  analystKey: QuantScoreSnapshot['analystKey'],
): Promise<QuantScoreSnapshot | null> {
  const adapter = table('pm_quant_score_snapshots');
  if (adapter) {
    const { data, error } = await adapter
      .select('payload')
      .eq('ticker', ticker.toUpperCase())
      .eq('analyst_key', analystKey)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!error && data?.[0]) return payload<QuantScoreSnapshot>(data[0]);
  }
  return [...snapshotMemory.values()]
    .filter(row => row.ticker === ticker.toUpperCase() && row.analystKey === analystKey)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null;
}

export async function listQuantScores(params: { ticker?: string; limit?: number } = {}): Promise<QuantScoreSnapshot[]> {
  const adapter = table('pm_quant_score_snapshots');
  if (adapter) {
    let query = adapter.select('payload').order('created_at', { ascending: false });
    if (params.ticker) query = query.eq('ticker', params.ticker.toUpperCase());
    const { data, error } = await query.limit(params.limit ?? 250);
    if (!error && data) return data.flatMap(row => payload<QuantScoreSnapshot>(row) ?? []);
  }
  return [...snapshotMemory.values()]
    .filter(row => !params.ticker || row.ticker === params.ticker.toUpperCase())
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .slice(0, params.limit ?? 250);
}

export async function saveQuantSignalEvent(event: QuantSignalEvent): Promise<QuantSignalEvent> {
  eventMemory.set(event.id, event);
  await save('pm_signal_events', event);
  return event;
}

export async function updateQuantSignalEvent(event: QuantSignalEvent): Promise<QuantSignalEvent> {
  return saveQuantSignalEvent(event);
}

export async function listQuantSignalEvents(params: {
  ticker?: string;
  status?: QuantSignalEvent['status'];
  limit?: number;
} = {}): Promise<QuantSignalEvent[]> {
  const adapter = table('pm_signal_events');
  if (adapter) {
    let query = adapter.select('payload').order('created_at', { ascending: false });
    if (params.ticker) query = query.eq('ticker', params.ticker.toUpperCase());
    if (params.status) query = query.eq('status', params.status);
    const { data, error } = await query.limit(params.limit ?? 250);
    if (!error && data) return data.flatMap(row => payload<QuantSignalEvent>(row) ?? []);
  }
  return [...eventMemory.values()]
    .filter(row => !params.ticker || row.ticker === params.ticker.toUpperCase())
    .filter(row => !params.status || row.status === params.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, params.limit ?? 250);
}
