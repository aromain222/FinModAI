'use client';

export type WorkbookArtifact = {
  blob: Blob;
  filename: string;
};

export type GoogleSheetsFallbackReason =
  | 'config_missing'
  | 'auth_failed'
  | 'upload_failed'
  | 'open_failed';

export type GoogleSheetsOpenResult =
  | {
      status: 'opened';
      url: string;
    }
  | {
      status: 'downloaded_fallback';
      reason: GoogleSheetsFallbackReason;
      message: string;
    };

type GoogleDriveUploadResult = {
  id: string;
  webViewLink: string | null;
};

type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GoogleIdentityApi = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => GoogleTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

type GoogleIdentityWindow = Window & {
  google?: GoogleIdentityApi;
};

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let googleIdentityScriptPromise: Promise<void> | null = null;

class GoogleSheetsActionError extends Error {
  reason: GoogleSheetsFallbackReason;

  constructor(reason: GoogleSheetsFallbackReason, message: string) {
    super(message);
    this.name = 'GoogleSheetsActionError';
    this.reason = reason;
  }
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]+/g, '_');
  return trimmed.length > 0 ? trimmed : 'CapitalBase_Model.xlsx';
}

export function parseWorkbookFilename(contentDisposition: string | null, fallbackFilename: string): string {
  if (contentDisposition) {
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return sanitizeFilename(decodeURIComponent(utf8Match[1]));
    }

    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (filenameMatch?.[1]) {
      return sanitizeFilename(filenameMatch[1]);
    }
  }

  return sanitizeFilename(fallbackFilename);
}

export async function fetchWorkbookArtifact(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackFilename: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkbookArtifact> {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    const maybeJson = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(maybeJson?.error || maybeJson?.message || 'Failed to export workbook.');
  }

  return {
    blob: await response.blob(),
    filename: parseWorkbookFilename(response.headers.get('Content-Disposition'), fallbackFilename),
  };
}

export function downloadWorkbookArtifact(
  artifact: WorkbookArtifact,
  options?: { documentRef?: Document; urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> },
): void {
  const documentRef = options?.documentRef ?? document;
  const urlApi = options?.urlApi ?? URL;
  const objectUrl = urlApi.createObjectURL(artifact.blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl;
  anchor.download = artifact.filename;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlApi.revokeObjectURL(objectUrl);
}

export function getGoogleSheetsClientId(): string | null {
  const value =
    process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_SHEETS_CLIENT_ID ?? '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createGoogleSheetsPendingWindow(windowRef: Window = window): Window | null {
  try {
    const pendingWindow = windowRef.open('about:blank', '_blank');
    if (pendingWindow?.document) {
      pendingWindow.document.title = 'Opening Google Sheets';
      pendingWindow.document.body.innerHTML =
        '<div style="font-family:Arial,sans-serif;padding:24px;color:#111827">Preparing Google Sheets...</div>';
    }
    return pendingWindow;
  } catch {
    return null;
  }
}

function normalizeGoogleSheetName(filename: string): string {
  const withoutExtension = filename.replace(/\.(xlsx|xlsm|xls)$/i, '').trim();
  return withoutExtension.length > 0 ? withoutExtension : 'CapitalBase Model';
}

export function buildGoogleSheetsFallbackMessage(reason: GoogleSheetsFallbackReason): string {
  switch (reason) {
    case 'config_missing':
      return 'Google Sheets import is not configured here yet. Downloaded the Excel workbook instead.';
    case 'auth_failed':
      return 'Google authorization did not complete. Downloaded the Excel workbook instead.';
    case 'upload_failed':
      return 'Google Sheets import failed during upload. Downloaded the Excel workbook instead.';
    case 'open_failed':
      return 'Google Sheets import completed, but the browser could not open the sheet automatically. Downloaded the Excel workbook instead.';
    default:
      return 'Google Sheets import did not complete. Downloaded the Excel workbook instead.';
  }
}

export function buildGoogleDriveMultipartBody(artifact: WorkbookArtifact, boundary: string): Blob {
  const metadata = JSON.stringify({
    name: normalizeGoogleSheetName(artifact.filename),
    mimeType: 'application/vnd.google-apps.spreadsheet',
  });

  return new Blob(
    [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadata,
      '\r\n',
      `--${boundary}\r\n`,
      `Content-Type: ${EXCEL_MIME_TYPE}\r\n\r\n`,
      artifact.blob,
      '\r\n',
      `--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
}

function buildGoogleSheetsUrl(fileId: string): string {
  return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
}

async function ensureGoogleIdentityScript(
  documentRef: Document = document,
  windowRef: GoogleIdentityWindow = window as GoogleIdentityWindow,
): Promise<void> {
  if (windowRef.google?.accounts?.oauth2) {
    return;
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const existingScript = documentRef.querySelector<HTMLScriptElement>(
        `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
      );

      if (existingScript?.dataset.loaded === 'true') {
        resolve();
        return;
      }

      const script = existingScript ?? documentRef.createElement('script');
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => {
        googleIdentityScriptPromise = null;
        reject(new GoogleSheetsActionError('auth_failed', 'Unable to load Google authorization.'));
      };

      if (!existingScript) {
        documentRef.head.appendChild(script);
      }
    });
  }

  await googleIdentityScriptPromise;

  if (!windowRef.google?.accounts?.oauth2) {
    throw new GoogleSheetsActionError('auth_failed', 'Google authorization is unavailable in this browser.');
  }
}

async function requestGoogleDriveAccessToken(
  clientId: string,
  options?: {
    documentRef?: Document;
    windowRef?: GoogleIdentityWindow;
  },
): Promise<string> {
  const documentRef = options?.documentRef ?? document;
  const windowRef = options?.windowRef ?? (window as GoogleIdentityWindow);
  await ensureGoogleIdentityScript(documentRef, windowRef);

  return new Promise((resolve, reject) => {
    const tokenClient = windowRef.google?.accounts?.oauth2?.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }

        reject(
          new GoogleSheetsActionError(
            'auth_failed',
            response.error_description || response.error || 'Google authorization did not return an access token.',
          ),
        );
      },
      error_callback: (error) => {
        reject(new GoogleSheetsActionError('auth_failed', error.type || 'Google authorization did not complete.'));
      },
    });

    tokenClient?.requestAccessToken();
  });
}

export async function uploadWorkbookToGoogleSheets(
  artifact: WorkbookArtifact,
  accessToken: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<GoogleDriveUploadResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const boundary =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `capitalbase-${crypto.randomUUID()}`
      : `capitalbase-${Date.now()}`;

  const response = await fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: buildGoogleDriveMultipartBody(artifact, boundary),
    },
  );

  const body = (await response.json().catch(() => null)) as { id?: string; webViewLink?: string | null; error?: unknown } | null;
  if (!response.ok || !body?.id) {
    throw new GoogleSheetsActionError('upload_failed', 'Google Sheets upload failed.');
  }

  return {
    id: body.id,
    webViewLink: typeof body.webViewLink === 'string' ? body.webViewLink : null,
  };
}

export async function openWorkbookInGoogleSheets(
  artifact: WorkbookArtifact,
  options?: {
    clientId?: string | null;
    tokenProvider?: (clientId: string) => Promise<string>;
    uploader?: (artifact: WorkbookArtifact, accessToken: string) => Promise<GoogleDriveUploadResult>;
    fallbackDownload?: (artifact: WorkbookArtifact) => void;
    openUrl?: (url: string, pendingWindow: Window | null) => void;
    pendingWindow?: Window | null;
  },
): Promise<GoogleSheetsOpenResult> {
  const clientId = options?.clientId ?? getGoogleSheetsClientId();
  const pendingWindow = options?.pendingWindow ?? null;
  const fallbackDownload = options?.fallbackDownload ?? ((workbook: WorkbookArtifact) => downloadWorkbookArtifact(workbook));
  const tokenProvider = options?.tokenProvider ?? ((resolvedClientId: string) => requestGoogleDriveAccessToken(resolvedClientId));
  const uploader = options?.uploader ?? ((workbook: WorkbookArtifact, accessToken: string) => uploadWorkbookToGoogleSheets(workbook, accessToken));
  const openUrl =
    options?.openUrl ??
    ((url: string, currentPendingWindow: Window | null) => {
      if (currentPendingWindow && !currentPendingWindow.closed) {
        currentPendingWindow.location.href = url;
        return;
      }

      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        throw new GoogleSheetsActionError('open_failed', 'The browser blocked the Google Sheets tab.');
      }
    });

  try {
    if (!clientId) {
      throw new GoogleSheetsActionError('config_missing', 'Google Sheets client ID is missing.');
    }

    const accessToken = await tokenProvider(clientId);
    const uploaded = await uploader(artifact, accessToken);
    const url = uploaded.webViewLink || buildGoogleSheetsUrl(uploaded.id);
    openUrl(url, pendingWindow);

    return {
      status: 'opened',
      url,
    };
  } catch (error) {
    const reason =
      error instanceof GoogleSheetsActionError && error.reason ? error.reason : ('upload_failed' as GoogleSheetsFallbackReason);

    if (pendingWindow && !pendingWindow.closed) {
      pendingWindow.close();
    }

    fallbackDownload(artifact);
    return {
      status: 'downloaded_fallback',
      reason,
      message: buildGoogleSheetsFallbackMessage(reason),
    };
  }
}
