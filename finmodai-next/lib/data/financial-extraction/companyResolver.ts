import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import type { ResolvedCompanyProfile } from '@/lib/data/company/types';
import type {
  FinancialExtractionJobRequest,
  ResolvedCompanyIdentity,
} from '@/lib/data/financial-extraction/types';

export type FinancialCompanyResolution = {
  identity: ResolvedCompanyIdentity;
  profile: ResolvedCompanyProfile | null;
};

function inferPrivateCompanyName(request: FinancialExtractionJobRequest): string {
  const explicit = String(request.companyName ?? '').trim();
  if (explicit) return explicit;

  const fallback = (request.fileIds ?? [])
    .map((value) => String(value).split('/').pop() ?? '')
    .map((value) => value.replace(/\.[A-Za-z0-9]+$/, '').trim())
    .find(Boolean);

  return fallback || 'Private Company';
}

export async function resolveFinancialExtractionCompany(
  request: FinancialExtractionJobRequest,
): Promise<FinancialCompanyResolution> {
  if (request.lane === 'private') {
    return {
      identity: {
        companyName: inferPrivateCompanyName(request),
        lane: 'private',
        source: 'private_upload_metadata',
        resolvedFrom: ['company_name', 'file_ids'],
      },
      profile: null,
    };
  }

  const ticker = String(request.ticker ?? request.companyIdentifier ?? '').trim().toUpperCase() || undefined;
  const companyName = String(request.companyName ?? request.companyIdentifier ?? '').trim() || undefined;
  const profile = await resolveCompanyProfile({ ticker, companyName });

  if (!profile) {
    throw new Error('Unable to resolve the requested public company.');
  }

  const identifiers = profile.identifiers ?? [];
  const cik = identifiers.find((item) => item.cik)?.cik ?? null;
  const compositeFigi = identifiers.find((item) => item.compositeFigi)?.compositeFigi ?? null;

  return {
    identity: {
      companyId: profile.company.id,
      companyName: profile.company.name,
      ticker: profile.company.ticker,
      cik,
      compositeFigi,
      lane: 'public',
      source: 'capitalbase_company_catalog',
      companyType: profile.company.companyType ?? profile.company.sector ?? null,
      resolvedFrom: [
        ticker ? 'ticker' : null,
        companyName ? 'company_name' : null,
        cik ? 'cik' : null,
        compositeFigi ? 'composite_figi' : null,
      ].filter((value): value is string => Boolean(value)),
    },
    profile,
  };
}
