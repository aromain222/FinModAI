import crypto from 'node:crypto';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { isObjectStoreConfigured, uploadBufferAndSign } from '@/lib/storage/objectStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'upload');
  return base.replace(/[^A-Za-z0-9._-]/g, '-');
}

export async function POST(req: NextRequest) {
  if (!isObjectStoreConfigured()) {
    return NextResponse.json(
      { error: 'Object storage is not configured for private extraction uploads.' },
      { status: 503 },
    );
  }

  const formData = await req.formData();
  const files = formData.getAll('files').filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required.' }, { status: 400 });
  }

  const uploaded = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = [
      'financial-extraction',
      'uploads',
      new Date().toISOString().slice(0, 10),
      `${crypto.randomUUID()}-${sanitizeFilename(file.name)}`,
    ].join('/');

    await uploadBufferAndSign({
      key,
      buffer,
      contentType: file.type || 'application/octet-stream',
    });

    uploaded.push({
      fileId: key,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    });
  }

  return NextResponse.json({ files: uploaded });
}
