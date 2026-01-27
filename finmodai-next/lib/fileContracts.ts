type FilePointer = { kind: 'url' | 'key'; value: string };

const POINTER_FIELDS = [
  'r2_key',
  'file_key',
  'workbook_key',
  'object_key',
  'storage_path',
  'file_path',
  'download_url',
  'file_url',
  'signed_url',
  'url',
] as const;

const isUrl = (value: string) => /^https?:\/\//i.test(value);

export function getFilePointer(model: any): FilePointer | null {
  if (!model) return null;
  const res = typeof model.results === 'string' ? tryParse(model.results) : model.results;

  for (const field of POINTER_FIELDS) {
    const raw =
      (model as any)?.[field] ??
      (res as any)?.[field] ??
      (res as any)?.upload?.[field];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const value = raw.trim();
      return { kind: isUrl(value) ? 'url' : 'key', value };
    }
  }
  return null;
}

export function getFileKey(model: any): string | null {
  const pointer = getFilePointer(model);
  if (!pointer || pointer.kind !== 'key') return null;
  return pointer.value;
}

export function isFileReady(model: any): boolean {
  return Boolean(getFilePointer(model));
}

function tryParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
