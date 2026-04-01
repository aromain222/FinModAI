import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGoogleDriveMultipartBody,
  fetchWorkbookArtifact,
  openWorkbookInGoogleSheets,
  parseWorkbookFilename,
  type WorkbookArtifact,
} from '@/lib/workbookOpen';

test('parseWorkbookFilename prefers content-disposition filename over fallback', () => {
  const filename = parseWorkbookFilename('attachment; filename="CapitalBase_AAPL_DCF.xlsx"', 'fallback.xlsx');
  assert.equal(filename, 'CapitalBase_AAPL_DCF.xlsx');
});

test('fetchWorkbookArtifact returns blob and parsed filename', async () => {
  const response = new Response(new Blob(['workbook-bytes']), {
    status: 200,
    headers: {
      'Content-Disposition': 'attachment; filename="CapitalBase_Model.xlsx"',
    },
  });

  const workbook = await fetchWorkbookArtifact(
    'http://localhost/workbook',
    { method: 'POST' },
    'fallback.xlsx',
    async () => response,
  );

  assert.equal(workbook.filename, 'CapitalBase_Model.xlsx');
  assert.equal(await workbook.blob.text(), 'workbook-bytes');
});

test('buildGoogleDriveMultipartBody preserves workbook media and requests spreadsheet conversion', async () => {
  const body = buildGoogleDriveMultipartBody(
    {
      filename: 'CapitalBase_Model.xlsx',
      blob: new Blob(['abc123'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    },
    'capitalbase-test-boundary',
  );

  const text = await body.text();
  assert.match(text, /application\/vnd\.google-apps\.spreadsheet/);
  assert.match(text, /CapitalBase_Model/);
  assert.match(text, /abc123/);
});

test('openWorkbookInGoogleSheets opens returned Google Sheets URL when auth and upload succeed', async () => {
  const workbook: WorkbookArtifact = {
    filename: 'CapitalBase_Model.xlsx',
    blob: new Blob(['test']),
  };

  let openedUrl: string | null = null;
  const result = await openWorkbookInGoogleSheets(workbook, {
    clientId: 'google-client-id',
    tokenProvider: async () => 'access-token',
    uploader: async () => ({ id: 'sheet123', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet123/edit' }),
    openUrl: (url) => {
      openedUrl = url;
    },
    fallbackDownload: () => {
      throw new Error('fallback should not run on successful Sheets import');
    },
  });

  assert.deepEqual(result, {
    status: 'opened',
    url: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
  });
  assert.equal(openedUrl, 'https://docs.google.com/spreadsheets/d/sheet123/edit');
});

test('openWorkbookInGoogleSheets falls back to workbook download when Google Sheets is not configured', async () => {
  const workbook: WorkbookArtifact = {
    filename: 'CapitalBase_Model.xlsx',
    blob: new Blob(['test']),
  };

  let fallbackDownloaded = false;
  const result = await openWorkbookInGoogleSheets(workbook, {
    clientId: null,
    fallbackDownload: () => {
      fallbackDownloaded = true;
    },
  });

  assert.equal(result.status, 'downloaded_fallback');
  assert.equal(result.reason, 'config_missing');
  assert.equal(fallbackDownloaded, true);
});
