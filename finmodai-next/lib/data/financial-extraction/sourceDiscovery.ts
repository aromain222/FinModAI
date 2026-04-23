import path from 'node:path';
import type { ResolvedCompanyProfile } from '@/lib/data/company/types';
import type {
  ExtractionSourceArtifact,
  FinancialExtractionJobRequest,
  FinancialExtractionLane,
  ResolvedCompanyIdentity,
  SourceArtifactType,
} from '@/lib/data/financial-extraction/types';

function nowIso(): string {
  return new Date().toISOString();
}

function buildArtifact(args: {
  lane: FinancialExtractionLane;
  sourceType: SourceArtifactType;
  sourceLabel: string;
  sourceUrlOrFileId: string;
  asOfDate?: string | null;
  periodType?: FinancialExtractionJobRequest['targetPeriodType'];
  sheetNames?: string[];
  pageRefs?: number[];
  metadata?: Record<string, unknown>;
}): ExtractionSourceArtifact {
  return {
    id: `${args.sourceType}:${args.sourceUrlOrFileId}`,
    lane: args.lane,
    sourceType: args.sourceType,
    sourceLabel: args.sourceLabel,
    sourceUrlOrFileId: args.sourceUrlOrFileId,
    asOfDate: args.asOfDate ?? null,
    periodType: args.periodType ?? null,
    fetchedAt: nowIso(),
    ...(args.sheetNames?.length ? { sheetNames: args.sheetNames } : {}),
    ...(args.pageRefs?.length ? { pageRefs: args.pageRefs } : {}),
    ...(args.metadata ? { metadata: args.metadata } : {}),
  };
}

function classifyPrivateFile(fileId: string): SourceArtifactType {
  const lower = fileId.toLowerCase();
  const ext = path.extname(lower);
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return 'uploaded_spreadsheet';
  if (ext === '.pdf') {
    if (/\b(cim|confidential information memorandum)\b/.test(lower)) return 'uploaded_cim';
    if (/\b(deck|presentation|teaser)\b/.test(lower)) return 'uploaded_deck';
    return 'uploaded_pdf';
  }
  if (path.isAbsolute(fileId)) return 'local_file';
  return 'unknown_private_file';
}

function privateArtifactRank(sourceType: SourceArtifactType): number {
  switch (sourceType) {
    case 'uploaded_spreadsheet':
      return 100;
    case 'uploaded_pdf':
      return 80;
    case 'uploaded_cim':
      return 60;
    case 'uploaded_deck':
      return 50;
    case 'local_file':
      return 40;
    default:
      return 10;
  }
}

export async function discoverFinancialExtractionSources(params: {
  request: FinancialExtractionJobRequest;
  identity: ResolvedCompanyIdentity;
  profile: ResolvedCompanyProfile | null;
}): Promise<ExtractionSourceArtifact[]> {
  if (params.request.lane === 'private') {
    return (params.request.fileIds ?? [])
      .map((fileId) => {
        const sourceType = classifyPrivateFile(fileId);
        return buildArtifact({
          lane: 'private',
          sourceType,
          sourceLabel: path.basename(fileId),
          sourceUrlOrFileId: fileId,
          periodType: params.request.targetPeriodType ?? null,
        });
      })
      .sort((left, right) => privateArtifactRank(right.sourceType) - privateArtifactRank(left.sourceType));
  }

  const profile = params.profile;
  const artifacts: ExtractionSourceArtifact[] = [];
  if (!profile) return artifacts;

  if (profile.snapshot) {
    artifacts.push(
      buildArtifact({
        lane: 'public',
        sourceType: profile.snapshot.source?.startsWith('sec') ? 'sec_companyfacts' : 'stored_company_snapshot',
        sourceLabel: profile.snapshot.source ?? 'stored_snapshot',
        sourceUrlOrFileId: profile.company.ticker,
        asOfDate: profile.snapshot.asOfDate,
        periodType:
          profile.snapshot.periodType === 'quarterly'
            ? 'quarterly'
            : profile.snapshot.periodType === 'annual'
              ? 'annual'
              : 'ltm',
      }),
    );
  }

  if (profile.latestPrice?.close) {
    artifacts.push(
      buildArtifact({
        lane: 'public',
        sourceType: 'provider_snapshot',
        sourceLabel: profile.latestPrice.source ?? 'latest_price',
        sourceUrlOrFileId: profile.company.ticker,
        asOfDate: profile.latestPrice.date,
        periodType: params.request.targetPeriodType ?? null,
      }),
    );
  }

  if (params.identity.cik) {
    artifacts.push(
      buildArtifact({
        lane: 'public',
        sourceType: 'sec_companyfacts',
        sourceLabel: 'sec_companyfacts',
        sourceUrlOrFileId: `CIK${params.identity.cik}`,
        periodType: params.request.targetPeriodType ?? null,
      }),
    );
  }

  return artifacts;
}
