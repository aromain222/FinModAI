export function assertString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function assertFiniteNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}
