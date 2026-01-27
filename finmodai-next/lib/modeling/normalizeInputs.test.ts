import { describe, it, expect } from 'vitest';
import { normalizeInputs, NormalizeInputsError } from './normalizeInputs';

describe('normalizeInputs', () => {
  it('normalizes LBO ticker from tickerSymbol', () => {
    const result = normalizeInputs('lbo', { tickerSymbol: 'aapl', assumptions: { foo: 1 } });
    expect(result.modelType).toBe('lbo');
    expect(result.primaryTicker).toBe('AAPL');
    expect(result.tickers).toEqual(['AAPL']);
    expect(result.assumptions.ticker).toBe('AAPL');
    expect(result.assumptions.foo).toBe(1);
  });

  it('normalizes ticker from assumptions.company.ticker', () => {
    const result = normalizeInputs('lbo', { assumptions: { company: { ticker: 'msft' } } });
    expect(result.primaryTicker).toBe('MSFT');
    expect(result.assumptions.company.ticker).toBe('MSFT');
  });

  it('accepts COMPS peers-only payload and derives primaryTicker', () => {
    const result = normalizeInputs('comps', { peers: ['aapl', 'msft', 'goog'] });
    expect(result.modelType).toBe('comps');
    expect(result.primaryTicker).toBe('AAPL');
    expect(result.tickers).toEqual(['AAPL', 'MSFT', 'GOOG']);
  });

  it('requires at least 3 peers for COMPS when no ticker present', () => {
    expect(() => normalizeInputs('comps', { peers: ['aapl', 'msft'] })).toThrowError(NormalizeInputsError);
  });

  it('normalizes merger pair from buyer/target', () => {
    const result = normalizeInputs('merger', { buyer: 'msft', target: 'atvi' });
    expect(result.modelType).toBe('merger');
    expect(result.primaryTicker).toBe('MSFT');
    expect(result.tickers).toEqual(['MSFT', 'ATVI']);
    expect(result.merger).toEqual({ acquirer: 'MSFT', target: 'ATVI' });
  });

  it('normalizes merger pair from nested mergerInputs objects', () => {
    const result = normalizeInputs('merger', {
      mergerInputs: {
        buyer: { tickerSymbol: 'msft' },
        seller: { ticker: 'atvi' },
      },
    });
    expect(result.merger).toEqual({ acquirer: 'MSFT', target: 'ATVI' });
  });
});

