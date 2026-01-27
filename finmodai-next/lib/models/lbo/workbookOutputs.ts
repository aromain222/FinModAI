import type ExcelJS from 'exceljs';
import { readNamedNumber, readNamedText } from '@/lib/workbookReader';
import type { LboOutputField, LboValuationOutputs } from '@/lib/models/outputTypes';

const toOutputField = <T extends number | string>(
  result: { value?: T; missing?: string }
): LboOutputField<T> =>
  result.value !== undefined
    ? { value: result.value, source: 'workbook' }
    : { reason: result.missing || 'Missing workbook value' };

export function readLboValuationOutputs(workbook: ExcelJS.Workbook): LboValuationOutputs {
  const enterpriseValue = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_ENTERPRISE_VALUE'));
  const equityValue = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_EQUITY_VALUE'));
  const netDebt = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_NET_DEBT'));
  const sharesOutstanding = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_SHARES_OUT'));
  const irr = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_IRR'));
  const moic = toOutputField<number>(readNamedNumber(workbook, 'CB_OUT_MOIC'));
  const units = toOutputField<string>(readNamedText(workbook, 'CB_META_UNITS'));

  let pricePerShare: LboOutputField<number>;
  if (equityValue.value !== undefined && sharesOutstanding.value !== undefined) {
    if (sharesOutstanding.value === 0) {
      pricePerShare = { reason: 'Shares outstanding is zero' };
    } else {
      pricePerShare = {
        value: equityValue.value / sharesOutstanding.value,
        source: 'workbook',
      };
    }
  } else {
    const reasonParts = [
      equityValue.value === undefined ? 'Equity value missing' : null,
      sharesOutstanding.value === undefined ? 'Shares outstanding missing' : null,
    ].filter(Boolean);
    pricePerShare = { reason: reasonParts.join('; ') || 'Price per share unavailable' };
  }

  return {
    enterpriseValue,
    equityValue,
    netDebt,
    sharesOutstanding,
    pricePerShare,
    irr,
    moic,
    units,
  };
}
