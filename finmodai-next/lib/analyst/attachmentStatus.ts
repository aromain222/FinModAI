import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { FamiliarFilingCategory, RawFilingType } from '@/lib/analyst/filingClassification';

export type AttachmentReadStatus = 'read_success' | 'read_partial' | 'read_failed';

export type AttachmentStatusPayload = {
  name: string;
  kind: UploadedAttachmentContext['kind'];
  serverHydrated: boolean;
  readStatus: AttachmentReadStatus;
  statementExtractionStatus: UploadedAttachmentContext['statementExtractionStatus'];
  isFinancialModelSeedable: boolean;
  hasStatementPackage: boolean;
  statementCoverage: {
    incomeStatement: boolean;
    balanceSheet: boolean;
    cashFlowStatement: boolean;
  };
  extractedIdentity: {
    companyName: string | null;
    ticker: string | null;
    fiscalPeriod: string | null;
  };
  filingView: {
    rawFilingType: RawFilingType | null;
    familiarCategory: FamiliarFilingCategory | null;
    packetFamily: FamiliarFilingCategory | null;
  };
  packetView: {
    packetKey: string | null;
    label: string | null;
    companyKey: string | null;
    periodKey: string | null;
    rawFilingTypes: RawFilingType[];
  } | null;
  warnings: string[];
};

export function buildAttachmentStatus(params: {
  attachment: UploadedAttachmentContext | null;
  attachmentInputProvided: boolean;
  isPdf: boolean;
}): AttachmentStatusPayload | null {
  const { attachment, attachmentInputProvided, isPdf } = params;
  if (!attachment || !isPdf) return null;

  const extractionStatus = attachment.statementExtractionStatus ?? 'low_confidence';
  const hasStatementPackage = Boolean(attachment.statementPackage?.snapshot);
  const readStatus: AttachmentReadStatus =
    extractionStatus === 'failed'
      ? 'read_failed'
      : extractionStatus === 'trusted' && hasStatementPackage
        ? 'read_success'
        : 'read_partial';

  return {
    name: attachment.name,
    kind: attachment.kind,
    serverHydrated: attachmentInputProvided,
    readStatus,
    statementExtractionStatus: extractionStatus,
    isFinancialModelSeedable: attachment.isFinancialModelSeedable === true,
    hasStatementPackage,
    statementCoverage: {
      incomeStatement: Boolean(attachment.statementPackage?.incomeStatement?.length),
      balanceSheet: Boolean(attachment.statementPackage?.balanceSheet?.length),
      cashFlowStatement: Boolean(attachment.statementPackage?.cashFlowStatement?.length),
    },
    extractedIdentity: {
      companyName: attachment.statementPackage?.companyName ?? attachment.signals?.companyName ?? null,
      ticker: attachment.statementPackage?.ticker ?? attachment.signals?.ticker ?? null,
      fiscalPeriod: attachment.statementPackage?.fiscalPeriod ?? attachment.signals?.fiscalPeriod ?? null,
    },
    filingView: {
      rawFilingType: attachment.filingClassification?.rawFilingType ?? null,
      familiarCategory: attachment.filingClassification?.familiarCategory ?? null,
      packetFamily: attachment.filingClassification?.packetFamily ?? null,
    },
    packetView: attachment.filingPacket
      ? {
          packetKey: attachment.filingPacket.packetKey,
          label: attachment.filingPacket.label,
          companyKey: attachment.filingPacket.companyKey,
          periodKey: attachment.filingPacket.periodKey,
          rawFilingTypes: attachment.filingPacket.rawFilingTypes,
        }
      : null,
    warnings:
      Array.from(
        new Set([
          ...(attachment.statementExtractionWarnings && attachment.statementExtractionWarnings.length > 0
            ? attachment.statementExtractionWarnings
            : attachment.warnings),
          ...(attachment.filingClassification?.warnings ?? []),
        ]),
      ),
  };
}
