import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export type CompanyInput = {
  name: string;
  ticker: string;
};

export type DocumentCategory = '10k' | '10q' | 'presentation' | 'earnings' | 'transcript';

export type SearchProvider = 'google' | 'bing' | 'duckduckgo';

export type InvestorMaterialDocument = {
  type: string;
  category: DocumentCategory;
  title: string;
  url: string;
  local_path: string;
  source_page: string;
  format: 'pdf' | 'html';
  fetched_at: string;
};

export type ProcessCompanyResult = {
  company: string;
  ticker: string;
  ir_url: string | null;
  robots_url: string | null;
  robots_allowed: boolean | null;
  terms_url: string | null;
  documents: InvestorMaterialDocument[];
  errors: string[];
};

type CandidateLink = {
  title: string;
  url: string;
  sourcePage: string;
};

type NormalizedCandidate = CandidateLink & {
  category: DocumentCategory;
  type: string;
  format: 'pdf' | 'html';
};

type ScraperOptions = {
  baseDataDir?: string;
  timeoutMs?: number;
  retries?: number;
  searchProviders?: SearchProvider[];
  maxChildPages?: number;
  maxDocumentsPerCategory?: number;
  concurrentCompanies?: number;
  companyTimeoutMs?: number;
  userAgent?: string;
  headless?: boolean;
  onCompanyResult?: (result: ProcessCompanyResult) => Promise<void> | void;
};

const DEFAULT_OPTIONS: Required<ScraperOptions> = {
  baseDataDir: path.resolve(process.cwd(), 'data'),
  timeoutMs: 30_000,
  retries: 3,
  searchProviders: ['google', 'bing', 'duckduckgo'],
  maxChildPages: 6,
  maxDocumentsPerCategory: 6,
  concurrentCompanies: 4,
  companyTimeoutMs: 120_000,
  userAgent:
    'FinModAI Investor Materials Scraper/1.0 (research automation; contact: kingromain23@gmail.com)',
  headless: true,
  onCompanyResult: async () => {},
};

const SEARCH_BLOCKLIST = new Set([
  'google.com',
  'www.google.com',
  'bing.com',
  'www.bing.com',
  'duckduckgo.com',
  'www.duckduckgo.com',
  'finance.yahoo.com',
  'seekingalpha.com',
  'stockanalysis.com',
  'marketscreener.com',
  'wsj.com',
  'macrotrends.net',
  'wikipedia.org',
  'reddit.com',
  'x.com',
  'www.x.com',
  'linkedin.com',
  'www.linkedin.com',
]);

const NAV_KEYWORDS = [
  'investor',
  'investor relations',
  'financials',
  'earnings',
  'quarterly',
  'annual report',
  'sec filings',
  'presentations',
  'events',
  'news releases',
  'webcast',
  'results',
  'shareholder',
  'annual meeting',
  'investor day',
  'quarterly results',
  'financial results',
  'events and presentations',
];

const KNOWN_IR_URLS: Record<string, string[]> = {
  AAPL: [
    'https://investor.apple.com/',
    'https://investor.apple.com/investor-relations/',
  ],
  AAL: ['https://americanairlines.gcs-web.com/'],
  ABT: ['https://www.abbottinvestor.com/'],
  ABBV: ['https://investors.abbvie.com/'],
  ACN: ['https://investor.accenture.com/'],
  ABNB: ['https://investors.airbnb.com/'],
  ADBE: ['https://www.adobe.com/investor-relations.html'],
  ADI: ['https://investor.analog.com/'],
  AEP: ['https://www.aep.com/investors/'],
  AJG: ['https://investor.ajg.com/'],
  ALK: ['https://investor.alaskaair.com/'],
  AMAT: ['https://ir.appliedmaterials.com/'],
  AME: ['https://investors.ametek.com/'],
  AMD: ['https://ir.amd.com/'],
  AMZN: ['https://ir.aboutamazon.com/'],
  AON: ['https://investors.aon.com/'],
  APO: ['https://ir.apollo.com/'],
  APD: ['https://investors.airproducts.com/'],
  ARM: ['https://investors.arm.com/'],
  AVGO: ['https://investors.broadcom.com/'],
  AXP: ['https://ir.americanexpress.com/'],
  BA: ['https://investors.boeing.com/'],
  BAC: ['https://investor.bankofamerica.com/'],
  BKR: ['https://investors.bakerhughes.com/'],
  BLK: ['https://ir.blackrock.com/'],
  BMY: ['https://investor.bms.com/'],
  BRO: ['https://investor.bbrown.com/'],
  BSX: ['https://investors.bostonscientific.com/'],
  BX: ['https://ir.blackstone.com/'],
  CADE: ['https://ir.cadencebank.com/'],
  CAT: ['https://investors.caterpillar.com/'],
  CDNS: ['https://investors.cadence.com/'],
  CEG: ['https://investors.constellationenergy.com/'],
  CME: ['https://investor.cmegroup.com/'],
  CMI: ['https://investor.cummins.com/'],
  CMG: ['https://ir.chipotle.com/'],
  COIN: ['https://investor.coinbase.com/'],
  COP: ['https://investor.conocophillips.com/'],
  COST: ['https://investor.costco.com/'],
  CRM: ['https://investor.salesforce.com/'],
  CRWD: ['https://ir.crowdstrike.com/'],
  CSCO: ['https://investor.cisco.com/'],
  CSX: ['https://investors.csx.com/'],
  CVX: ['https://www.chevron.com/investors'],
  DAL: ['https://ir.delta.com/'],
  DASH: ['https://ir.doordash.com/'],
  DD: ['https://investors.dupont.com/'],
  DDOG: ['https://investors.datadoghq.com/'],
  DE: ['https://investor.deere.com/'],
  DELL: ['https://investors.delltechnologies.com/'],
  DVN: ['https://investors.devonenergy.com/'],
  DUK: ['https://investors.duke-energy.com/'],
  ECL: ['https://investor.ecolab.com/'],
  ED: ['https://investor.conedison.com/'],
  EMR: ['https://investors.emerson.com/'],
  EOG: ['https://investors.eogresources.com/'],
  EXC: ['https://investors.exeloncorp.com/'],
  EXPE: ['https://ir.expediagroup.com/'],
  F: ['https://shareholder.ford.com/'],
  FAST: ['https://investor.fastenal.com/'],
  FCX: ['https://investors.fcx.com/'],
  FDX: ['https://investors.fedex.com/'],
  GE: ['https://www.geaerospace.com/investor-relations'],
  GM: ['https://investor.gm.com/'],
  GLW: ['https://investor.corning.com/'],
  GOOGL: ['https://abc.xyz/investor/'],
  GOOG: ['https://abc.xyz/investor/'],
  GS: ['https://www.goldmansachs.com/investor-relations/'],
  HAL: ['https://investors.halliburton.com/'],
  HD: ['https://ir.homedepot.com/'],
  HLT: ['https://ir.hilton.com/'],
  HON: ['https://investor.honeywell.com/'],
  HOOD: ['https://investors.robinhood.com/'],
  HPE: ['https://investors.hpe.com/'],
  HUBS: ['https://ir.hubspot.com/'],
  IBM: ['https://www.ibm.com/investor/'],
  IBKR: ['https://investors.interactivebrokers.com/'],
  INTC: ['https://www.intc.com/'],
  INTU: ['https://investors.intuit.com/'],
  ITW: ['https://investor.itw.com/'],
  JCI: ['https://investors.johnsoncontrols.com/'],
  JNJ: ['https://investor.jnj.com/'],
  JPM: ['https://www.jpmorganchase.com/ir'],
  KKR: ['https://ir.kkr.com/'],
  KLAC: ['https://ir.kla.com/'],
  KO: ['https://investors.coca-colacompany.com/'],
  KMI: ['https://investor.kindermorgan.com/'],
  LCID: ['https://ir.lucidmotors.com/'],
  LLY: ['https://investor.lilly.com/'],
  LIN: ['https://investors.linde.com/'],
  LMT: ['https://investors.lockheedmartin.com/'],
  LOW: ['https://investors.lowes.com/'],
  LRCX: ['https://investor.lamresearch.com/'],
  LUV: ['https://www.southwestairlinesinvestorrelations.com/'],
  MA: ['https://investor.mastercard.com/'],
  MAR: ['https://marriott.gcs-web.com/'],
  MCD: ['https://corporate.mcdonalds.com/corpmcd/investors.html'],
  MCO: ['https://ir.moodys.com/'],
  MDLZ: ['https://ir.mondelezinternational.com/'],
  MDB: ['https://investors.mongodb.com/'],
  META: ['https://investor.fb.com/home/default.aspx'],
  MMM: ['https://investors.3m.com/'],
  MPC: ['https://ir.marathonpetroleum.com/'],
  MRK: ['https://investors.merck.com/'],
  MRVL: ['https://investor.marvell.com/'],
  MS: ['https://www.morganstanley.com/about-us-ir'],
  MSFT: ['https://www.microsoft.com/en-us/Investor/default'],
  MU: ['https://investors.micron.com/'],
  NEE: ['https://www.investornextenergy.com/'],
  NEM: ['https://investors.newmont.com/'],
  NFLX: ['https://ir.netflix.net/'],
  NKE: ['https://investors.nike.com/'],
  NOC: ['https://investor.northropgrumman.com/'],
  NOW: ['https://investors.servicenow.com/'],
  NSC: ['https://norfolksouthern.investorroom.com/'],
  NVDA: ['https://investor.nvidia.com/'],
  NXPI: ['https://investors.nxp.com/'],
  ODFL: ['https://investors.odfl.com/'],
  OKTA: ['https://investor.okta.com/'],
  OXY: ['https://www.oxy.com/investors/'],
  ORCL: ['https://investor.oracle.com/'],
  OTIS: ['https://investors.otis.com/'],
  PANW: ['https://investors.paloaltonetworks.com/'],
  PCG: ['https://investor.pgecorp.com/'],
  PEP: ['https://www.pepinvestors.com/'],
  PEG: ['https://investor.pseg.com/'],
  PFE: ['https://investors.pfizer.com/'],
  PH: ['https://investors.parker.com/'],
  PSX: ['https://investor.phillips66.com/'],
  PG: ['https://investor.pg.com/'],
  PLTR: ['https://investors.palantir.com/'],
  ROK: ['https://investors.rockwellautomation.com/'],
  RSG: ['https://investors.republicservices.com/'],
  PYPL: ['https://investor.pypl.com/'],
  QCOM: ['https://investor.qualcomm.com/'],
  RIVN: ['https://rivian.com/investors'],
  SHW: ['https://investors.sherwin-williams.com/'],
  SCHW: ['https://www.aboutschwab.com/investor-relations'],
  SHOP: ['https://investors.shopify.com/'],
  SLB: ['https://investorcenter.slb.com/'],
  SMCI: ['https://ir.supermicro.com/'],
  SNOW: ['https://investors.snowflake.com/'],
  SNPS: ['https://investor.synopsys.com/'],
  SO: ['https://investor.southerncompany.com/'],
  SPGI: ['https://investor.spglobal.com/'],
  SYK: ['https://investors.stryker.com/'],
  TEAM: ['https://investors.atlassian.com/'],
  TSLA: ['https://ir.tesla.com/'],
  TRGP: ['https://investors.targaresources.com/'],
  TT: ['https://investors.tranetechnologies.com/'],
  TXN: ['https://investor.ti.com/'],
  UAL: ['https://ir.united.com/'],
  UBER: ['https://investor.uber.com/'],
  UNH: ['https://www.unitedhealthgroup.com/investors.html'],
  UNP: ['https://investor.unionpacific.com/'],
  UPS: ['https://investors.ups.com/'],
  V: ['https://investor.visa.com/'],
  VLO: ['https://investor.valero.com/'],
  VST: ['https://investor.vistracorp.com/'],
  WDAY: ['https://investor.workday.com/'],
  WFC: ['https://www.wellsfargo.com/about/investor-relations/'],
  WMT: ['https://stock.walmart.com/'],
  WM: ['https://investors.wm.com/'],
  WMB: ['https://investor.williams.com/'],
  XOM: ['https://corporate.exxonmobil.com/investors'],
  XEL: ['https://investors.xcelenergy.com/'],
  XYZ: ['https://investors.block.xyz/'],
  ZS: ['https://ir.zscaler.com/'],
};

const COMPANY_DOMAINS: Record<string, string[]> = {
  AAL: ['aa.com'],
  ABT: ['abbott.com', 'abbottinvestor.com'],
  ABBV: ['abbvie.com'],
  ACN: ['accenture.com'],
  ABNB: ['airbnb.com'],
  ADBE: ['adobe.com'],
  ADI: ['analog.com'],
  AEP: ['aep.com'],
  AJG: ['ajg.com'],
  ALK: ['alaskaair.com'],
  AMAT: ['appliedmaterials.com'],
  AME: ['ametek.com'],
  AMD: ['amd.com'],
  APO: ['apollo.com'],
  APD: ['airproducts.com'],
  ARM: ['arm.com'],
  AVGO: ['broadcom.com'],
  AXP: ['americanexpress.com'],
  BA: ['boeing.com'],
  BAC: ['bankofamerica.com'],
  BKR: ['bakerhughes.com'],
  BLK: ['blackrock.com'],
  BMY: ['bms.com'],
  BRO: ['bbrown.com'],
  BSX: ['bostonscientific.com'],
  BX: ['blackstone.com'],
  CADE: ['cadencebank.com'],
  CAT: ['caterpillar.com'],
  CDNS: ['cadence.com'],
  CEG: ['constellationenergy.com'],
  CME: ['cmegroup.com'],
  CMI: ['cummins.com'],
  CMG: ['chipotle.com'],
  COIN: ['coinbase.com'],
  COP: ['conocophillips.com'],
  COST: ['costco.com'],
  CRM: ['salesforce.com'],
  CRWD: ['crowdstrike.com'],
  CSCO: ['cisco.com'],
  CSX: ['csx.com'],
  CVX: ['chevron.com'],
  DAL: ['delta.com', 'ir.delta.com'],
  DASH: ['doordash.com'],
  DD: ['dupont.com'],
  DDOG: ['datadoghq.com'],
  DE: ['deere.com'],
  DELL: ['delltechnologies.com'],
  DVN: ['devonenergy.com'],
  DUK: ['duke-energy.com'],
  ECL: ['ecolab.com'],
  ED: ['conedison.com'],
  EMR: ['emerson.com'],
  EOG: ['eogresources.com'],
  EXC: ['exeloncorp.com'],
  EXPE: ['expediagroup.com'],
  F: ['ford.com', 'shareholder.ford.com'],
  FAST: ['fastenal.com'],
  FCX: ['fcx.com'],
  FDX: ['fedex.com'],
  GE: ['geaerospace.com'],
  GM: ['gm.com'],
  GLW: ['corning.com'],
  GS: ['goldmansachs.com'],
  HAL: ['halliburton.com'],
  HD: ['homedepot.com'],
  HLT: ['hilton.com'],
  HON: ['honeywell.com'],
  HOOD: ['robinhood.com'],
  HPE: ['hpe.com'],
  HUBS: ['hubspot.com'],
  IBM: ['ibm.com'],
  IBKR: ['interactivebrokers.com'],
  INTC: ['intel.com', 'intc.com'],
  INTU: ['intuit.com'],
  ITW: ['itw.com'],
  JCI: ['johnsoncontrols.com'],
  JNJ: ['jnj.com'],
  KO: ['coca-colacompany.com'],
  KKR: ['kkr.com'],
  KLAC: ['kla.com'],
  KMI: ['kindermorgan.com'],
  LCID: ['lucidmotors.com'],
  LLY: ['lilly.com'],
  LIN: ['linde.com'],
  LMT: ['lockheedmartin.com'],
  LOW: ['lowes.com'],
  LRCX: ['lamresearch.com'],
  LUV: ['southwest.com', 'southwestairlinesinvestorrelations.com'],
  MA: ['mastercard.com'],
  MAR: ['marriott.com'],
  MCD: ['mcdonalds.com'],
  MCO: ['moodys.com'],
  MDLZ: ['mondelezinternational.com'],
  MDB: ['mongodb.com'],
  MRK: ['merck.com'],
  MMM: ['3m.com'],
  MPC: ['marathonpetroleum.com'],
  MRVL: ['marvell.com'],
  MS: ['morganstanley.com'],
  MU: ['micron.com'],
  NEE: ['nexteraenergy.com', 'investornextenergy.com'],
  NEM: ['newmont.com'],
  NFLX: ['netflix.net', 'netflix.com'],
  NKE: ['nike.com'],
  NOC: ['northropgrumman.com'],
  NOW: ['servicenow.com'],
  NSC: ['norfolksouthern.com', 'investorroom.com'],
  ORCL: ['oracle.com'],
  NXPI: ['nxp.com'],
  ODFL: ['odfl.com'],
  OKTA: ['okta.com'],
  OXY: ['oxy.com'],
  OTIS: ['otis.com'],
  PEP: ['pepsico.com', 'pepinvestors.com'],
  PANW: ['paloaltonetworks.com'],
  PCG: ['pgecorp.com'],
  PEG: ['pseg.com'],
  PFE: ['pfizer.com'],
  PH: ['parker.com'],
  PSX: ['phillips66.com'],
  PG: ['pg.com'],
  PLTR: ['palantir.com'],
  PYPL: ['pypl.com', 'paypal.com'],
  QCOM: ['qualcomm.com'],
  RIVN: ['rivian.com'],
  ROK: ['rockwellautomation.com'],
  RSG: ['republicservices.com'],
  SHW: ['sherwin-williams.com'],
  SCHW: ['schwab.com', 'aboutschwab.com'],
  SHOP: ['shopify.com'],
  SLB: ['slb.com'],
  SMCI: ['supermicro.com'],
  SNOW: ['snowflake.com'],
  SNPS: ['synopsys.com'],
  SO: ['southerncompany.com'],
  SPGI: ['spglobal.com'],
  SYK: ['stryker.com'],
  TEAM: ['atlassian.com'],
  TSLA: ['tesla.com'],
  TRGP: ['targaresources.com'],
  TT: ['tranetechnologies.com'],
  TXN: ['ti.com'],
  UAL: ['united.com', 'ir.united.com'],
  UBER: ['uber.com'],
  UNH: ['unitedhealthgroup.com'],
  UNP: ['up.com', 'unionpacific.com'],
  UPS: ['ups.com'],
  V: ['visa.com'],
  VLO: ['valero.com'],
  VST: ['vistracorp.com'],
  WDAY: ['workday.com'],
  WFC: ['wellsfargo.com'],
  WMT: ['walmart.com'],
  WM: ['wm.com'],
  WMB: ['williams.com'],
  XOM: ['exxonmobil.com'],
  XEL: ['xcelenergy.com'],
  XYZ: ['block.xyz'],
  ZS: ['zscaler.com'],
};

const DOCUMENT_RULES: Array<{
  category: DocumentCategory;
  type: string;
  patterns: RegExp[];
}> = [
  {
    category: '10k',
    type: '10-K',
    patterns: [/\b10-k\b/i, /\bannual report\b/i, /\bannual filing\b/i, /\bform 10-k\b/i],
  },
  {
    category: '10q',
    type: '10-Q',
    patterns: [/\b10-q\b/i, /\bquarterly report\b/i, /\bquarterly filing\b/i, /\bform 10-q\b/i],
  },
  {
    category: 'transcript',
    type: 'Transcript',
    patterns: [/\btranscript\b/i, /\bprepared remarks\b/i, /\bconference call\b/i],
  },
  {
    category: 'presentation',
    type: 'Presentation',
    patterns: [
      /\bpresentation\b/i,
      /\binvestor deck\b/i,
      /\bearnings deck\b/i,
      /\bslides\b/i,
      /\bannual meeting\b/i,
      /\bndr\b/i,
    ],
  },
  {
    category: 'earnings',
    type: 'Earnings Release',
    patterns: [/\bearnings\b/i, /\bpress release\b/i, /\bresults\b/i, /\bshareholder letter\b/i],
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140) || 'document';
}

function normalizeUrl(url: string, baseUrl?: string): string | null {
  if (!url) return null;
  try {
    const normalized = baseUrl ? new URL(url, baseUrl) : new URL(url);
    normalized.hash = '';
    return normalized.toString();
  } catch {
    return null;
  }
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathName(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function inferFormat(url: string): 'pdf' | 'html' {
  return pathName(url).endsWith('.pdf') ? 'pdf' : 'html';
}

function isDownloadableDocumentUrl(url: string): boolean {
  const pathname = pathName(url);
  if (!pathname) return false;
  if (pathname.endsWith('.pdf') || pathname.endsWith('.htm') || pathname.endsWith('.html') || pathname.endsWith('.aspx')) {
    return true;
  }
  if (isSecFilingUrl(url)) return true;
  if (/\.(mp3|mp4|wav|mov|m4a|zip|xlsx?|csv|pptx?)$/i.test(pathname)) return false;
  return !/\.[a-z0-9]{2,5}$/i.test(pathname);
}

function extractRecencyScore(value: string): number {
  const matches = [...value.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (matches.length > 0) {
    return Math.max(...matches.map((match) => Number(match[1])));
  }
  return 0;
}

function limitCandidatesByCategory<T extends { category: DocumentCategory; title: string; url: string }>(
  items: T[],
  maxPerCategory: number,
): T[] {
  const byCategory = new Map<DocumentCategory, T[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.category) ?? [];
    bucket.push(item);
    byCategory.set(item.category, bucket);
  }

  const out: T[] = [];
  for (const bucket of byCategory.values()) {
    bucket.sort((a, b) => {
      const scoreB = extractRecencyScore(`${b.title} ${b.url}`);
      const scoreA = extractRecencyScore(`${a.title} ${a.url}`);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.title.localeCompare(b.title);
    });
    out.push(...bucket.slice(0, maxPerCategory));
  }

  return out;
}

function matchesRule(text: string): { category: DocumentCategory; type: string } | null {
  const haystack = text.toLowerCase();
  for (const rule of DOCUMENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return { category: rule.category, type: rule.type };
    }
  }
  return null;
}

function isSecFilingUrl(url: string): boolean {
  return /sec\.gov/i.test(url) || /\/Archives\/edgar\//i.test(url);
}

function isLikelyDocumentLink(candidate: CandidateLink): NormalizedCandidate | null {
  const combined = `${candidate.title} ${candidate.url}`;
  const match = matchesRule(combined);
  const format = inferFormat(candidate.url);

  if (!match) {
    if (!candidate.url.toLowerCase().includes('.pdf') && !isSecFilingUrl(candidate.url)) {
      return null;
    }
    return null;
  }

  if (!isDownloadableDocumentUrl(candidate.url)) {
    return null;
  }

  if (format !== 'pdf' && !isSecFilingUrl(candidate.url) && !/earnings|transcript|presentation|report/i.test(combined)) {
    return null;
  }

  return { ...candidate, ...match, format };
}

function isLikelyOfficialIrUrl(url: string, company: CompanyInput): boolean {
  const host = hostName(url);
  if (!host || SEARCH_BLOCKLIST.has(host)) return false;
  const combined = `${url}`.toLowerCase();
  const companyNeedle = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const hostNeedle = host.replace(/[^a-z0-9]+/g, '');
  const mentionsInvestor = /investor|investors|shareholder|annualreports|financials/.test(combined);
  const companyMatches = companyNeedle.length >= 4 && hostNeedle.includes(companyNeedle.slice(0, Math.min(companyNeedle.length, 8)));
  return mentionsInvestor || companyMatches;
}

function candidateIrUrlsForCompany(company: CompanyInput): string[] {
  const ticker = company.ticker.toUpperCase();
  const overrides = KNOWN_IR_URLS[ticker] ?? [];
  const domains = COMPANY_DOMAINS[ticker] ?? [];
  const prefixes = ['investor', 'investors', 'ir', 'stock'];
  const landingPaths = [
    '',
    'overview/default.aspx',
    'home/default.aspx',
    'investor-relations/default.aspx',
    'financials/default.aspx',
    'events/default.aspx',
    'events-and-presentations/default.aspx',
    'presentations/default.aspx',
    'events-presentations/default.aspx',
    'quarterly-results/default.aspx',
    'financial-results/default.aspx',
    'news-events/default.aspx',
  ];
  const derived = domains.flatMap((domain) => [
    ...prefixes.flatMap((prefix) => landingPaths.map((landingPath) => `https://${prefix}.${domain}/${landingPath}`)),
    `https://www.${domain}/investor-relations`,
    `https://www.${domain}/investors`,
    `https://www.${domain}/investor`,
    `https://${domain}/investor-relations`,
    `https://${domain}/investors`,
    `https://${domain}/investor`,
  ]);
  return uniqueByUrl([...overrides, ...derived].map((url) => ({ url }))).map((row) => row.url);
}

async function validateIrCandidate(
  browser: Browser,
  url: string,
  options: Required<ScraperOptions>,
): Promise<string | null> {
  const page = await browser.newPage({ userAgent: options.userAgent });
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
    const html = (await page.content()).toLowerCase();
    const title = (await page.title()).toLowerCase();
    const finalUrl = page.url().toLowerCase();
    const combined = `${title} ${html.slice(0, 20_000)}`;
    const hasInvestorText = /investor relations|investor|sec filings|annual report|quarterly earnings|earnings/.test(combined);
    const hasInvestorUrlSignal =
      /\/investor|\/investors|\/investor-relations|\/financial-results|\/events/.test(finalUrl) ||
      /^https:\/\/(investor|investors|ir|stock)\./.test(finalUrl);
    const hasDocumentSignals =
      /10-k|10-q|annual report|quarterly report|earnings release|presentation|transcript|webcast/.test(combined);
    const looksBroken = /404|not found|access denied|forbidden|error/.test(`${title} ${html.slice(0, 5_000)}`);

    if (!looksBroken && (hasInvestorText || (hasInvestorUrlSignal && hasDocumentSignals) || hasInvestorUrlSignal)) {
      return page.url();
    }
    return null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

function buildSearchUrl(provider: SearchProvider, company: CompanyInput): string {
  const query = encodeURIComponent(`${company.name} investor relations`);
  if (provider === 'google') return `https://www.google.com/search?q=${query}`;
  if (provider === 'bing') return `https://www.bing.com/search?q=${query}`;
  return `https://duckduckgo.com/html/?q=${query}`;
}

async function withRetries<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }
  throw new Error(`${label} failed after ${retries} attempts: ${String(lastError)}`);
}

function createHttpClient(options: Required<ScraperOptions>): AxiosInstance {
  return axios.create({
    timeout: options.timeoutMs,
    maxRedirects: 5,
    headers: {
      'User-Agent': options.userAgent,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });
}

async function extractAnchorsFromPage(page: Page): Promise<Array<{ href: string; text: string }>> {
  return page.$$eval('a', (anchors) =>
    anchors
      .map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href ?? '',
        text: (anchor.textContent ?? '').trim(),
      }))
      .filter((row) => row.href),
  );
}

async function maybeExpandInteractiveSections(page: Page): Promise<void> {
  const buttons = page.locator('button, [role="button"], summary');
  const count = await buttons.count();
  const max = Math.min(count, 20);

  for (let index = 0; index < max; index += 1) {
    const handle = buttons.nth(index);
    const text = normalizeWhitespace(await handle.textContent());
    if (!text) continue;
    if (!NAV_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword))) continue;
    try {
      await handle.click({ timeout: 1_500 });
      await page.waitForLoadState('domcontentloaded', { timeout: 1_500 }).catch(() => null);
    } catch {
      // Best-effort expansion only.
    }
  }
}

async function collectLinksFromHtml(page: Page, baseUrl: string): Promise<CandidateLink[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const links: CandidateLink[] = [];

  $('a[href]').each((_, element) => {
    const href = normalizeUrl($(element).attr('href') ?? '', baseUrl);
    if (!href) return;
    const title = normalizeWhitespace($(element).text()) || normalizeWhitespace($(element).attr('title')) || href;
    links.push({ title, url: href, sourcePage: page.url() || baseUrl });
  });

  return links;
}

function dedupeCandidates<T extends CandidateLink>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.url}|${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function uniqueByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function extractSearchResults(page: Page, provider: SearchProvider): Promise<CandidateLink[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const candidates: CandidateLink[] = [];

  if (provider === 'google') {
    $('a[href^="/url?q="]').each((_, element) => {
      const href = $(element).attr('href') ?? '';
      const raw = href.replace(/^\/url\?q=/, '').split('&')[0];
      const decoded = normalizeUrl(decodeURIComponent(raw));
      if (!decoded || SEARCH_BLOCKLIST.has(hostName(decoded))) return;
      const title =
        normalizeWhitespace($(element).text()) ||
        normalizeWhitespace($(element).closest('div').find('h3').first().text()) ||
        decoded;
      candidates.push({ title, url: decoded, sourcePage: page.url() });
    });
  } else if (provider === 'bing') {
    $('li.b_algo h2 a, li.b_algo a').each((_, element) => {
      const href = normalizeUrl($(element).attr('href') ?? '');
      if (!href || SEARCH_BLOCKLIST.has(hostName(href))) return;
      const title = normalizeWhitespace($(element).text()) || href;
      candidates.push({ title, url: href, sourcePage: page.url() });
    });
  } else {
    $('a.result__a, .result a[href]').each((_, element) => {
      const href = normalizeUrl($(element).attr('href') ?? '');
      if (!href || SEARCH_BLOCKLIST.has(hostName(href))) return;
      const title = normalizeWhitespace($(element).text()) || href;
      candidates.push({ title, url: href, sourcePage: page.url() });
    });
  }

  if (candidates.length > 0) {
    return dedupeCandidates(candidates);
  }

  const anchors = await extractAnchorsFromPage(page);
  for (const anchor of anchors) {
    let href = anchor.href;
    if (provider === 'google' && href.startsWith('/url?q=')) {
      href = decodeURIComponent(href.replace(/^\/url\?q=/, '').split('&')[0]);
    }
    const normalized = normalizeUrl(href);
    if (!normalized || SEARCH_BLOCKLIST.has(hostName(normalized))) continue;
    const title = normalizeWhitespace(anchor.text) || normalized;
    candidates.push({ title, url: normalized, sourcePage: page.url() });
  }

  return dedupeCandidates(candidates);
}

export async function searchIRPage(
  browser: Browser,
  company: CompanyInput,
  options: ScraperOptions = {},
): Promise<string | null> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  for (const candidate of candidateIrUrlsForCompany(company)) {
    const winner = await validateIrCandidate(browser, candidate, resolved);
    if (winner) return winner;
  }

  for (const provider of resolved.searchProviders) {
    const page = await browser.newPage({ userAgent: resolved.userAgent });
    try {
      await page.goto(buildSearchUrl(provider, company), {
        waitUntil: 'domcontentloaded',
        timeout: resolved.timeoutMs,
      });
      await page.waitForTimeout(1_000);
      const results = await extractSearchResults(page, provider);
      const winner = results.find((candidate) => isLikelyOfficialIrUrl(candidate.url, company));
      if (winner) return winner.url;
    } catch {
      // move to next provider
    } finally {
      await page.close();
    }
  }
  return null;
}

export async function fetchRobotsStatus(
  http: AxiosInstance,
  targetUrl: string,
): Promise<{ robotsUrl: string | null; allowed: boolean | null }> {
  try {
    const origin = new URL(targetUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const response = await http.get<string>(robotsUrl, { responseType: 'text' });
    const text = response.data.toLowerCase();
    const blockedAll = /user-agent:\s*\*\s*disallow:\s*\/\s*/i.test(text);
    return { robotsUrl, allowed: !blockedAll };
  } catch {
    return { robotsUrl: null, allowed: null };
  }
}

async function discoverTermsUrl(page: Page): Promise<string | null> {
  const anchors = await extractAnchorsFromPage(page);
  const terms = anchors.find((anchor) =>
    /\bterms\b|\bterms of use\b|\bterms & conditions\b|\blegal\b|\bprivacy\b/i.test(anchor.text),
  );
  return terms ? normalizeUrl(terms.href) : null;
}

async function scrapeSinglePage(
  page: Page,
  url: string,
  options: Required<ScraperOptions>,
): Promise<CandidateLink[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
  await maybeExpandInteractiveSections(page);
  const domLinks = await extractAnchorsFromPage(page);
  const htmlLinks = await collectLinksFromHtml(page, url);
  const normalizedDomLinks: CandidateLink[] = domLinks
    .map((anchor) => ({
      title: normalizeWhitespace(anchor.text) || anchor.href,
      url: normalizeUrl(anchor.href) ?? anchor.href,
      sourcePage: page.url() || url,
    }))
    .filter((anchor) => anchor.url);

  return dedupeCandidates([...normalizedDomLinks, ...htmlLinks]);
}

async function collectRelevantChildPages(rootUrl: string, links: CandidateLink[], maxChildPages: number): Promise<string[]> {
  const root = new URL(rootUrl);
  const childPages = links
    .filter((link) => {
      const href = link.url.toLowerCase();
      if (inferFormat(href) === 'pdf') return false;
      if (isSecFilingUrl(href)) return false;
      const sameHost = hostName(href) === root.hostname.toLowerCase();
      const text = `${link.title} ${href}`.toLowerCase();
      const pathLikelyRelevant =
        /earnings|results|presentation|transcript|webcast|event|investor|financial|quarter|annual|sec|shareholder/.test(
          pathName(href),
        );
      return sameHost && (NAV_KEYWORDS.some((keyword) => text.includes(keyword)) || pathLikelyRelevant);
    })
    .map((link) => link.url);

  return uniqueByUrl(childPages.map((url) => ({ url }))).slice(0, maxChildPages).map((item) => item.url);
}

export async function scrapeIRPage(
  browser: Browser,
  irUrl: string,
  options: ScraperOptions = {},
): Promise<{ documents: NormalizedCandidate[]; termsUrl: string | null }> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const page = await browser.newPage({ userAgent: resolved.userAgent });
  try {
    const rootLinks = await scrapeSinglePage(page, irUrl, resolved);
    const termsUrl = await discoverTermsUrl(page);
    const childUrls = await collectRelevantChildPages(irUrl, rootLinks, resolved.maxChildPages);

    const allLinks = [...rootLinks];
    for (const childUrl of childUrls) {
      try {
        const childLinks = await scrapeSinglePage(page, childUrl, resolved);
        allLinks.push(...childLinks);
      } catch {
        // Child pages are best-effort.
      }
    }

    const candidates = dedupeCandidates(allLinks)
      .map((link) => isLikelyDocumentLink(link))
      .filter((link): link is NormalizedCandidate => Boolean(link));

    return {
      documents: limitCandidatesByCategory(uniqueByUrl(candidates), resolved.maxDocumentsPerCategory),
      termsUrl,
    };
  } finally {
    await page.close();
  }
}

function buildSecArchiveUrl(cik: string, accession: string, primaryDocument: string): string {
  const cikNoLeadingZeros = String(Number(cik));
  const accessionNoDashes = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDashes}/${primaryDocument}`;
}

async function resolveSecCompany(http: AxiosInstance, company: CompanyInput): Promise<{ cik: string } | null> {
  try {
    const response = await http.get<Record<string, { cik_str: number; ticker: string; title: string }>>(
      'https://www.sec.gov/files/company_tickers.json',
      { responseType: 'json' },
    );
    const rows = Object.values(response.data);
    const match = rows.find((row) => row.ticker.toUpperCase() === company.ticker.toUpperCase());
    if (!match) return null;
    return { cik: String(match.cik_str).padStart(10, '0') };
  } catch {
    return null;
  }
}

export async function fetchEdgarFallbackDocuments(
  http: AxiosInstance,
  company: CompanyInput,
  options: ScraperOptions = {},
): Promise<NormalizedCandidate[]> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const secCompany = await resolveSecCompany(http, company);
  if (!secCompany) return [];

  try {
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${secCompany.cik}.json`;
    const response = await http.get<any>(submissionsUrl, { responseType: 'json' });
    const recent = response.data?.filings?.recent;
    if (!recent) return [];

    const forms: string[] = recent.form ?? [];
    const accessions: string[] = recent.accessionNumber ?? [];
    const primaryDocs: string[] = recent.primaryDocument ?? [];
    const filingDates: string[] = recent.filingDate ?? [];

    const out: NormalizedCandidate[] = [];
    const categoryCounts: Partial<Record<DocumentCategory, number>> = {};
    for (let i = 0; i < forms.length; i += 1) {
      const form = forms[i];
      const date = filingDates[i];
      const primaryDocument = primaryDocs[i];
      const accession = accessions[i];
      if (!form || !primaryDocument || !accession) continue;

      const docUrl = buildSecArchiveUrl(secCompany.cik, accession, primaryDocument);
      const title = `${company.ticker} ${form} ${date ?? ''}`.trim();
      const synthetic = isLikelyDocumentLink({
        title,
        url: docUrl,
        sourcePage: submissionsUrl,
      });
      if (!synthetic) continue;

      if (!['10k', '10q'].includes(synthetic.category)) continue;
      const currentCount = categoryCounts[synthetic.category] ?? 0;
      if (currentCount >= resolved.maxDocumentsPerCategory) continue;
      out.push(synthetic);
      categoryCounts[synthetic.category] = currentCount + 1;
    }

    return limitCandidatesByCategory(uniqueByUrl(out), resolved.maxDocumentsPerCategory);
  } catch {
    return [];
  }
}

export async function downloadFile(
  http: AxiosInstance,
  ticker: string,
  document: NormalizedCandidate,
  options: ScraperOptions = {},
): Promise<InvestorMaterialDocument> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const categoryDir = path.join(resolved.baseDataDir, ticker, document.category);
  await fs.mkdir(categoryDir, { recursive: true });

  const urlPath = pathName(document.url);
  const hash = createHash('sha1').update(document.url).digest('hex').slice(0, 10);
  const titlePart = sanitizeFileName(document.title || path.basename(urlPath) || `${document.type}-${hash}`);
  const extension =
    document.format === 'pdf'
      ? '.pdf'
      : path.extname(urlPath) && path.extname(urlPath).length <= 5
        ? path.extname(urlPath)
        : '.html';
  const localPath = path.join(categoryDir, `${titlePart}-${hash}${extension}`);

  try {
    await fs.access(localPath);
    return {
      type: document.type,
      category: document.category,
      title: document.title,
      url: document.url,
      local_path: localPath,
      source_page: document.sourcePage,
      format: document.format,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    // Continue to download
  }

  const response = await http.get<ArrayBuffer>(document.url, { responseType: 'arraybuffer' });
  await fs.writeFile(localPath, Buffer.from(response.data));

  return {
    type: document.type,
    category: document.category,
    title: document.title,
    url: document.url,
    local_path: localPath,
    source_page: document.sourcePage,
    format: document.format,
    fetched_at: new Date().toISOString(),
  };
}

export async function processCompany(
  browser: Browser,
  company: CompanyInput,
  options: ScraperOptions = {},
): Promise<ProcessCompanyResult> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const http = createHttpClient(resolved);
  const errors: string[] = [];

  const irUrl = await withRetries(() => searchIRPage(browser, company, resolved), resolved.retries, `${company.ticker} IR search`).catch(
    (error) => {
      errors.push(String(error));
      return null;
    },
  );

  let robotsUrl: string | null = null;
  let robotsAllowed: boolean | null = null;
  let termsUrl: string | null = null;
  let candidates: NormalizedCandidate[] = [];

  if (irUrl) {
    const robots = await fetchRobotsStatus(http, irUrl);
    robotsUrl = robots.robotsUrl;
    robotsAllowed = robots.allowed;

    if (robotsAllowed === false) {
      errors.push(`Robots policy blocks scraping for ${irUrl}`);
    } else {
      try {
        const scraped = await withRetries(() => scrapeIRPage(browser, irUrl, resolved), resolved.retries, `${company.ticker} IR scrape`);
        termsUrl = scraped.termsUrl;
        candidates = scraped.documents;
      } catch (error) {
        errors.push(String(error));
      }
    }
  } else {
    errors.push(`Could not locate IR page for ${company.name}`);
  }

  if (candidates.length === 0) {
    const fallbackDocs = await fetchEdgarFallbackDocuments(http, company, resolved).catch((error) => {
      errors.push(`SEC EDGAR fallback failed: ${String(error)}`);
      return [];
    });
    candidates = fallbackDocs;
  }

  candidates = limitCandidatesByCategory(uniqueByUrl(candidates), resolved.maxDocumentsPerCategory);

  const documents: InvestorMaterialDocument[] = [];
  for (const candidate of candidates) {
    try {
      const downloaded = await withRetries(
        () => downloadFile(http, company.ticker, candidate, resolved),
        resolved.retries,
        `${company.ticker} ${candidate.url}`,
      );
      documents.push(downloaded);
      await sleep(600);
    } catch (error) {
      errors.push(`Download failed for ${candidate.url}: ${String(error)}`);
    }
  }

  return {
    company: company.name,
    ticker: company.ticker,
    ir_url: irUrl,
    robots_url: robotsUrl,
    robots_allowed: robotsAllowed,
    terms_url: termsUrl,
    documents,
    errors,
  };
}

export async function processCompanies(
  companies: CompanyInput[],
  options: ScraperOptions = {},
): Promise<ProcessCompanyResult[]> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const browser = await chromium.launch({ headless: resolved.headless });
  try {
    const queue = [...companies];
    const results: ProcessCompanyResult[] = [];
    const workers = Array.from({ length: Math.min(resolved.concurrentCompanies, companies.length) }, async () => {
      while (queue.length > 0) {
        const company = queue.shift();
        if (!company) return;
        const result = await withTimeout(
          processCompany(browser, company, resolved).catch((error) => ({
            company: company.name,
            ticker: company.ticker,
            ir_url: null,
            robots_url: null,
            robots_allowed: null,
            terms_url: null,
            documents: [],
            errors: [String(error)],
          })),
          resolved.companyTimeoutMs,
          `${company.ticker} scrape`,
        ).catch((error) => ({
          company: company.name,
          ticker: company.ticker,
          ir_url: null,
          robots_url: null,
          robots_allowed: null,
          terms_url: null,
          documents: [],
          errors: [String(error)],
        }));
        results.push(result);
        await resolved.onCompanyResult(result);
      }
    });
    await Promise.all(workers);
    return results.sort((a, b) => a.ticker.localeCompare(b.ticker));
  } finally {
    await browser.close();
  }
}
