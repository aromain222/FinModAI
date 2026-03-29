import fs from 'fs/promises';
import path from 'path';
import { processCompanies, CompanyInput, ProcessCompanyResult } from '../lib/scraping/investorMaterials';

const DEFAULT_COMPANIES: CompanyInput[] = [
  { name: 'Apple', ticker: 'AAPL' },
  { name: 'Microsoft', ticker: 'MSFT' },
  { name: 'NVIDIA', ticker: 'NVDA' },
  { name: 'Amazon', ticker: 'AMZN' },
  { name: 'Alphabet', ticker: 'GOOGL' },
  { name: 'Meta Platforms', ticker: 'META' },
];

function parseCompaniesArg(argv: string[]): CompanyInput[] {
  const companiesFileArg = argv.find((arg) => arg.startsWith('--companies-file='));
  if (companiesFileArg) {
    return [];
  }

  const companiesArg = argv.find((arg) => arg.startsWith('--companies='));
  if (!companiesArg) {
    return DEFAULT_COMPANIES;
  }

  const raw = companiesArg.slice('--companies='.length);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('--companies must be a JSON array');
  return parsed.map((item) => ({
    name: String(item.name),
    ticker: String(item.ticker).toUpperCase(),
  }));
}

function shouldSkipExisting(argv: string[]): boolean {
  if (argv.includes('--skip-existing=false')) return false;
  return true;
}

function parseOutputArg(argv: string[], baseDataDir: string): string {
  const outputArg = argv.find((arg) => arg.startsWith('--output='));
  if (!outputArg) {
    return path.join(baseDataDir, 'investor-materials-scrape-results.json');
  }
  return path.resolve(outputArg.slice('--output='.length));
}

async function filterMissingCompanies(baseDataDir: string, companies: CompanyInput[]): Promise<CompanyInput[]> {
  const out: CompanyInput[] = [];

  for (const company of companies) {
    try {
      const stat = await fs.stat(path.join(baseDataDir, company.ticker));
      if (stat.isDirectory()) continue;
    } catch {
      out.push(company);
    }
  }

  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const baseDataDir = path.resolve(process.cwd(), 'data');
  await fs.mkdir(baseDataDir, { recursive: true });
  const outputPath = parseOutputArg(argv, baseDataDir);
  let parsedCompanies = parseCompaniesArg(argv);
  const companiesFileArg = argv.find((arg) => arg.startsWith('--companies-file='));
  if (companiesFileArg) {
    const filePath = path.resolve(companiesFileArg.slice('--companies-file='.length));
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('--companies-file must contain a JSON array');
    parsedCompanies = parsed.map((item) => ({
      name: String(item.name),
      ticker: String(item.ticker).toUpperCase(),
    }));
  }
  const companies = shouldSkipExisting(argv)
    ? await filterMissingCompanies(baseDataDir, parsedCompanies)
    : parsedCompanies;

  if (companies.length === 0) {
    process.stderr.write('No missing companies to scrape.\n');
    return;
  }

  const partialResults: ProcessCompanyResult[] = [];
  const flushResults = async (): Promise<void> => {
    const sorted = [...partialResults].sort((a, b) => a.ticker.localeCompare(b.ticker));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(sorted, null, 2));
  };

  const results = await processCompanies(companies, {
    baseDataDir,
    timeoutMs: 30_000,
    retries: 3,
    concurrentCompanies: 3,
    companyTimeoutMs: 120_000,
    maxChildPages: 10,
    maxDocumentsPerCategory: 4,
    headless: true,
    onCompanyResult: async (result) => {
      partialResults.push(result);
      await flushResults();
      const richCount = result.documents.filter((document) =>
        ['earnings', 'presentation', 'transcript'].includes(document.category),
      ).length;
      process.stderr.write(
        `Processed ${result.ticker}: ${result.documents.length} docs (${richCount} rich), errors=${result.errors.length}\n`,
      );
    },
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.stderr.write(`Saved metadata to ${outputPath}\n`);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(`Investor materials scrape failed: ${String(error)}\n`);
    process.exit(1);
  });
}
