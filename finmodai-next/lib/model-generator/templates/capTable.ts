import ExcelJS from 'exceljs';
import type { CapTableModelInputs } from '@/lib/model-generator/extractInputs';
import { finalizeChecksSheet, writeCheckRow } from '@/lib/model-generator/excel/checks';
import { addEquationsSheet, type EquationRow } from '@/lib/model-generator/excel/equations';
import {
  applyWorkbookMeta,
  enableWorkbookRecalculation,
  finalizeWorkbookCompatibility,
  mergeAndCenter,
  setupSheet,
  styleAccentOutput,
  styleFormula,
  styleInput,
  styleLabel,
  styleModelMeta,
  styleNarrativeBlock,
  styleOutput,
  styleSectionHeader,
  styleSubtitle,
  styleTableHeader,
  styleThinGrid,
  styleTitle,
  styleTotal,
} from '@/lib/model-generator/excel/formatting';
import { defineNamedCells } from '@/lib/model-generator/excel/namedRanges';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getPreview(inputs: CapTableModelInputs) {
  return {
    title: `${inputs.roundType} Cap Table`,
    tabs: [
      'Round Inputs',
      'Pre-Round Ownership',
      'Financing Round',
      'Post-Round Ownership',
      'Dilution Summary',
      'Scenario View',
      'Equations',
      'Checks',
    ],
    postMoney: inputs.preMoney + inputs.raiseAmount,
  };
}

export async function buildWorkbook(inputs: CapTableModelInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const existingInvestorShares = Math.round(inputs.founderShares * 0.2);
  const existingOptionPoolShares = Math.round(inputs.founderShares * 0.05);
  const newOptionPoolRefreshPct = inputs.optionPoolRefresh;
  const equations: EquationRow[] = [];

  applyWorkbookMeta(workbook, `${inputs.roundType} Financing Model`);
  enableWorkbookRecalculation(workbook);

  const inputSheet = workbook.addWorksheet('Round Inputs');
  const preRoundSheet = workbook.addWorksheet('Pre-Round Ownership');
  const financingSheet = workbook.addWorksheet('Financing Round');
  const postRoundSheet = workbook.addWorksheet('Post-Round Ownership');
  const dilutionSheet = workbook.addWorksheet('Dilution Summary');
  const scenarioSheet = workbook.addWorksheet('Scenario View');
  const checksSheet = workbook.addWorksheet('Checks');

  setupSheet(inputSheet, { freezeRows: 2, freezeCols: 0, tabColor: 'FF1D4ED8', columnWidths: [30, 18, 18, 18, 20, 18] });
  setupSheet(preRoundSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF0F766E', columnWidths: [28, 18, 18, 18, 18] });
  setupSheet(financingSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF047857', columnWidths: [30, 18, 18, 18, 18] });
  setupSheet(postRoundSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF2563EB', columnWidths: [28, 18, 18, 18, 18] });
  setupSheet(dilutionSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FF7C3AED', columnWidths: [30, 18, 18, 18, 18] });
  setupSheet(scenarioSheet, { freezeRows: 4, freezeCols: 1, tabColor: 'FF9333EA', columnWidths: [22, 18, 18, 18, 18, 18] });
  setupSheet(checksSheet, { freezeRows: 3, freezeCols: 1, tabColor: 'FFB45309', columnWidths: [30, 16, 36, 18] });

  inputSheet.getCell('A1').value = `${inputs.roundType} Financing Model`;
  mergeAndCenter(inputSheet, 'A1:F1');
  styleTitle(inputSheet.getCell('A1'));
  inputSheet.getCell('A2').value = 'Primary control sheet for ownership transition, round sizing, dilution, and post-money mechanics.';
  mergeAndCenter(inputSheet, 'A2:F2');
  styleSubtitle(inputSheet.getCell('A2'));
  styleModelMeta(inputSheet, 3, 'Round type', inputs.roundType);
  styleModelMeta(inputSheet, 4, 'Generated', formatDate(generatedAt));
  styleModelMeta(inputSheet, 5, 'Note', 'Blue cells are editable assumptions for the financing case.');

  styleSectionHeader(inputSheet, 7, 'Round Inputs', 4);
  [
    ['Round type', inputs.roundType, 'text'],
    ['Pre-money valuation', inputs.preMoney, 'currency'],
    ['New money raised', inputs.raiseAmount, 'currency'],
    ['Founder shares', inputs.founderShares, 'number'],
    ['Existing investor shares', existingInvestorShares, 'number'],
    ['Existing option pool shares', existingOptionPoolShares, 'number'],
    ['Option pool % target', inputs.optionPoolRefresh, 'percent'],
    ['New option pool refresh %', newOptionPoolRefreshPct, 'percent'],
  ].forEach(([label, value, kind], index) => {
    const row = 8 + index;
    inputSheet.getCell(`A${row}`).value = label;
    inputSheet.getCell(`B${row}`).value = value;
    styleLabel(inputSheet.getCell(`A${row}`));
    styleInput(inputSheet.getCell(`B${row}`), kind as 'text' | 'currency' | 'number' | 'percent');
  });

  defineNamedCells(workbook, inputSheet, [
    { name: 'PreMoney', cellRef: 'B9' },
    { name: 'RaiseAmount', cellRef: 'B10' },
    { name: 'FounderShares', cellRef: 'B11' },
    { name: 'ExistingInvestorShares', cellRef: 'B12' },
    { name: 'ExistingOptionPoolShares', cellRef: 'B13' },
    { name: 'OptionPoolPct', cellRef: 'B14' },
    { name: 'NewOptionPoolRefreshPct', cellRef: 'B15' },
  ]);

  styleSectionHeader(inputSheet, 7, 'Round Summary', 6);
  inputSheet.getCell('D8').value = 'Post-money valuation';
  inputSheet.getCell('E8').value = { formula: '=PreMoney+RaiseAmount' };
  inputSheet.getCell('D9').value = 'Price per share';
  inputSheet.getCell('E9').value = { formula: '=PreMoney/PreRoundFDShareCount' };
  inputSheet.getCell('D10').value = 'Primary shares issued';
  inputSheet.getCell('E10').value = { formula: '=RaiseAmount/PreMoneySharePrice' };
  inputSheet.getCell('D11').value = 'Founder post %';
  inputSheet.getCell('E11').value = { formula: `='Post-Round Ownership'!E5` };
  inputSheet.getCell('D12').value = 'New investor post %';
  inputSheet.getCell('E12').value = { formula: `='Post-Round Ownership'!E7` };
  inputSheet.getCell('D13').value = 'Option pool post %';
  inputSheet.getCell('E13').value = { formula: `='Post-Round Ownership'!E8` };
  ['D8', 'D9', 'D10', 'D11', 'D12', 'D13'].forEach((ref) => styleLabel(inputSheet.getCell(ref)));
  ['E8', 'E9', 'E10'].forEach((ref) => styleAccentOutput(inputSheet.getCell(ref), ref === 'E9' ? 'currency' : ref === 'E10' ? 'number' : 'currency'));
  ['E11', 'E12', 'E13'].forEach((ref) => styleAccentOutput(inputSheet.getCell(ref), 'percent'));
  styleThinGrid(inputSheet, 8, 13, 4, 5);
  inputSheet.getCell('D15').value =
    'Keep this sheet as the single source of truth for round assumptions. Ownership tables and dilution summaries should flow from these inputs rather than duplicate them elsewhere.';
  inputSheet.mergeCells('D15:F18');
  styleNarrativeBlock(inputSheet, 15, 4, 6);

  preRoundSheet.getCell('A1').value = 'Pre-Round Ownership';
  mergeAndCenter(preRoundSheet, 'A1:E1');
  styleTitle(preRoundSheet.getCell('A1'));
  preRoundSheet.getCell('A2').value = 'Fully diluted ownership before the financing event, including founders, investors, and the existing option pool.';
  mergeAndCenter(preRoundSheet, 'A2:E2');
  styleSubtitle(preRoundSheet.getCell('A2'));
  styleTableHeader(preRoundSheet, 4, 1, 4);
  ['Stakeholder', 'Shares', 'Ownership %', 'Implied Value'].forEach((label, index) => {
    preRoundSheet.getCell(4, 1 + index).value = label;
  });
  [
    ['Founders', '=FounderShares'],
    ['Existing Investors', '=ExistingInvestorShares'],
    ['Option Pool', '=ExistingOptionPoolShares'],
    ['Total', '=SUM(B5:B7)'],
  ].forEach((row, index) => {
    const excelRow = 5 + index;
    preRoundSheet.getCell(`A${excelRow}`).value = row[0];
    preRoundSheet.getCell(`B${excelRow}`).value = { formula: row[1] };
    preRoundSheet.getCell(`C${excelRow}`).value = { formula: `=B${excelRow}/$B$8` };
    preRoundSheet.getCell(`D${excelRow}`).value = { formula: `=C${excelRow}*PreMoney` };
    styleLabel(preRoundSheet.getCell(`A${excelRow}`));
    styleFormula(preRoundSheet.getCell(`B${excelRow}`), 'number');
    styleOutput(preRoundSheet.getCell(`C${excelRow}`), 'percent');
    styleFormula(preRoundSheet.getCell(`D${excelRow}`), 'currency');
  });
  styleTotal(preRoundSheet, 8, 1, 4);
  defineNamedCells(workbook, preRoundSheet, [{ name: 'PreRoundFDShareCount', cellRef: 'B8' }]);

  financingSheet.getCell('A1').value = 'Financing Round';
  mergeAndCenter(financingSheet, 'A1:E1');
  styleTitle(financingSheet.getCell('A1'));
  financingSheet.getCell('A2').value = 'Round mechanics showing price per share, new shares issued, and any option pool true-up required to reach the target pool.';
  mergeAndCenter(financingSheet, 'A2:E2');
  styleSubtitle(financingSheet.getCell('A2'));
  styleSectionHeader(financingSheet, 4, 'Round Mechanics', 4);
  [
    ['Pre-money share price', '=PreMoney/PreRoundFDShareCount', 'currency'],
    ['Primary shares issued', '=RaiseAmount/PreMoneySharePrice', 'number'],
    ['Option pool true-up shares', '=MAX((NewOptionPoolRefreshPct*(FounderShares+ExistingInvestorShares+ExistingOptionPoolShares+PrimarySharesIssued))/(1-NewOptionPoolRefreshPct)-ExistingOptionPoolShares,0)', 'number'],
    ['Post-money valuation', '=PreMoney+RaiseAmount', 'currency'],
    ['Post-money fully diluted shares', '=PreRoundFDShareCount+PrimarySharesIssued+OptionPoolTrueUpShares', 'number'],
  ].forEach(([label, formula, kind], index) => {
    const row = 5 + index;
    financingSheet.getCell(`A${row}`).value = label;
    financingSheet.getCell(`B${row}`).value = { formula };
    styleLabel(financingSheet.getCell(`A${row}`));
    if (kind === 'currency') styleOutput(financingSheet.getCell(`B${row}`), 'currency');
    if (kind === 'number') styleOutput(financingSheet.getCell(`B${row}`), 'number');
  });
  defineNamedCells(workbook, financingSheet, [
    { name: 'PreMoneySharePrice', cellRef: 'B5' },
    { name: 'PrimarySharesIssued', cellRef: 'B6' },
    { name: 'OptionPoolTrueUpShares', cellRef: 'B7' },
    { name: 'PostMoney', cellRef: 'B8' },
    { name: 'PostMoneyFDShareCount', cellRef: 'B9' },
  ]);

  postRoundSheet.getCell('A1').value = 'Post-Round Ownership';
  mergeAndCenter(postRoundSheet, 'A1:E1');
  styleTitle(postRoundSheet.getCell('A1'));
  postRoundSheet.getCell('A2').value = 'Post-money fully diluted ownership after primary issuance and option pool refresh.';
  mergeAndCenter(postRoundSheet, 'A2:E2');
  styleSubtitle(postRoundSheet.getCell('A2'));
  styleTableHeader(postRoundSheet, 4, 1, 5);
  ['Stakeholder', 'Existing Shares', 'New Shares', 'Fully Diluted Shares', 'Ownership %'].forEach((label, index) => {
    postRoundSheet.getCell(4, 1 + index).value = label;
  });
  [
    ['Founders', '=FounderShares', '=0'],
    ['Existing Investors', '=ExistingInvestorShares', '=0'],
    ['New Investors', '=0', '=PrimarySharesIssued'],
    ['Option Pool', '=ExistingOptionPoolShares', '=OptionPoolTrueUpShares'],
    ['Total', '=SUM(B5:B8)', '=SUM(C5:C8)'],
  ].forEach((row, index) => {
    const excelRow = 5 + index;
    postRoundSheet.getCell(`A${excelRow}`).value = row[0];
    postRoundSheet.getCell(`B${excelRow}`).value = { formula: row[1] };
    postRoundSheet.getCell(`C${excelRow}`).value = { formula: row[2] };
    postRoundSheet.getCell(`D${excelRow}`).value = { formula: `=B${excelRow}+C${excelRow}` };
    postRoundSheet.getCell(`E${excelRow}`).value = { formula: `=D${excelRow}/PostMoneyFDShareCount` };
    styleLabel(postRoundSheet.getCell(`A${excelRow}`));
    ['B', 'C', 'D'].forEach((column) => styleFormula(postRoundSheet.getCell(`${column}${excelRow}`), 'number'));
    styleOutput(postRoundSheet.getCell(`E${excelRow}`), 'percent');
  });
  styleTotal(postRoundSheet, 9, 1, 5);

  dilutionSheet.getCell('A1').value = 'Dilution Summary';
  mergeAndCenter(dilutionSheet, 'A1:E1');
  styleTitle(dilutionSheet.getCell('A1'));
  dilutionSheet.getCell('A2').value = 'Founder, investor, and option pool movement across the financing event, with explicit bridge rows for ownership changes.';
  mergeAndCenter(dilutionSheet, 'A2:E2');
  styleSubtitle(dilutionSheet.getCell('A2'));
  styleSectionHeader(dilutionSheet, 3, 'Key Dilution Outputs', 5);
  [
    ['Founder ownership pre', '=FounderShares/PreRoundFDShareCount', 'percent'],
    ['Founder ownership post', `='Post-Round Ownership'!E5`, 'percent'],
    ['Founder dilution', '=B4-B5', 'percent'],
    ['Existing investor ownership post', `='Post-Round Ownership'!E6`, 'percent'],
    ['New investor ownership post', `='Post-Round Ownership'!E7`, 'percent'],
    ['Option pool impact', `='Post-Round Ownership'!E8`, 'percent'],
  ].forEach(([label, formula, kind], index) => {
    const row = 4 + index;
    dilutionSheet.getCell(`A${row}`).value = label;
    dilutionSheet.getCell(`B${row}`).value = { formula };
    styleLabel(dilutionSheet.getCell(`A${row}`));
    styleAccentOutput(dilutionSheet.getCell(`B${row}`), kind as 'percent');
  });
  styleThinGrid(dilutionSheet, 4, 9, 1, 2);

  styleSectionHeader(dilutionSheet, 12, 'Ownership Bridge', 5);
  styleTableHeader(dilutionSheet, 13, 1, 4);
  ['Stakeholder', 'Pre-Round %', 'Post-Round %', 'Change'].forEach((label, index) => {
    dilutionSheet.getCell(13, 1 + index).value = label;
  });
  [
    ['Founders', `='Pre-Round Ownership'!C5`, `='Post-Round Ownership'!E5`],
    ['Existing Investors', `='Pre-Round Ownership'!C6`, `='Post-Round Ownership'!E6`],
    ['Option Pool', `='Pre-Round Ownership'!C7`, `='Post-Round Ownership'!E8`],
    ['New Investors', 0, `='Post-Round Ownership'!E7`],
  ].forEach(([name, preFormula, postFormula], index) => {
    const row = 14 + index;
    dilutionSheet.getCell(`A${row}`).value = name;
    dilutionSheet.getCell(`B${row}`).value = typeof preFormula === 'number' ? preFormula : { formula: preFormula };
    dilutionSheet.getCell(`C${row}`).value = typeof postFormula === 'number' ? postFormula : { formula: postFormula };
    dilutionSheet.getCell(`D${row}`).value = { formula: `=C${row}-B${row}` };
    styleLabel(dilutionSheet.getCell(`A${row}`));
    ['B', 'C'].forEach((column) => styleFormula(dilutionSheet.getCell(`${column}${row}`), 'percent'));
    styleOutput(dilutionSheet.getCell(`D${row}`), 'percent');
  });
  styleThinGrid(dilutionSheet, 14, 17, 1, 4);
  dilutionSheet.getCell('A20').value =
    'The clean read is whether dilution comes mainly from the new money itself or from the option pool expansion needed to support future hiring.';
  dilutionSheet.mergeCells('A20:E22');
  styleNarrativeBlock(dilutionSheet, 20, 1, 5);

  scenarioSheet.getCell('A1').value = 'Scenario View';
  mergeAndCenter(scenarioSheet, 'A1:F1');
  styleTitle(scenarioSheet.getCell('A1'));
  scenarioSheet.getCell('A2').value = 'Simple financing case comparison showing how valuation, round size, and pool sizing shift the post-money cap table.';
  mergeAndCenter(scenarioSheet, 'A2:F2');
  styleSubtitle(scenarioSheet.getCell('A2'));
  styleTableHeader(scenarioSheet, 4, 1, 6);
  ['Case', 'Pre-money', 'Raise', 'Option Pool %', 'Founder %', 'New Investor %'].forEach((label, index) => {
    scenarioSheet.getCell(4, 1 + index).value = label;
  });
  [
    ['Low Valuation', 0.8, 1, 0.12],
    ['Base', 1, 1, newOptionPoolRefreshPct],
    ['High Raise', 1, 1.3, 0.1],
  ].forEach(([name, preMult, raiseMult, poolPct], index) => {
    const row = 5 + index;
    scenarioSheet.getCell(`A${row}`).value = name;
    scenarioSheet.getCell(`B${row}`).value = { formula: `=PreMoney*${preMult}` };
    scenarioSheet.getCell(`C${row}`).value = { formula: `=RaiseAmount*${raiseMult}` };
    scenarioSheet.getCell(`D${row}`).value = poolPct;
    scenarioSheet.getCell(`E${row}`).value = {
      formula:
        `=FounderShares/(PreRoundFDShareCount+(C${row}/(B${row}/PreRoundFDShareCount))+` +
        `MAX((D${row}*(FounderShares+ExistingInvestorShares+ExistingOptionPoolShares+(C${row}/(B${row}/PreRoundFDShareCount))))/(1-D${row})-ExistingOptionPoolShares,0))`,
    };
    scenarioSheet.getCell(`F${row}`).value = {
      formula:
        `=(C${row}/(B${row}/PreRoundFDShareCount))/(PreRoundFDShareCount+(C${row}/(B${row}/PreRoundFDShareCount))+` +
        `MAX((D${row}*(FounderShares+ExistingInvestorShares+ExistingOptionPoolShares+(C${row}/(B${row}/PreRoundFDShareCount))))/(1-D${row})-ExistingOptionPoolShares,0))`,
    };
    styleLabel(scenarioSheet.getCell(`A${row}`));
    styleFormula(scenarioSheet.getCell(`B${row}`), 'currency');
    styleFormula(scenarioSheet.getCell(`C${row}`), 'currency');
    styleInput(scenarioSheet.getCell(`D${row}`), 'percent');
    styleOutput(scenarioSheet.getCell(`E${row}`), 'percent');
    styleOutput(scenarioSheet.getCell(`F${row}`), 'percent');
  });

  styleSectionHeader(scenarioSheet, 10, 'Scenario Readout', 6);
  scenarioSheet.getCell('A11').value = 'Base Founder %';
  scenarioSheet.getCell('B11').value = { formula: '=E6' };
  scenarioSheet.getCell('A12').value = 'Base New Investor %';
  scenarioSheet.getCell('B12').value = { formula: '=F6' };
  scenarioSheet.getCell('A13').value = 'Founder Range';
  scenarioSheet.getCell('B13').value = { formula: '=MAX(E5:E7)-MIN(E5:E7)' };
  scenarioSheet.getCell('A14').value = 'Investor Range';
  scenarioSheet.getCell('B14').value = { formula: '=MAX(F5:F7)-MIN(F5:F7)' };
  ['A11', 'A12', 'A13', 'A14'].forEach((ref) => styleLabel(scenarioSheet.getCell(ref)));
  ['B11', 'B12', 'B13', 'B14'].forEach((ref) => styleOutput(scenarioSheet.getCell(ref), 'percent'));
  styleThinGrid(scenarioSheet, 11, 14, 1, 2);

  equations.push(
    {
      metric: 'Primary shares issued',
      description: 'New money divided by pre-money price per share.',
      excelFormula: '=RaiseAmount/PreMoneySharePrice',
      dependencies: 'RaiseAmount, PreMoneySharePrice',
      location: `'Financing Round'!B6`,
    },
    {
      metric: 'Option pool true-up',
      description: 'Additional option shares required to reach the target fully diluted option pool percentage.',
      excelFormula: '=MAX((NewOptionPoolRefreshPct*(FounderShares+ExistingInvestorShares+ExistingOptionPoolShares+PrimarySharesIssued))/(1-NewOptionPoolRefreshPct)-ExistingOptionPoolShares,0)',
      dependencies: 'NewOptionPoolRefreshPct, FounderShares, ExistingInvestorShares, ExistingOptionPoolShares, PrimarySharesIssued',
      location: `'Financing Round'!B7`,
    },
    {
      metric: 'Post-round ownership %',
      description: 'Fully diluted stakeholder shares divided by total post-money fully diluted shares.',
      excelFormula: '=FullyDilutedShares/PostMoneyFDShareCount',
      dependencies: 'FullyDilutedShares, PostMoneyFDShareCount',
      location: `'Post-Round Ownership'!E5:E8`,
    }
  );

  checksSheet.getCell('A1').value = 'Checks';
  mergeAndCenter(checksSheet, 'A1:D1');
  styleTitle(checksSheet.getCell('A1'));
  styleTableHeader(checksSheet, 3, 1, 3);
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Result';
  checksSheet.getCell('C3').value = 'Commentary';
  writeCheckRow(checksSheet, 4, 'Pre-round ownership totals to 100%', `IF(ABS('Pre-Round Ownership'!$C$8-1)<0.0001,"PASS","FLAG")`, 'Pre-round ownership should sum to 100%.');
  writeCheckRow(checksSheet, 5, 'Post-round ownership totals to 100%', `IF(ABS('Post-Round Ownership'!$E$9-1)<0.0001,"PASS","FLAG")`, 'Post-round ownership should sum to 100%.');
  writeCheckRow(checksSheet, 6, 'Post-money valuation ties', `IF(ABS(PostMoney-(PreMoney+RaiseAmount))<0.5,"PASS","FLAG")`, 'Post-money must equal pre-money plus new money.');
  writeCheckRow(checksSheet, 7, 'Share count ties', `IF(ABS(PostMoneyFDShareCount-'Post-Round Ownership'!$D$9)<1,"PASS","FLAG")`, 'Post-round fully diluted shares should reconcile.');
  styleThinGrid(checksSheet, 4, 7, 1, 3);
  finalizeChecksSheet(checksSheet, 4, 7);

  addEquationsSheet(workbook, `${inputs.roundType} Cap Table`, equations);

  return finalizeWorkbookCompatibility(workbook);
}
