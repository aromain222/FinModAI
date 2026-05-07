import type { ActivePosition, PositionEvent, PositionStatus, ThesisDrift } from './types';

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
    return raw ? (JSON.parse(raw) as ActivePosition[]) : [];
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
  return save([position, ...existing]);
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

  return save(
    positions.map(p =>
      p.id === id
        ? { ...p, currentScore: newScore, currentSignal: newSignal, thesisDrift: drift, status, timeline: [...p.timeline, event] }
        : p,
    ),
  );
}

export { PORTFOLIO_EVENT };
