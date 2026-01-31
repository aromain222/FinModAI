export async function generateModelReport(data: Record<string, any>): Promise<string> {
  return `# Financial Model Report\n\nGenerated: ${new Date().toISOString()}\n\n${JSON.stringify(data, null, 2)}`;
}
