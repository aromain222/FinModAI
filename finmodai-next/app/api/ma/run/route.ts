"use server";

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { computeMaComputedOutputs } from '@/lib/models/merger/maComparison';
import { SerializedMaDealInputs } from '@/lib/models/merger/maDealInputs';
import { addNamedRangeSafe } from '@/lib/excel/namedRanges';

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return value;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const numericField = z.preprocess(parseNumber, z.number().finite());

const companySchema = z.object({
  name: z.string().min(1),
  ticker: z.string().min(1),
  sharePrice: numericField,
  sharesOutstanding: numericField,
  netIncome: numericField,
});

const maDealInputsSchema = z
  .object({
    acquirer: companySchema,
    target: companySchema,
    pricing: z.object({
      offerPremiumPct: numericField,
    }),
    consideration: z.object({
      cashPct: numericField,
      stockPct: numericField,
    }),
    synergies: z
      .object({
        revenueSynergiesMm: numericField.optional(),
        costSynergiesMm: numericField.optional(),
      })
      .optional(),
    transaction: z.object({
      feesMm: numericField,
    }),
  })
  .strict();

type ParsedMaDealInputs = z.infer<typeof maDealInputsSchema>;

const serializeForWorkbook = (inputs: SerializedMaDealInputs) => {
  const acquirerPrefix = 'Acquirer';
  const targetPrefix = 'Target';
  return [
    [acquirerPrefix, 'Name', inputs.acquirer.name],
    [acquirerPrefix, 'Ticker', inputs.acquirer.ticker],
    [acquirerPrefix, 'Share Price', inputs.acquirer.sharePrice],
    [acquirerPrefix, 'Shares Outstanding', inputs.acquirer.sharesOutstanding],
    [acquirerPrefix, 'Net Income', inputs.acquirer.netIncome],
    [targetPrefix, 'Name', inputs.target.name],
    [targetPrefix, 'Ticker', inputs.target.ticker],
    [targetPrefix, 'Share Price', inputs.target.sharePrice],
    [targetPrefix, 'Shares Outstanding', inputs.target.sharesOutstanding],
    [targetPrefix, 'Net Income', inputs.target.netIncome],
    ['Deal', 'Offer Premium (%)', inputs.pricing.offerPremiumPct],
    ['Deal', 'Cash Consideration (%)', inputs.consideration.cashPct],
    ['Deal', 'Stock Consideration (%)', inputs.consideration.stockPct],
    ['Deal', 'Transaction Fees ($MM)', inputs.transaction.feesMm],
  ];
};

const formatCellValue = (value: Decimal) => Number(value.toNumber().toFixed(4));

const buildWorkbook = (inputs: SerializedMaDealInputs) => {
  const computed = computeMaComputedOutputs(inputs);
  const synergyValue = new Decimal(inputs.synergies?.revenueSynergiesMm ?? 0)
    .plus(new Decimal(inputs.synergies?.costSynergiesMm ?? 0));
  const proFormaNetIncome = new Decimal(inputs.acquirer.netIncome)
    .plus(new Decimal(inputs.target.netIncome))
    .plus(new Decimal(inputs.synergies?.revenueSynergiesMm ?? 0))
    .plus(new Decimal(inputs.synergies?.costSynergiesMm ?? 0))
    .minus(new Decimal(inputs.transaction.feesMm));

  const workbook = new ExcelJS.Workbook();

  const inputsSheet = workbook.addWorksheet('Inputs');
  inputsSheet.columns = [
    { header: 'Category', key: 'category' },
    { header: 'Field', key: 'field' },
    { header: 'Value', key: 'value' },
  ];
  serializeForWorkbook(inputs).forEach((row) => {
    inputsSheet.addRow(row);
  });

  const outputsSheet = workbook.addWorksheet('Outputs');
  outputsSheet.columns = [
    { header: 'Metric', key: 'metric' },
    { header: 'Value', key: 'value' },
    { header: 'Units', key: 'units' },
  ];
  const outputRows = [
    ['Target Equity Value', computed.targetEquityValue, 'MM'],
    ['Stock Consideration', computed.stockConsideration, 'MM'],
    ['Cash Consideration', computed.cashConsideration, 'MM'],
    ['New Shares Issued', computed.newSharesIssued, 'Shares'],
    ['Pro Forma Shares', computed.proFormaShares, 'Shares'],
    ['Standalone EPS', computed.standaloneEps, 'USD'],
    ['Pro Forma EPS', computed.proFormaEps, 'USD'],
    ['Accretion %', computed.accretionPct, '%'],
    ['Pro Forma Net Income', proFormaNetIncome, 'MM'],
  ];
  outputRows.forEach((row) => {
    outputsSheet.addRow([row[0], formatCellValue(row[1] as Decimal), row[2]]);
  });

  addNamedRangeSafe(workbook, { name: 'CB_MA_TARGET_EQUITY_VALUE', ref: `'Outputs'!$B$2`, context: { modelType: 'ma' } });
  addNamedRangeSafe(workbook, { name: 'CB_MA_NEW_SHARES', ref: `'Outputs'!$B$5`, context: { modelType: 'ma' } });
  addNamedRangeSafe(workbook, { name: 'CB_MA_PROFORMA_SHARES', ref: `'Outputs'!$B$6`, context: { modelType: 'ma' } });
  addNamedRangeSafe(workbook, { name: 'CB_MA_STANDALONE_EPS', ref: `'Outputs'!$B$7`, context: { modelType: 'ma' } });
  addNamedRangeSafe(workbook, { name: 'CB_MA_PROFORMA_EPS', ref: `'Outputs'!$B$8`, context: { modelType: 'ma' } });
  addNamedRangeSafe(workbook, { name: 'CB_MA_ACCRETION_PCT', ref: `'Outputs'!$B$9`, context: { modelType: 'ma' } });
  outputsSheet.getCell('D1').value = 'mm';
  addNamedRangeSafe(workbook, { name: 'CB_META_UNITS', ref: `'Outputs'!$D$1`, context: { modelType: 'ma' } });

  const comparisonSheet = workbook.addWorksheet('Comparison');
  comparisonSheet.columns = [
    { header: 'Metric', key: 'metric' },
    { header: 'Standalone', key: 'standalone' },
    { header: 'Pro Forma', key: 'proforma' },
    { header: 'Notes', key: 'notes' },
  ];
  comparisonSheet.addRow(['Net Income', inputs.acquirer.netIncome, proFormaNetIncome.toNumber(), 'Includes synergies and fees.']);
  comparisonSheet.addRow(['Shares Outstanding', inputs.acquirer.sharesOutstanding, computed.proFormaShares.toNumber(), 'Includes new issuance.']);
  comparisonSheet.addRow(['EPS', computed.standaloneEps.toNumber(), computed.proFormaEps.toNumber(), 'Used for accretion/dilution.']);
  comparisonSheet.addRow([
    'Synergies (run-rate)',
    null,
    synergyValue.toNumber(),
    'Adds to pro forma net income.',
  ]);

  return workbook;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = maDealInputsSchema.safeParse(body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      return NextResponse.json(
        {
          error: 'INVALID_MA_INPUTS',
          message: 'Payload validation failed for M&A inputs.',
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const serializedInputs = parseResult.data as SerializedMaDealInputs;
    const workbook = buildWorkbook(serializedInputs);
    const buffer = await workbook.xlsx.writeBuffer();
    const acquirer = serializedInputs.acquirer.ticker.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const target = serializedInputs.target.ticker.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `CapitalBase_MA_${acquirer}_${target}_${date}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    const message = error?.message ?? 'Failed to generate M&A workbook.';
    return NextResponse.json(
      {
        error: 'INVALID_MA_INPUTS',
        message,
      },
      { status: 400 }
    );
  }
}
