/**
 * Cloudflare R2 Storage Client
 * 
 * S3-compatible client for uploading and signing Excel model exports.
 * Uses R2 Access Keys (not API tokens) for authentication.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

/**
 * Assert all R2 environment variables are present
 * Throws Error with missing keys if any are missing
 */
export function assertR2Env(): void {
  const required = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing: string[] = [];
  
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`R2 env missing: ${missing.join(', ')}`);
  }
}

/**
 * Check R2 env vars (non-throwing)
 * Returns array of missing keys, or empty array if all present
 */
export function checkR2Env(): string[] {
  const required = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing: string[] = [];
  
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
    }
  }
  
  return missing;
}

/**
 * Get R2 environment variables (for debugging)
 */
export function getR2EnvDebug(): { endpoint?: string; access?: string; secret?: string; bucket?: string } {
  return {
    endpoint: process.env.R2_ENDPOINT ? '***' : undefined,
    access: process.env.R2_ACCESS_KEY_ID ? '***' : undefined,
    secret: process.env.R2_SECRET_ACCESS_KEY ? '***' : undefined,
    bucket: process.env.R2_BUCKET_NAME,
  };
}

/**
 * Get R2 S3 client
 * Requires all env vars to be set (call assertR2Env first)
 */
function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  // Ensure endpoint uses https://
  const normalizedEndpoint = endpoint.startsWith('https://') 
    ? endpoint 
    : `https://${endpoint.replace(/^https?:\/\//, '')}`;

  return new S3Client({
    region: 'auto',
    endpoint: normalizedEndpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for R2
  });
}

/**
 * Upload Excel workbook buffer to R2
 * Returns the signed download URL after successful upload
 */
export async function uploadXlsxToR2(params: {
  key: string;
  buffer: Buffer;
  filename?: string;
}): Promise<string> {
  const { key, buffer, filename } = params;
  const bucketName = process.env.R2_BUCKET_NAME!;
  
  const client = getR2Client();
  
  // Upload the file
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  try {
    await client.send(putCommand);
    console.log(`[R2] ✅ Uploaded ${key} (${buffer.length} bytes)`);
  } catch (error) {
    console.error(`[R2] ❌ Failed to upload ${key}:`, error);
    throw error;
  }

  // Generate signed URL immediately after upload
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: filename 
      ? `attachment; filename="${filename}"`
      : 'attachment',
  });

  try {
    const signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 3600 }); // 1 hour
    console.log(`[R2] ✅ Generated signed URL for ${key} (expires in 3600s)`);
    return signedUrl;
  } catch (error) {
    console.error(`[R2] ❌ Failed to generate signed URL for ${key}:`, error);
    throw error;
  }
}

/**
 * Get signed download URL for R2 object
 */
export async function getSignedDownloadUrl(params: {
  key: string;
  filename?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { key, filename, expiresInSeconds = 3600 } = params;
  const bucketName = process.env.R2_BUCKET_NAME!;
  
  const client = getR2Client();
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: filename 
      ? `attachment; filename="${filename}"`
      : 'attachment',
  });

  try {
    const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    console.log(`[R2] ✅ Generated signed URL for ${key} (expires in ${expiresInSeconds}s)`);
    return url;
  } catch (error) {
    console.error(`[R2] ❌ Failed to generate signed URL for ${key}:`, error);
    throw error;
  }
}

export type R2ObjectStream = {
  body: Readable | ReadableStream;
  contentType: string;
  contentLength?: number;
  lastModified?: Date;
  eTag?: string;
  metadata?: Record<string, string>;
};

/**
 * Fetch an object stream directly from R2 for server-side downloading.
 */
export async function getR2ObjectStream(params: { key: string }): Promise<R2ObjectStream> {
  const { key } = params;
  const bucketName = process.env.R2_BUCKET_NAME!;
  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`R2 object not found or empty: ${key}`);
  }

  const bodyStream = response.Body as Readable | ReadableStream;

  return {
    body: bodyStream,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: typeof response.ContentLength === 'number' ? response.ContentLength : undefined,
    lastModified: response.LastModified,
    eTag: response.ETag ?? undefined,
    metadata: response.Metadata ?? undefined,
  };
}

/**
 * Check if R2 is configured (non-throwing)
 */
export function isR2Configured(): boolean {
  return checkR2Env().length === 0;
}

/**
 * Health check: Test R2 connection with HeadBucketCommand
 */
export async function checkR2Health(): Promise<{ ok: boolean; error?: string; name?: string; bucket?: string }> {
  try {
    const missing = checkR2Env();
    if (missing.length > 0) {
      return { ok: false, error: `Missing env vars: ${missing.join(', ')}` };
    }

    const bucketName = process.env.R2_BUCKET_NAME!;
    const client = getR2Client();
    
    const command = new HeadBucketCommand({
      Bucket: bucketName,
    });

    await client.send(command);
    return { ok: true, bucket: bucketName };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : undefined;
    console.error('[R2] Health check failed:', error);
    return { 
      ok: false, 
      error: errorMessage,
      name: errorName,
      bucket: process.env.R2_BUCKET_NAME,
    };
  }
}
