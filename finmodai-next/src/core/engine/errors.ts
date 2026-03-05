import type { EngineIssue } from '@/src/core/contracts/modelOutputs';

export const issue = (
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
  field?: string
): EngineIssue => ({
  code,
  field,
  message,
  severity,
});

export const isFatal = (issues: EngineIssue[]): boolean =>
  issues.some((entry) => entry.severity === 'error');

export const splitIssues = (issues: EngineIssue[]) => ({
  errors: issues.filter((entry) => entry.severity === 'error'),
  warnings: issues.filter((entry) => entry.severity === 'warning'),
});
