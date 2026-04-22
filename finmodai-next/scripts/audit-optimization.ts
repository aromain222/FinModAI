import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

type Finding = {
  severity: 'high' | 'medium' | 'low';
  kind: string;
  file: string;
  summary: string;
  repair: string;
};

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'components', 'lib'];
const IGNORE_SEGMENTS = new Set(['node_modules', '.next', 'dist', 'coverage']);

const HEAVY_PACKAGE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /from ['"]react-plotly\.js['"]|from ['"]plotly\.js-dist-min['"]/, label: 'Plotly' },
  { pattern: /from ['"]react-apexcharts['"]|from ['"]apexcharts['"]/, label: 'ApexCharts' },
  { pattern: /from ['"]recharts['"]/, label: 'Recharts' },
  { pattern: /from ['"]xlsx['"]/, label: 'xlsx' },
  { pattern: /from ['"]exceljs['"]/, label: 'exceljs' },
  { pattern: /from ['"]pdf-lib['"]|from ['"]pdf-parse['"]/, label: 'PDF tooling' },
  { pattern: /from ['"]openai['"]|from ['"]langchain['"]|from ['"]@langchain\//, label: 'LLM SDK' },
];

const HEAVY_INTERNAL_IMPORTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /from ['"]@\/lib\/analyst\//, label: 'analyst runtime' },
  { pattern: /from ['"]@\/lib\/model-generator\//, label: 'model-generator runtime' },
  { pattern: /from ['"]@\/lib\/excel\//, label: 'excel runtime' },
  { pattern: /from ['"]@\/lib\/investment-analysis\//, label: 'investment-analysis runtime' },
];

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_SEGMENTS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

function getFiles(): string[] {
  const files: string[] = [];
  for (const target of TARGET_DIRS) {
    walk(join(ROOT, target), files);
  }
  return files;
}

function isClientComponent(code: string): boolean {
  return /^\s*['"]use client['"];\s*/.test(code);
}

function countMatches(code: string, pattern: RegExp): number {
  const matches = code.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
  return matches ? matches.length : 0;
}

function collectFindings(file: string, code: string): Finding[] {
  const rel = relative(ROOT, file);
  const findings: Finding[] = [];
  const client = isClientComponent(code);
  const lineCount = code.split('\n').length;
  const sizeKb = statSync(file).size / 1024;

  if (lineCount > 1200) {
    findings.push({
      severity: lineCount > 2500 ? 'high' : 'medium',
      kind: 'oversized-file',
      file: rel,
      summary: `Large module (${lineCount} lines, ${sizeKb.toFixed(1)} KB).`,
      repair: 'Split by runtime seam so routes and client surfaces import smaller modules.',
    });
  }

  if (client) {
    for (const entry of HEAVY_PACKAGE_PATTERNS) {
      if (entry.pattern.test(code)) {
        findings.push({
          severity: 'high',
          kind: 'heavy-client-package',
          file: rel,
          summary: `Client component statically imports ${entry.label}.`,
          repair: 'Move behind dynamic import or render it only in the route that needs it.',
        });
      }
    }

    for (const entry of HEAVY_INTERNAL_IMPORTS) {
      if (entry.pattern.test(code)) {
        findings.push({
          severity: 'high',
          kind: 'heavy-client-internal-import',
          file: rel,
          summary: `Client component imports ${entry.label}.`,
          repair: 'Move the heavy logic server-side or into a lighter client-safe adapter.',
        });
      }
    }

    const noStoreMatches = countMatches(code, /fetch\([^)]*cache:\s*['"]no-store['"]/);
    if (noStoreMatches > 0) {
      findings.push({
        severity: noStoreMatches > 2 ? 'high' : 'medium',
        kind: 'client-no-store-fetch',
        file: rel,
        summary: `Client component issues ${noStoreMatches} no-store fetch${noStoreMatches > 1 ? 'es' : ''}.`,
        repair: 'Cache, debounce, or move fetch orchestration to the server/route layer.',
      });
    }
  }

  if (/providerMode\s*===\s*['"]demo-seed['"]|setProviderMode\(['"]demo-seed['"]\)/.test(code)) {
    findings.push({
      severity: 'medium',
      kind: 'fallback-default',
      file: rel,
      summary: 'UI still carries an eager curated/demo-seed fallback path.',
      repair: 'Default to live or lazy fallback activation so the hot path does less work.',
    });
  }

  return findings;
}

function printFindings(findings: Finding[]): void {
  const sorted = findings.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.severity] - rank[a.severity] || a.file.localeCompare(b.file);
  });

  const counts = sorted.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, {});

  console.log('# Optimization Audit');
  console.log('');
  console.log(`Findings: ${sorted.length} (high: ${counts.high ?? 0}, medium: ${counts.medium ?? 0}, low: ${counts.low ?? 0})`);
  console.log('');

  for (const finding of sorted) {
    console.log(`- [${finding.severity.toUpperCase()}] ${finding.file}`);
    console.log(`  Kind: ${finding.kind}`);
    console.log(`  Why: ${finding.summary}`);
    console.log(`  Repair: ${finding.repair}`);
  }
}

function main(): void {
  const files = getFiles();
  const findings = files.flatMap((file) => collectFindings(file, readFileSync(file, 'utf8')));
  printFindings(findings);
}

main();
