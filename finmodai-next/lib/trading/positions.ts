import { supabase } from '@/lib/supabaseClient';

export type PositionDirection = 'LONG' | 'SHORT';
export type PositionStatus = 'PENDING' | 'OPEN' | 'CLOSED';
export type PositionResult = 'WIN' | 'LOSS' | null;

export type Position = {
  id: string;
  ticker: string;
  direction: PositionDirection;
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  sizePct: number;
  confidence: number;
  timestamp: number;
  horizon: string | null;
  status: PositionStatus;
  exitPrice: number | null;
  result: PositionResult;
  notes: string | null;
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
};

export type NewPosition = {
  ticker: string;
  direction: PositionDirection;
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  sizePct: number;
  confidence: number;
  horizon: string | null;
  notes?: string;
};

const STORAGE_KEY = 'cb_positions';
let memoryPositions: Position[] = [];

type SupabaseErrorLike = {
  message?: string;
};

type PositionInsertRow = {
  id: string;
  ticker: string;
  direction: PositionDirection;
  entry_price: number;
  target_price: number | null;
  stop_loss: number | null;
  size_pct: number;
  confidence: number;
  horizon: string | null;
  status: PositionStatus;
  opened_at: string | null;
  notes: string | null;
  created_at: string;
};

type PositionUpdateRow = {
  status: PositionStatus;
  exit_price: number;
  result: 'WIN' | 'LOSS' | null;
  closed_at: string;
};

type PositionLifecycleUpdateRow = {
  status: PositionStatus;
  opened_at: string;
};

type PositionsTableAdapter = {
  insert(row: PositionInsertRow): PromiseLike<{ error: SupabaseErrorLike | null }>;
  select(columns: '*'): {
    order(
      column: 'created_at',
      options: { ascending: boolean },
    ): PromiseLike<{ data: Record<string, unknown>[] | null; error: SupabaseErrorLike | null }>;
  };
  update(row: PositionUpdateRow): {
    eq(column: 'id', id: string): PromiseLike<{ error: SupabaseErrorLike | null }>;
  };
  update(row: PositionLifecycleUpdateRow): {
    eq(column: 'id', id: string): PromiseLike<{ error: SupabaseErrorLike | null }>;
  };
};

function getPositionsTable(): PositionsTableAdapter | null {
  if (!supabase) return null;
  return supabase.from('positions') as unknown as PositionsTableAdapter;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeStatus(value: unknown): PositionStatus {
  if (value === 'PENDING' || value === 'OPEN' || value === 'CLOSED') return value;
  if (value === 'pending') return 'PENDING';
  if (value === 'closed') return 'CLOSED';
  return 'OPEN';
}

function normalizeResult(value: unknown): PositionResult {
  if (value === 'WIN' || value === 'LOSS') return value;
  return null;
}

function loadLocal(): Position[] {
  if (typeof window === 'undefined') return memoryPositions;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Position[]) : [];
    return parsed.map((position) => ({
      ...position,
      timestamp: position.timestamp ?? position.createdAt,
      status: normalizeStatus(position.status),
      result: normalizeResult(position.result),
      openedAt: position.openedAt ?? (normalizeStatus(position.status) === 'OPEN' ? position.createdAt : null),
    }));
  } catch {
    return memoryPositions;
  }
}

function saveLocal(positions: Position[]): void {
  memoryPositions = positions;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // quota exceeded or unavailable
  }
}

function rowToPosition(row: Record<string, unknown>): Position {
  return {
    id: String(row.id),
    ticker: String(row.ticker),
    direction: row.direction as PositionDirection,
    entryPrice: Number(row.entry_price),
    targetPrice: row.target_price != null ? Number(row.target_price) : null,
    stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
    sizePct: Number(row.size_pct),
    confidence: Number(row.confidence),
    timestamp: new Date(row.created_at as string).getTime(),
    horizon: row.horizon != null ? String(row.horizon) : null,
    status: normalizeStatus(row.status),
    exitPrice: row.exit_price != null ? Number(row.exit_price) : null,
    result: normalizeResult(row.result),
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: new Date(row.created_at as string).getTime(),
    openedAt: row.opened_at != null ? new Date(row.opened_at as string).getTime() : null,
    closedAt: row.closed_at != null ? new Date(row.closed_at as string).getTime() : null,
  };
}

export async function createPosition(newPosition: NewPosition): Promise<Position> {
  const now = Date.now();
  const position: Position = {
    id: generateId(),
    ticker: newPosition.ticker,
    direction: newPosition.direction,
    entryPrice: newPosition.entryPrice,
    targetPrice: newPosition.targetPrice,
    stopLoss: newPosition.stopLoss,
    sizePct: newPosition.sizePct,
    confidence: newPosition.confidence,
    timestamp: now,
    horizon: newPosition.horizon,
    status: 'PENDING',
    exitPrice: null,
    result: null,
    notes: newPosition.notes ?? null,
    openedAt: null,
    closedAt: null,
    createdAt: now,
  };

  // Persist locally first for immediate availability
  saveLocal([position, ...loadLocal()]);

  // Try Supabase in background
  const table = getPositionsTable();
  if (table) {
    table
      .insert({
        id: position.id,
        ticker: position.ticker,
        direction: position.direction,
        entry_price: position.entryPrice,
        target_price: position.targetPrice,
        stop_loss: position.stopLoss,
        size_pct: position.sizePct,
        confidence: position.confidence,
        horizon: position.horizon,
        status: position.status,
        opened_at: null,
        notes: position.notes,
        created_at: new Date(position.createdAt).toISOString(),
      })
      .then(({ error }) => {
        if (error && process.env.NODE_ENV !== 'production') {
          console.warn('[positions] Supabase insert failed:', error.message);
        }
      });
  }

  return position;
}

export async function getPositions(): Promise<Position[]> {
  const table = getPositionsTable();
  if (table) {
    try {
      const { data, error } = await table
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const positions = data.map((row) => rowToPosition(row as Record<string, unknown>));
        saveLocal(positions);
        return positions;
      }
    } catch {
      // fall through to localStorage
    }
  }
  return loadLocal();
}

function entryCrossed(position: Position, currentPrice: number): boolean {
  if (position.status !== 'PENDING' || !Number.isFinite(currentPrice)) return false;
  return position.direction === 'LONG'
    ? currentPrice < position.entryPrice
    : currentPrice > position.entryPrice;
}

export async function updatePendingEntries(currentPrices: Record<string, number>): Promise<Position[]> {
  const now = Date.now();
  const positions = loadLocal();
  let changed = false;
  const next = positions.map((position) => {
    const currentPrice = currentPrices[position.ticker.toUpperCase()];
    if (currentPrice == null || !entryCrossed(position, currentPrice)) return position;
    changed = true;
    return {
      ...position,
      status: 'OPEN' as PositionStatus,
      openedAt: now,
    };
  });

  if (!changed) return positions;
  saveLocal(next);

  const table = getPositionsTable();
  if (table) {
    await Promise.all(
      next
        .filter((position) => position.status === 'OPEN' && position.openedAt === now)
        .map((position) =>
          table
            .update({
              status: 'OPEN',
              opened_at: new Date(now).toISOString(),
            })
            .eq('id', position.id)
            .then(({ error }) => {
              if (error && process.env.NODE_ENV !== 'production') {
                console.warn('[positions] Supabase pending-entry update failed:', error.message);
              }
            }),
        ),
    );
  }

  return next;
}

export async function closePosition(id: string, exitPrice: number): Promise<void> {
  const now = Date.now();
  const positions: Position[] = loadLocal().map((p) => {
    if (p.id !== id) return p;
    const result: PositionResult =
      p.status === 'OPEN'
        ? (p.direction === 'LONG' ? exitPrice > p.entryPrice : exitPrice < p.entryPrice)
          ? 'WIN'
          : 'LOSS'
        : null;
    return {
      ...p,
      status: 'CLOSED',
      exitPrice,
      result,
      closedAt: now,
    };
  });
  saveLocal(positions);
  const closed = positions.find((position) => position.id === id);

  const table = getPositionsTable();
  if (table && closed) {
    table
      .update({
        status: 'CLOSED',
        exit_price: exitPrice,
        result: closed.result,
        closed_at: new Date(now).toISOString(),
      })
      .eq('id', id)
      .then(({ error }) => {
        if (error && process.env.NODE_ENV !== 'production') {
          console.warn('[positions] Supabase update failed:', error.message);
        }
      });
  }
}
