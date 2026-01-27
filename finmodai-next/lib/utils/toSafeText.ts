/**
 * toSafeText - Convert any value to a safe string for React rendering
 * 
 * Prevents "Objects are not valid as a React child" errors by ensuring
 * all error messages, details, and unknown values are strings.
 */
export function toSafeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (value instanceof Error) {
    return value.message || 'Error';
  }
  
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      // Truncate to 500 chars to prevent massive error messages
      return json.length > 500 ? json.slice(0, 500) + '...' : json;
    } catch {
      return '[Object]';
    }
  }
  
  return String(value);
}

