import { describe, it, expect } from 'vitest';
import { assertValidAddress, assertValidColumnLetters, columnNumberToLetter, parseA1Address } from './address';

describe('excel address validation', () => {
  it('accepts valid A1 addresses', () => {
    expect(parseA1Address("DCF!$B$2")).toMatchObject({ sheet: 'DCF', colLetters: 'B', rowIndex: 2, colIndex: 2 });
    expect(parseA1Address("'My Sheet'!$AA$10")).toMatchObject({ sheet: 'My Sheet', colLetters: 'AA', rowIndex: 10 });
    expect(parseA1Address("Sheet!$XFD$1048576")).toMatchObject({ colLetters: 'XFD', colIndex: 16384, rowIndex: 1048576 });
  });

  it('rejects invalid addresses', () => {
    expect(() => assertValidAddress('DCFMC')).toThrow();
    expect(() => assertValidAddress('DCF!$DCFMC$2')).toThrow();
    expect(() => assertValidAddress('Sheet!$XFE$1')).toThrow();
    expect(() => assertValidAddress('Sheet!A1')).toThrow();
    expect(() => assertValidAddress('Sheet!$A$0')).toThrow();
  });

  it('validates column boundaries', () => {
    expect(assertValidColumnLetters('A')).toBe('A');
    expect(assertValidColumnLetters('XFD')).toBe('XFD');
    expect(() => assertValidColumnLetters('XFE')).toThrow();
  });

  it('converts column number safely', () => {
    expect(columnNumberToLetter(1)).toBe('A');
    expect(columnNumberToLetter(16384)).toBe('XFD');
    expect(() => columnNumberToLetter(0)).toThrow();
    expect(() => columnNumberToLetter(20000)).toThrow();
  });
});
