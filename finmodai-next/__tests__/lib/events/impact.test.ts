import { describe, it, expect } from 'vitest';
import { inferEventImpact } from '@/lib/events/impact';

describe('inferEventImpact', () => {
  it('scores hot CPI as risk-off with higher rates', () => {
    const impact = inferEventImpact({ title: 'US CPI hotter than expected, inflation surges', topic: 'cpi' });
    expect(impact.primaryChannel).toBe('rates');
    expect(impact.direction).toBe('risk_off');
    expect(impact.channels.rates).toBeGreaterThan(0);
    expect(impact.score).toBeGreaterThan(60);
  });

  it('scores cool CPI as risk-on with lower rates', () => {
    const impact = inferEventImpact({ title: 'CPI cools, inflation easing', topic: 'inflation' });
    expect(impact.direction).toBe('risk_on');
    expect(impact.channels.rates).toBeLessThan(0);
  });

  it('flags hawkish Fed as risk-off', () => {
    const impact = inferEventImpact({ title: 'Fed signals higher for longer, hawkish tilt', topic: 'fed' });
    expect(impact.direction).toBe('risk_off');
    expect(impact.channels.rates).toBeGreaterThan(0);
  });

  it('captures oil supply shock', () => {
    const impact = inferEventImpact({ title: 'OPEC announces surprise production cut', topic: 'oil' });
    expect(impact.primaryChannel).toBe('commodities');
    expect(impact.channels.commodities).toBeGreaterThan(0);
    expect(impact.score).toBeGreaterThan(60);
  });

  it('captures credit widening', () => {
    const impact = inferEventImpact({ title: 'HY credit spreads widen sharply on downgrade', topic: 'credit' });
    expect(impact.primaryChannel).toBe('credit');
    expect(impact.direction).toBe('risk_off');
    expect(impact.channels.credit).toBeLessThan(0);
  });
});
