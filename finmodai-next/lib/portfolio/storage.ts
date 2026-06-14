import type {
  ActivePosition,
  PositionEvent,
  PositionMonitorResult,
  PositionStatus,
  ThesisDrift,
  ThesisSnapshot,
} from './types';
import { normalizePositionEconomics } from './positionMath';

const STORAGE_KEY = 'capitalbase:portfolio:v1';
const PORTFOLIO_EVENT = 'capitalbase:portfolio-updated';

function canUseStorage(): boolean {
  try {
    localStorage.setItem('__cb_pf_test__', '1');
    localStorage.removeItem('__cb_pf_test__');
    return true;
  } catch {
    return false;
  }
}

export function getPositions(): ActivePosition[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? (JSON.parse(raw) as ActivePosition[]).map(normalizePositionEconomics)
      : [];
  } catch {
    return [];
  }
}

export function getActivePositions(): ActivePosition[] {
  return getPositions().filter(p => p.status !== 'exited');
}

function save(positions: ActivePosition[]): ActivePosition[] {
  if (canUseStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch { /* quota exceeded — silent */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  }
  return positions;
}

export function addPosition(position: ActivePosition): ActivePosition[] {
  const existing = getPositions().filter(
    p => !(p.ticker === position.ticker && p.status !== 'exited'),
  );
  const initialSnapshot: ThesisSnapshot = {
    date:   position.entryDate,
    score:  position.entryScore,
    signal: position.entrySignal,
    drift:  'stable',
    note:   'Position opened',
  };
  return save([{
    ...normalizePositionEconomics(position),
    thesisSnapshots: [initialSnapshot],
  }, ...existing]);
}

export function updatePosition(id: string, updates: Partial<ActivePosition>): ActivePosition[] {
  return save(getPositions().map(p => (p.id === id ? { ...p, ...updates } : p)));
}

export function updateCurrentPrice(id: string, price: number): ActivePosition[] {
  return updatePosition(id, { currentPrice: price });
}

export function exitPosition(id: string): ActivePosition[] {
  return updatePosition(id, { status: 'exited', exitedAt: new Date().toISOString() });
}

export function removePosition(id: string): ActivePosition[] {
  return save(getPositions().filter(p => p.id !== id));
}

export function batchUpdatePrices(updates: Record<string, number>): ActivePosition[] {
  return save(
    getPositions().map(p =>
      p.status !== 'exited' && typeof updates[p.ticker] === 'number'
        ? { ...p, currentPrice: updates[p.ticker] }
        : p,
    ),
  );
}

export function addPositionEvent(id: string, event: PositionEvent): ActivePosition[] {
  return save(
    getPositions().map(p =>
      p.id === id ? { ...p, timeline: [...p.timeline, event] } : p,
    ),
  );
}

export function updatePositionThesis(
  id: string,
  newScore: number,
  newSignal: 'green' | 'yellow' | 'red',
  note: string,
): ActivePosition[] {
  const positions = getPositions();
  const position  = positions.find(p => p.id === id);
  if (!position) return positions;

  const scoreDelta = newScore - position.entryScore;
  let drift: ThesisDrift = 'stable';
  if (scoreDelta > 0.5)  drift = 'strengthening';
  if (scoreDelta < -0.5) drift = 'weakening';

  let status: PositionStatus = position.status;
  if (status !== 'exited') {
    if (newScore < 4.0)   status = 'broken';
    else if (scoreDelta < -1.5) status = 'weakening';
    else if (newScore >= 8.5)   status = 'extended';
    else                        status = 'working';
  }

  const event: PositionEvent = {
    id:          `${id}-upd-${Date.now()}`,
    date:        new Date().toISOString(),
    description: note,
    kind:        'thesis_update',
  };

  const newSnapshot: ThesisSnapshot = {
    date:   event.date,
    score:  newScore,
    signal: newSignal,
    drift,
    note,
  };

  return save(
    positions.map(p =>
      p.id === id
        ? {
            ...p,
            currentScore:    newScore,
            currentSignal:   newSignal,
            thesisDrift:     drift,
            status,
            timeline:        [...p.timeline, event],
            thesisSnapshots: [...(p.thesisSnapshots ?? []), newSnapshot].slice(-20),
          }
        : p,
    ),
  );
}

export function updatePositionMonitor(id: string, monitor: PositionMonitorResult): ActivePosition[] {
  const positions = getPositions();
  const position  = positions.find(p => p.id === id);
  if (!position) return positions;

  let status: PositionStatus = position.status;
  if (status !== 'exited') {
    if (monitor.action === 'Exit')       status = 'broken';
    else if (monitor.action === 'Trim')  status = 'extended';
    else if (monitor.thesisDrift === 'weakening') status = 'weakening';
    else if (monitor.updatedScore >= 8.5) status = 'extended';
    else status = 'working';
  }

  const event: PositionEvent = {
    id:          `${id}-monitor-${Date.now()}`,
    date:        monitor.asOf,
    description: `Monitor: ${monitor.action}. ${monitor.exitTrigger}`,
    kind:        monitor.action === 'Exit' ? 'risk' : 'thesis_update',
  };

  const newSnapshot: ThesisSnapshot = {
    date:   monitor.asOf,
    score:  monitor.updatedScore,
    signal: monitor.updatedSignal,
    drift:  monitor.thesisDrift,
    note:   `${monitor.action} — ${monitor.exitTrigger.slice(0, 80)}`,
  };

  return save(
    positions.map(p =>
      p.id === id
        ? {
            ...p,
            currentScore:    monitor.updatedScore,
            currentSignal:   monitor.updatedSignal,
            thesisDrift:     monitor.thesisDrift,
            currentStance:   monitor.action,
            status,
            latestMonitor:   monitor,
            timeline:        [...p.timeline, event],
            thesisSnapshots: [...(p.thesisSnapshots ?? []), newSnapshot].slice(-20),
          }
        : p,
    ),
  );
}

export { PORTFOLIO_EVENT };
