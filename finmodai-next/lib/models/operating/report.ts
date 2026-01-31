export async function generateOperatingReport(data: Record<string, any>): Promise<string> {
  return `# Operating Model Report\n\n${JSON.stringify(data, null, 2)}`;
}
