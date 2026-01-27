import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type ModelType = 'three-statement' | 'dcf' | 'lbo' | 'comps';

export type ModelStatus = 'created' | 'generating' | 'ready' | 'failed';

type DbModelRecord = {
  id: string;
  ticker: string;
  model_type: ModelType;
  file_name: string | null;
  status: ModelStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  results?: Record<string, any> | null;
};

type UiModelRecord = DbModelRecord & { type: ModelType };

export type ModelRecord = UiModelRecord;

const baseSelect =
  'id, ticker, model_type, file_name, status, notes, created_at, updated_at, results';

function mapRecord(record: DbModelRecord): UiModelRecord {
  return {
    ...record,
    type: record.model_type,
  };
}

const TABLE_NAME = 'models';

const supabase = getSupabaseServerClient();

export async function getRecentModels(limit = 3) {
  const { data, error } = await supabase
    .from<DbModelRecord>(TABLE_NAME)
    .select(baseSelect)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRecord);
}

export async function listAllModels() {
  const { data, error } = await supabase
    .from<DbModelRecord>(TABLE_NAME)
    .select(baseSelect)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRecord);
}

export async function countModels() {
  const { count, error } = await supabase
    .from<ModelRecord>(TABLE_NAME)
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count ?? 0;
}

export async function getModelById(id: string) {
  const { data, error } = await supabase
    .from<DbModelRecord>(TABLE_NAME)
    .select(baseSelect)
    .eq('id', id)
    .single();

  if (error) throw error;
  return mapRecord(data);
}

export type InsertModelInput = {
  ticker: string;
  type: ModelType;
  file_name?: string | null;
  status?: ModelStatus;
  notes?: string | null;
};

export async function insertModel(record: InsertModelInput) {
  const payload = {
    status: 'ready' as ModelStatus,
    ...record,
    model_type: record.type,
  };

  const { data, error } = await supabase
    .from<DbModelRecord>(TABLE_NAME)
    .insert({
      ticker: payload.ticker,
      model_type: payload.model_type,
      file_name: payload.file_name ?? null,
      status: payload.status,
      notes: payload.notes ?? null,
    })
    .select(baseSelect)
    .single();

  if (error) throw error;
  return mapRecord(data);
}

export async function updateModelNotes(id: string, notes: string) {
  const { data, error } = await supabase
    .from<DbModelRecord>(TABLE_NAME)
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(baseSelect)
    .single();

  if (error) throw error;
  return mapRecord(data);
}
