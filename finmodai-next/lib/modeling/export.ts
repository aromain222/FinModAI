import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { getObjectiveMetric } from './objectiveMetric';
import type { OneWaySensitivityResult } from './sensitivity';

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: Array<Record<string, any>>, headers?: string[]): string {
  if (data.length === 0) return '';

  // Get headers from first object if not provided
  const headerKeys = headers || Object.keys(data[0]);
  
  // Escape CSV values (handle commas, quotes, newlines)
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV rows
  const rows: string[] = [];
  
  // Header row
  rows.push(headerKeys.map(escapeCSV).join(','));
  
  // Data rows
  for (const row of data) {
    rows.push(headerKeys.map((key) => escapeCSV(row[key])).join(','));
  }

  return rows.join('\n');
}

/**
 * Download CSV file client-side
 */
function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export key outputs table to CSV
 */
export function exportKeyOutputsCSV(artifact: ModelAndVizArtifact): void {
  const summary = artifact.evaluation?.summary || [];
  const objectiveMetric = getObjectiveMetric(artifact);

  // Prioritize objective metric
  const sortedSummary = [...summary].sort((a, b) => {
    if (a.key === objectiveMetric.key) return -1;
    if (b.key === objectiveMetric.key) return 1;
    return 0;
  });

  const csvData = sortedSummary.map((item) => ({
    Metric: item.label,
    Key: item.key,
    Value: item.value ?? '—',
    Unit: item.unit ?? '',
  }));

  const csv = arrayToCSV(csvData, ['Metric', 'Key', 'Value', 'Unit']);
  const ticker = artifact.model.title.split('—')[0]?.trim() || 'Model';
  const filename = `${ticker}_key_outputs_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
}

/**
 * Export full table (all rows) to CSV
 */
export function exportFullTableCSV(artifact: ModelAndVizArtifact): void {
  const rows = artifact.evaluation?.rows || [];
  if (rows.length === 0) {
    alert('No data rows available for export');
    return;
  }

  // Get all unique keys from all rows
  const allKeys = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => allKeys.add(key));
  });

  // Order keys: period first, then outputs, then other fields
  const orderedKeys: string[] = [];
  const periodKey = Array.from(allKeys).find((k) => k.toLowerCase() === 'period');
  if (periodKey) {
    orderedKeys.push(periodKey);
    allKeys.delete(periodKey);
  }

  // Add output keys next
  artifact.model.outputs.forEach((out) => {
    if (allKeys.has(out.key)) {
      orderedKeys.push(out.key);
      allKeys.delete(out.key);
    }
  });

  // Add remaining keys
  Array.from(allKeys).forEach((key) => orderedKeys.push(key));

  // Convert rows to CSV format
  const csvData = rows.map((row) => {
    const csvRow: Record<string, any> = {};
    orderedKeys.forEach((key) => {
      csvRow[key] = row[key] ?? '';
    });
    return csvRow;
  });

  // Use output labels as headers where available
  const headerMap = new Map<string, string>();
  artifact.model.outputs.forEach((out) => {
    headerMap.set(out.key, out.label);
  });
  if (periodKey) {
    headerMap.set(periodKey, 'Period');
  }

  const headers = orderedKeys.map((key) => headerMap.get(key) || key);
  const csv = arrayToCSV(csvData, orderedKeys);
  
  // Replace header row with labels
  const lines = csv.split('\n');
  lines[0] = headers.join(',');
  const finalCSV = lines.join('\n');

  const ticker = artifact.model.title.split('—')[0]?.trim() || 'Model';
  const filename = `${ticker}_full_table_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(finalCSV, filename);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

