import crypto from 'crypto';

export const stableStringify = (value: any): string => {
  const seen = new WeakSet();
  const stringify = (val: any): any => {
    if (val && typeof val === 'object') {
      if (seen.has(val)) return null;
      seen.add(val);
      if (Array.isArray(val)) {
        return val.map((item) => stringify(item));
      }
      return Object.keys(val)
        .sort()
        .reduce((acc, key) => {
          acc[key] = stringify(val[key]);
          return acc;
        }, {} as Record<string, any>);
    }
    return val;
  };
  return JSON.stringify(stringify(value));
};

export const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');
