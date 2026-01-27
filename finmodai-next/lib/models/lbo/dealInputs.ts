import { z } from 'zod';

export type LboDealInputs = {
  company: {
    name: string;
    ticker: string;
  };
  entry: {
    ebitdaMultiple: number;
    offerPremiumPct: number;
  };
  exit: {
    ebitdaMultiple: number;
    holdPeriodYears: number;
  };
  leverage: {
    targetDebtToEbitda: number;
  };
  debtPricing: {
    termLoanBRatePct: number;
    revolverRatePct: number;
  };
  fees: {
    transactionFeePct: number;
    financingFeePct: number;
  };
  liquidity: {
    minimumCashMm: number;
  };
  advanced?: {
    rolloverEquityPct?: number;
    preferredEquity?: {
      amountMm: number;
    };
    subordinatedNotesMm?: number;
    minimumCashAtCloseMm?: number;
  };
};

const PercentNumber = z.preprocess((v) => {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string' && v.trim() === '') return v;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : v;
}, z.number().finite().min(0));

const PositiveNumber = z.preprocess((v) => {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string' && v.trim() === '') return v;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : v;
}, z.number().finite().positive());

export const LboDealInputsSchema = z
  .object({
    company: z
      .object({
        name: z.string().trim().min(1),
        ticker: z.string().trim().min(1).transform((value) => value.toUpperCase()),
      })
      .strict(),
    entry: z
      .object({
        ebitdaMultiple: PositiveNumber,
        offerPremiumPct: PercentNumber,
      })
      .strict(),
    exit: z
      .object({
        ebitdaMultiple: PositiveNumber,
        holdPeriodYears: PositiveNumber,
      })
      .strict(),
    leverage: z
      .object({
        targetDebtToEbitda: PositiveNumber,
      })
      .strict(),
    debtPricing: z
      .object({
        termLoanBRatePct: PercentNumber,
        revolverRatePct: PercentNumber,
      })
      .strict(),
    fees: z
      .object({
        transactionFeePct: PercentNumber,
        financingFeePct: PercentNumber,
      })
      .strict(),
    liquidity: z
      .object({
        minimumCashMm: PositiveNumber,
      })
      .strict(),
    advanced: z
      .object({
        rolloverEquityPct: PercentNumber.optional(),
        preferredEquity: z
          .object({
            amountMm: PositiveNumber,
          })
          .strict()
          .optional(),
        subordinatedNotesMm: PositiveNumber.optional(),
        minimumCashAtCloseMm: PositiveNumber.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
