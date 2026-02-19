type ClientConfig = {
  region: string;
  endpoint?: string;
  bucket?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

function fromEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function getClientConfig(): ClientConfig {
  const accountId = fromEnv('R2_ACCOUNT_ID');
  const endpoint =
    fromEnv('R2_ENDPOINT', 'OBJECT_STORE_ENDPOINT') ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  const accessKeyId = fromEnv('R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'OBJECT_STORE_ACCESS_KEY_ID');
  const secretAccessKey = fromEnv('R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'OBJECT_STORE_SECRET_ACCESS_KEY');

  const bucket = fromEnv('R2_BUCKET', 'OBJECT_STORE_BUCKET');
  const region = fromEnv('R2_REGION', 'AWS_REGION') || 'auto';

  return {
    region,
    endpoint,
    bucket,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  };
}
