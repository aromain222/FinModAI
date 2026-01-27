# Cloudflare R2 Storage Implementation Summary

## Overview
Implemented Cloudflare R2 storage for Excel model exports with signed download URLs. All exports are uploaded directly to R2 (S3-compatible), and downloads use short-lived signed URLs that can be re-signed after page refresh.

## Files Created/Modified

### 1. R2 Client Utility (`lib/r2.ts`)
- **Purpose**: S3-compatible client for R2 operations
- **Functions**:
  - `uploadXlsxToR2({ key, buffer })`: Uploads Excel buffer to R2 with correct ContentType
  - `getSignedDownloadUrl({ key, filename?, expiresInSeconds? })`: Generates signed download URL (default 10 minutes)
  - `isR2Configured()`: Checks if all required env vars are present
- **Security**: Never logs secrets, only high-level success/failure

### 2. Database Migration (`supabase/migrations/20250222_add_export_key_to_models.sql`)
- **Purpose**: Adds `export_key` column to `models` table
- **Schema**:
  - Creates `models` table if it doesn't exist
  - Adds `export_key` column (nullable text)
  - Creates indexes for performance
  - Sets up RLS policies (users can only access their own models)

### 3. Model Generation API (`app/api/generateModel/route.ts`)
- **Changes**:
  - After workbook generation, uploads buffer to R2
  - Generates `modelId` using `randomUUID()`
  - Builds R2 key: `models/{userId}/{modelId}.xlsx`
  - Persists model record with `export_key` (not the signed URL)
  - Returns JSON response with:
    - `modelId`: UUID for re-signing
    - `exportKey`: R2 object key (for debugging)
    - `downloadUrl`: Signed URL (expires in 10 minutes)
    - `exportError`: Error message if upload fails (preview still works)
  - **Important**: Preview is never blocked by R2 upload failures

### 4. Re-sign Download Endpoint (`app/api/models/[modelId]/download/route.ts`)
- **Purpose**: Re-signs download URLs after page refresh
- **Behavior**:
  - Requires authentication
  - Validates user owns the model
  - Loads `export_key` from database
  - Generates fresh signed URL
  - Returns JSON: `{ downloadUrl, expiresIn }`

### 5. Frontend Download Logic (`lib/downloadWorkbook.ts`)
- **Changes**:
  - Updated to accept `modelId` parameter
  - If `modelId` provided, calls re-sign endpoint first
  - Falls back to direct generation if re-sign fails
  - Uses signed URL from generation response if available
  - Handles `exportError` gracefully

### 6. Frontend Model Creation (`app/(app)/models/create/page.tsx`)
- **Changes**:
  - Stores `modelId` and `downloadUrl` from API response
  - Uses `downloadUrl` directly if available (R2 signed URL)
  - Falls back to `downloadWorkbook` with `modelId` for re-signing
  - Download button uses `modelId` for re-signing after refresh

### 7. Test Route (`app/api/r2/test/route.ts`)
- **Purpose**: Development-only test endpoint
- **Behavior**:
  - Only works on localhost in development
  - Uploads a test file to R2
  - Returns signed URL
  - Useful for verifying R2 configuration

## Environment Variables Required

```bash
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=capitalbase-models
```

## Data Flow

1. **Model Generation**:
   - User generates model → Excel buffer created
   - Buffer uploaded to R2 at `models/{userId}/{modelId}.xlsx`
   - Model record saved with `export_key`
   - Signed URL generated and returned (expires in 10 min)

2. **Initial Download**:
   - Frontend receives `downloadUrl` in response
   - Downloads directly from signed URL

3. **After Page Refresh**:
   - Frontend has `modelId` but `downloadUrl` expired
   - Calls `/api/models/[modelId]/download`
   - Endpoint loads `export_key` from DB
   - Generates fresh signed URL
   - Frontend downloads from new URL

## Error Handling

- **R2 Upload Failure**: 
  - Logged but doesn't block model generation
  - Preview still works
  - `exportError` returned in response
  - Frontend shows warning but doesn't fail

- **Re-sign Failure**:
  - Returns 404 if model not found
  - Returns 403 if user doesn't own model
  - Returns 404 if `export_key` missing (legacy model)
  - Frontend shows friendly error message

- **Missing Configuration**:
  - `isR2Configured()` returns false
  - Upload skipped, legacy download used
  - No errors thrown

## Security

- ✅ Never logs secrets (only success/failure with modelId/key)
- ✅ RLS policies ensure users only access their own models
- ✅ Signed URLs expire after 10 minutes
- ✅ Only `export_key` stored in DB (not signed URLs)
- ✅ Auth required for re-sign endpoint

## Testing

1. **Test R2 Configuration**:
   ```bash
   curl http://localhost:3000/api/r2/test
   ```

2. **Generate Model**:
   - Generate a model via UI
   - Check console for `[R2] ✅ Uploaded` message
   - Verify `downloadUrl` in response

3. **Test Re-sign**:
   - Generate model
   - Note the `modelId`
   - Wait 10+ minutes or refresh page
   - Click download → should call re-sign endpoint

## Migration Notes

- Existing models without `export_key` will return 404 on re-sign
- Error message explains: "Model was generated before R2 storage was enabled"
- New models always have `export_key` if R2 is configured

## Dependencies Added

- `@aws-sdk/client-s3`: S3-compatible client
- `@aws-sdk/s3-request-presigner`: URL signing

## Acceptance Criteria ✅

- ✅ Excel exports upload to R2
- ✅ API returns signed download URL
- ✅ Download works immediately
- ✅ Download works after refresh (re-sign)
- ✅ Works on Vercel (no filesystem)
- ✅ No API tokens (only R2 access keys)
- ✅ Clear errors if R2 misconfigured
- ✅ Preview never blocked by R2 failures







