import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getClientConfig } from './storageConfig';

type UploadParams = {
  key: string;
  buffer: Buffer;
  contentType?: string;
  expiresInSeconds?: number;
  skipUpload?: boolean;
};

let cachedClient: S3Client | null = null;

const getConfig = getClientConfig;

export function isObjectStoreConfigured(): boolean {
  const { bucket, credentials, endpoint } = getConfig();
  return Boolean(bucket && credentials?.accessKeyId && credentials?.secretAccessKey && endpoint);
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const { region, endpoint, credentials } = getConfig();

  cachedClient = new S3Client({
    region: region || 'auto',
    endpoint,
    forcePathStyle: true,
    credentials,
  });
  return cachedClient;
}

export async function uploadBufferAndSign({
  key,
  buffer,
  contentType = 'application/octet-stream',
  expiresInSeconds = 900,
  skipUpload = false,
}: UploadParams): Promise<string> {
  if (!isObjectStoreConfigured()) {
    throw new Error('Object storage not configured');
  }

  const { bucket } = getConfig();
  if (!bucket) throw new Error('Bucket not configured');

  const client = getClient();

  if (!skipUpload) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'private, max-age=0, no-store',
      })
    );
  }

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );

  return signedUrl;
}

export async function getSignedUrlForKey(key: string, expiresInSeconds: number = 900): Promise<string> {
  if (!isObjectStoreConfigured()) {
    throw new Error('Object storage not configured');
  }

  const { bucket } = getConfig();
  if (!bucket) throw new Error('Bucket not configured');

  const client = getClient();

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );

  return signedUrl;
}

/**
 * Light-weight existence check using HeadObject; returns boolean.
 */
export async function objectExists(key: string): Promise<boolean> {
  if (!isObjectStoreConfigured()) return false;
  try {
    const { bucket } = getConfig();
    if (!bucket) return false;
    const client = getClient();
    await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return false;
    return false;
  }
}
