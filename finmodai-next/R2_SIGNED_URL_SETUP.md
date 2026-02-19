# R2 Signed URL Setup - Complete Integration

## Overview

Your application now has **full R2 (Cloudflare R2) integration** with signed URLs for secure, time-limited downloads of Excel model files.

---

## How It Works

### **1. Model Generation (`/api/generateModel`)**

When a model is generated:
1. Excel workbook is created in memory
2. **If R2 is configured**, the workbook is uploaded to R2 with key: `models/{requestId}.xlsx`
3. A **signed URL** (15-minute expiry) is generated and returned in the response
4. **If R2 is not configured**, falls back to data URI or direct download

### **2. Model Download (`/api/models/[modelId]/download`)**

When downloading a model:
1. **First tries R2**: Looks for `models/{modelId}.xlsx` in R2
2. **If found**: Generates a new signed URL (15-minute expiry) and redirects
3. **If not found**: Falls back to local file storage (`/tmp/finmodai/`)

---

## Environment Variables Required

Add these to your `.env.local`:

```bash
# Cloudflare R2 Configuration
R2_BUCKET=your-bucket-name
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_REGION=auto  # Optional, defaults to 'auto'
```

**Alternative variable names** (also supported):
- `AWS_S3_BUCKET` / `AWS_BUCKET` / `S3_BUCKET`
- `AWS_S3_ENDPOINT` / `AWS_ENDPOINT` / `S3_ENDPOINT`
- `AWS_ACCESS_KEY_ID` / `S3_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` / `S3_SECRET_ACCESS_KEY`
- `AWS_REGION` / `AWS_DEFAULT_REGION`

---

## R2 Setup Steps

### **1. Get Your R2 Credentials**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** → **Manage R2 API Tokens**
3. Create a new API token with:
   - **Permissions**: Object Read & Write
   - **Bucket**: Your bucket name
4. Copy:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (for endpoint URL)

### **2. Get Your Endpoint URL**

Your R2 endpoint follows this format:
```
https://{account-id}.r2.cloudflarestorage.com
```

Replace `{account-id}` with your Cloudflare Account ID.

### **3. Create a Bucket**

1. In Cloudflare Dashboard → **R2**
2. Click **Create bucket**
3. Choose a bucket name (e.g., `finmodai-models`)
4. Copy the bucket name

### **4. Add to `.env.local`**

```bash
R2_BUCKET=finmodai-models
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_REGION=auto
```

---

## How Signed URLs Work

### **Benefits:**
- ✅ **Secure**: Time-limited access (15 minutes)
- ✅ **No server load**: Files served directly from R2
- ✅ **Scalable**: No local storage limits
- ✅ **Fast**: CDN-backed delivery

### **Flow:**
1. Model generated → Uploaded to R2 → Signed URL returned
2. User clicks download → New signed URL generated → Redirect to R2
3. R2 serves file directly to user
4. URL expires after 15 minutes

---

## Code Integration

### **Model Generation** (`app/api/generateModel/route.ts`)

```typescript
// Already integrated! Lines 1880-1895
if (isObjectStoreConfigured()) {
  const key = `models/${requestId || crypto.randomUUID()}.xlsx`;
  signedDownloadUrl = await uploadBufferAndSign({
    key,
    buffer: workbookBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expiresInSeconds: 900, // 15 minutes
  });
}
```

### **Model Download** (`app/api/models/[modelId]/download/route.ts`)

```typescript
// Now integrated! Tries R2 first, falls back to local
if (isObjectStoreConfigured()) {
  const r2Key = `models/${modelId}.xlsx`;
  const exists = await objectExists(r2Key);
  if (exists) {
    const signedUrl = await getSignedUrlForKey(r2Key, 900);
    return NextResponse.redirect(signedUrl, { status: 302 });
  }
}
// Fallback to local storage...
```

---

## Testing

### **1. Check R2 Configuration**

```typescript
import { isObjectStoreConfigured } from '@/lib/storage/objectStore';

console.log('R2 Configured:', isObjectStoreConfigured());
```

### **2. Test Upload**

Generate a model and check the response:
```json
{
  "success": true,
  "downloadUrl": "https://your-bucket.r2.cloudflarestorage.com/models/abc123.xlsx?X-Amz-Algorithm=...",
  ...
}
```

### **3. Test Download**

Visit `/api/models/{modelId}/download` and verify:
- If R2 configured: Redirects to signed URL
- If R2 not configured: Downloads from local storage

---

## Troubleshooting

### **"Object storage not configured"**
- Check all R2 environment variables are set
- Verify variable names match exactly
- Restart dev server after adding env vars

### **"Model not found in R2"**
- Model was generated before R2 was configured
- Model ID doesn't match R2 key format
- Check R2 bucket for `models/{modelId}.xlsx`

### **"Failed to upload to R2"**
- Check R2 credentials are correct
- Verify bucket name exists
- Check endpoint URL format
- Ensure API token has write permissions

---

## Status

✅ **R2 Upload** - Integrated in model generation  
✅ **R2 Download** - Integrated in download route  
✅ **Signed URLs** - 15-minute expiry  
✅ **Fallback** - Local storage if R2 not configured  
✅ **Helper Functions** - `getSignedUrlForKey`, `objectExists`  

**R2 integration is complete and ready to use!** 🚀

Just add your R2 credentials to `.env.local` and it will automatically start using signed URLs.
