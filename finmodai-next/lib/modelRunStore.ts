import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type RunStatus = 'assumptions_required' | 'generating' | 'generated' | 'failed';

export interface ModelRunRecord {
  id: string;
  userId?: string | null;
  modelType: string;
  ticker: string;
  asOfDate: string;
  inputsHash: string;
  status: RunStatus;
  storageKey?: string;
  fileSize?: number;
  errorMessage?: string;
  dataUrl?: string; // fallback when object storage is not used
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type StoreData = {
  runs: Record<string, ModelRunRecord>;
  hashIndex: Record<string, string>;
};

const STORE_FILE_PATH = process.env.MODEL_RUN_STORE_PATH || path.join('/tmp', 'capitalbase-model-runs.json');

function readStore(): StoreData {
  try {
    if (!fs.existsSync(STORE_FILE_PATH)) {
      return { runs: {}, hashIndex: {} };
    }
    const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      runs: parsed?.runs || {},
      hashIndex: parsed?.hashIndex || {},
    };
  } catch {
    return { runs: {}, hashIndex: {} };
  }
}

function writeStore(store: StoreData): void {
  fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store), 'utf8');
}

export function computeInputsHash(payload: any): string {
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(stable).digest('hex');
}

export function findRunByHash(hash: string): ModelRunRecord | null {
  const store = readStore();
  const id = store.hashIndex[hash];
  if (!id) return null;
  return store.runs[id] || null;
}

export function createRun(params: Omit<ModelRunRecord, 'id' | 'createdAt' | 'updatedAt'>): ModelRunRecord {
  const store = readStore();
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record: ModelRunRecord = {
    ...params,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.runs[id] = record;
  store.hashIndex[params.inputsHash] = id;
  writeStore(store);
  return record;
}

export function updateRun(id: string, patch: Partial<ModelRunRecord>): ModelRunRecord | null {
  const store = readStore();
  const existing = store.runs[id];
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  store.runs[id] = updated;
  if (updated.inputsHash) {
    store.hashIndex[updated.inputsHash] = id;
  }
  writeStore(store);
  return updated;
}

export function getRun(id: string): ModelRunRecord | null {
  const store = readStore();
  return store.runs[id] || null;
}

export function upsertRunByHash(params: Omit<ModelRunRecord, 'id' | 'createdAt' | 'updatedAt'>): ModelRunRecord {
  const existing = findRunByHash(params.inputsHash);
  if (existing) {
    return updateRun(existing.id, params) || existing;
  }
  return createRun(params);
}
