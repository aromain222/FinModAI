export async function generateMergerReport(data: Record<string, any>): Promise<string> {
  return `# Merger Analysis Report\n\n${JSON.stringify(data, null, 2)}`;
}
