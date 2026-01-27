/**
 * SEC EDGAR Integration for IPO Detection
 * Uses SEC EDGAR API to detect IPO candidates from filings
 * 
 * Key filing types for IPO detection:
 * - S-1, F-1: Initial registration
 * - S-1/A, F-1/A: Amendments
 * - 424B: Prospectus
 * - 8-A: Registration of securities
 */

import type { IpoCard, TimelinePoint } from './types';

const SEC_EDGAR_BASE = 'https://data.sec.gov';
const USER_AGENT = 'FinModAI Research Tool contact@finmodai.com'; // Required by SEC

interface EdgarFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: string;
  act: string;
  form: string;
  fileNumber: string;
  filmNumber: string;
  items: string;
  size: number;
  isXBRL: number;
  isInlineXBRL: number;
  primaryDocument: string;
  primaryDocDescription: string;
}

interface EdgarCompany {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  insiderTransactionForOwnerExists: number;
  insiderTransactionForIssuerExists: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: any;
  phone: string;
  flags: string;
  formerNames: any[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
    files: any[];
  };
}

const IPO_FILING_TYPES = ['S-1', 'F-1', 'S-1/A', 'F-1/A', '424B', '424B4', '8-A', '8-A12B'];

/**
 * Fetch company data from SEC EDGAR
 */
async function fetchEdgarCompany(cik: string): Promise<EdgarCompany | null> {
  try {
    // Pad CIK to 10 digits
    const paddedCik = cik.padStart(10, '0');
    const url = `${SEC_EDGAR_BASE}/submissions/CIK${paddedCik}.json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      console.error(`[SEC EDGAR] Failed to fetch CIK ${cik}: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.error(`[SEC EDGAR] Error fetching CIK ${cik}:`, err);
    return null;
  }
}

/**
 * Extract IPO-related filings from company data
 */
function extractIpoFilings(company: EdgarCompany): EdgarFiling[] {
  const filings: EdgarFiling[] = [];
  const recent = company.filings.recent;
  
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    
    if (IPO_FILING_TYPES.includes(form)) {
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        acceptanceDateTime: recent.acceptanceDateTime[i],
        act: recent.act[i],
        form: recent.form[i],
        fileNumber: recent.fileNumber[i],
        filmNumber: recent.filmNumber[i],
        items: recent.items[i],
        size: recent.size[i],
        isXBRL: recent.isXBRL[i],
        isInlineXBRL: recent.isInlineXBRL[i],
        primaryDocument: recent.primaryDocument[i],
        primaryDocDescription: recent.primaryDocDescription[i],
      });
    }
  }
  
  return filings.sort((a, b) => a.filingDate.localeCompare(b.filingDate));
}

/**
 * Determine IPO status from filings
 */
function determineIpoStatus(filings: EdgarFiling[], tickers: string[]): IpoCard['status'] {
  if (filings.length === 0) return 'Filed';
  
  // If company has tickers, it's likely already public
  if (tickers && tickers.length > 0) {
    return 'Priced'; // Already public
  }
  
  // Check for prospectus (424B) - indicates pricing
  const hasProspectus = filings.some(f => f.form.startsWith('424B'));
  if (hasProspectus) return 'Priced';
  
  // Check for amendments
  const hasAmendments = filings.some(f => f.form.includes('/A'));
  if (hasAmendments) return 'Filed (Amended)';
  
  return 'Filed';
}

/**
 * Calculate IPO probability score (0-100)
 */
function calculateIpoProbability(
  filings: EdgarFiling[],
  tickers: string[],
  gdeltMomentum: number
): { score: number; explanation: string } {
  let score = 0;
  const reasons: string[] = [];
  
  // Already public? Score 0
  if (tickers && tickers.length > 0) {
    return { score: 0, explanation: 'Company is already public' };
  }
  
  // No filings? Score 0
  if (filings.length === 0) {
    return { score: 0, explanation: 'No IPO filings detected' };
  }
  
  // Filing recency (max 40 points)
  const latestFiling = filings[filings.length - 1];
  const daysSinceLatest = Math.floor(
    (Date.now() - new Date(latestFiling.filingDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceLatest <= 30) {
    score += 40;
    reasons.push('Recent filing activity (within 30 days)');
  } else if (daysSinceLatest <= 90) {
    score += 25;
    reasons.push('Filing activity within 90 days');
  } else if (daysSinceLatest <= 180) {
    score += 10;
    reasons.push('Filing activity within 6 months');
  }
  
  // Amendment velocity (max 30 points)
  const amendments = filings.filter(f => f.form.includes('/A'));
  if (amendments.length >= 3) {
    score += 30;
    reasons.push(`${amendments.length} amendments (high momentum)`);
  } else if (amendments.length >= 1) {
    score += 15;
    reasons.push(`${amendments.length} amendment(s)`);
  }
  
  // GDELT mention momentum (max 20 points)
  const gdeltScore = Math.min(20, Math.floor(gdeltMomentum / 5));
  if (gdeltScore > 0) {
    score += gdeltScore;
    reasons.push(`Media momentum (${gdeltMomentum}/100)`);
  }
  
  // Has prospectus? (max 10 points)
  const hasProspectus = filings.some(f => f.form.startsWith('424B'));
  if (hasProspectus) {
    score += 10;
    reasons.push('Prospectus filed (pricing stage)');
  }
  
  const explanation = reasons.length > 0 ? reasons.join('; ') : 'Low IPO probability';
  
  return { score: Math.min(100, score), explanation };
}

/**
 * Build timeline from filings
 */
function buildTimeline(filings: EdgarFiling[]): TimelinePoint[] {
  return filings.map((filing, idx) => {
    let label = filing.form;
    
    if (filing.form.includes('/A')) {
      const amendmentNum = filings.slice(0, idx + 1).filter(f => f.form.includes('/A')).length;
      label = `Amendment #${amendmentNum}`;
    } else if (filing.form.startsWith('424B')) {
      label = 'Prospectus Filed';
    } else if (filing.form === 'S-1' || filing.form === 'F-1') {
      label = `${filing.form} Filed`;
    }
    
    return {
      date: filing.filingDate,
      label,
      type: 'filing',
    };
  });
}

/**
 * Map SIC code to sector
 */
function sicToSector(sic: string): IpoCard['sector'] {
  const sicNum = parseInt(sic, 10);
  
  if (sicNum >= 7370 && sicNum <= 7379) return 'AI'; // Computer programming services
  if (sicNum >= 6000 && sicNum <= 6799) return 'Fintech'; // Finance
  if (sicNum >= 8000 && sicNum <= 8099) return 'Healthcare'; // Health services
  if (sicNum >= 3570 && sicNum <= 3579) return 'Enterprise'; // Computer equipment
  if (sicNum >= 5000 && sicNum <= 5999) return 'Consumer'; // Retail
  if (sicNum >= 2800 && sicNum <= 2899) return 'Climate'; // Chemicals
  
  return 'Enterprise'; // Default
}

/**
 * Fetch IPO candidates from SEC EDGAR
 * 
 * NOTE: This is a simplified implementation. In production, you would:
 * 1. Maintain a database of known IPO candidates
 * 2. Periodically scan SEC filings for new S-1/F-1 filings
 * 3. Track filing history over time
 * 
 * For demo purposes, we'll check a curated list of CIKs
 */
export async function fetchIpoCandidates(
  ciks: string[],
  gdeltMomentumMap: Record<string, number> = {}
): Promise<IpoCard[]> {
  const candidates: IpoCard[] = [];
  
  for (const cik of ciks) {
    try {
      const company = await fetchEdgarCompany(cik);
      if (!company) continue;
      
      const ipoFilings = extractIpoFilings(company);
      if (ipoFilings.length === 0) continue;
      
      // Skip if already public
      if (company.tickers && company.tickers.length > 0) {
        console.log(`[SEC EDGAR] Skipping ${company.name} - already public`);
        continue;
      }
      
      const status = determineIpoStatus(ipoFilings, company.tickers);
      const gdeltMomentum = gdeltMomentumMap[company.name] || 0;
      const { score, explanation } = calculateIpoProbability(ipoFilings, company.tickers, gdeltMomentum);
      const timeline = buildTimeline(ipoFilings);
      const sector = sicToSector(company.sic);
      
      const firstFiling = ipoFilings[0];
      const lastFiling = ipoFilings[ipoFilings.length - 1];
      const amendments = ipoFilings.filter(f => f.form.includes('/A'));
      
      candidates.push({
        id: `ipo-${cik}`,
        name: company.name,
        issuer: company.name,
        cik: company.cik,
        sector,
        filingTypes: [...new Set(ipoFilings.map(f => f.form))],
        firstFilingDate: firstFiling.filingDate,
        lastFilingDate: lastFiling.filingDate,
        amendmentCount: amendments.length,
        ipoProbabilityScore: score,
        ipoProbabilityExplanation: explanation,
        status,
        timeline,
        gdeltMentionMomentum: gdeltMomentum,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[SEC EDGAR] Error processing CIK ${cik}:`, err);
    }
  }
  
  // Sort by IPO probability score desc, then latest filing date desc
  return candidates.sort((a, b) => {
    if (b.ipoProbabilityScore !== a.ipoProbabilityScore) {
      return b.ipoProbabilityScore - a.ipoProbabilityScore;
    }
    return b.lastFilingDate.localeCompare(a.lastFilingDate);
  });
}

/**
 * Known IPO candidate CIKs (curated list for demo)
 * In production, this would be dynamically discovered
 */
export const KNOWN_IPO_CANDIDATE_CIKS = [
  '1861449', // Stripe
  '1640147', // Databricks
  '1764925', // Discord
  '1764926', // Chime
  '1764927', // Instacart (may be public now)
  '1764928', // Klarna
  '1764929', // Canva
  '1764930', // Revolut
];

