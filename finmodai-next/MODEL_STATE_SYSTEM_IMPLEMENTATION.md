# Model State System Implementation

## ✅ Complete Implementation

Fixed the product flow around math errors by implementing a comprehensive model state system that treats missing inputs as incomplete states, not errors.

## What Changed

### 1. ✅ Reframed Missing Inputs (Not Errors)

**Before:**
- Missing ERP → `ERROR_MISSING_ERP`
- Missing beta → Runtime failure
- Missing cost of debt → `FILE_NOT_AVAILABLE`

**After:**
- Missing inputs → `ASSUMPTIONS_REQUIRED` state
- Model state: `MODEL_NOT_COMPUTABLE_YET`
- Returns 200 OK with state information (not 400/500 error)

### 2. ✅ Hard Computability Gate

**Implementation:**
- `checkModelComputability()` function checks all required inputs
- `assertModelComputable()` throws before Excel generation
- Returns early with `assumptions_required` state if not computable

**Location:** `lib/models/shared/computability.ts`

**Behavior:**
```typescript
if (!isComputable) {
  return {
    state: 'assumptions_required',
    missing: ['rf_rate', 'erp', 'beta'],
    canGenerate: false
  };
}
```

### 3. ✅ Auto-Estimation of Required Inputs

**Default Behavior:**
- **Risk-free rate:** Latest 10Y Treasury (FRED API) or 4.5% default
- **ERP:** Fixed default (5.25%)
- **Beta:** Sector median or market default (1.0)
- **Cost of debt:** Interest expense ÷ avg debt (if available) or 6.5% default
- **Tax rate:** Effective tax rate (historical) or 25% statutory default

**Implementation:** `lib/models/shared/autoEstimates.ts`

**Features:**
- All estimates marked with source and confidence
- Users can override
- Estimates applied automatically before computability check

### 4. ✅ Explicit Model States

**States:**
- `draft` - Initial state, no assumptions collected
- `assumptions_required` - Missing required inputs, cannot compute yet
- `computable` - All required inputs present, ready to generate
- `generating` - Currently generating Excel file
- `generated` - File successfully generated
- `failed` - Generation failed

**Implementation:** `lib/models/shared/modelState.ts`

**API Response:**
```json
{
  "state": "assumptions_required",
  "missing": ["rf_rate", "erp"],
  "estimated": [
    {
      "key": "rf_rate",
      "value": 0.045,
      "source": "Market default (4.5%)",
      "confidence": "medium"
    }
  ],
  "canGenerate": false,
  "message": "Missing required inputs: rf_rate, erp"
}
```

### 5. ✅ Idempotent File Generation

**Implementation:**
- Hash inputs to create deterministic filename
- Same inputs → same filename
- Prevents duplicate files and broken second downloads

**Code:**
```typescript
const inputsHash = crypto
  .createHash('sha256')
  .update(JSON.stringify({ ticker, modelType, ...assumptions, ...body }))
  .digest('hex')
  .substring(0, 8);

const downloadFilename = `${ticker}_${modelType}_${inputsHash}.xlsx`;
```

## Files Created

1. **`lib/models/shared/modelState.ts`**
   - Model state types and utilities
   - State messages and validation

2. **`lib/models/shared/autoEstimates.ts`**
   - Auto-estimation functions for all required inputs
   - FRED API integration for risk-free rate
   - Sector-based defaults for beta

3. **`lib/models/shared/computability.ts`**
   - Computability checking logic
   - Hard gate before Excel generation
   - Missing inputs detection

## Files Modified

1. **`app/api/generateModel/route.ts`**
   - Added computability check before Excel generation
   - Auto-estimation for DCF models
   - Early return with `assumptions_required` state
   - Idempotent filename generation
   - State included in API response

## API Behavior Changes

### Before
```json
{
  "error": "Missing required inputs",
  "status": 400
}
```

### After
```json
{
  "state": "assumptions_required",
  "missing": ["rf_rate", "erp"],
  "estimated": [...],
  "canGenerate": false,
  "status": 200
}
```

## User Flow

1. **User requests model** → System checks computability
2. **Missing inputs?** → Auto-estimate with defaults
3. **Still missing?** → Return `assumptions_required` state (200 OK)
4. **All inputs present?** → Generate Excel file
5. **Same inputs again?** → Same filename (idempotent)

## Next Steps (UI)

The UI should:
1. Check `state` field in API response
2. If `assumptions_required`, show "Assumptions Completion Mode"
3. Highlight missing fields
4. Show auto-estimated values with confidence badges
5. Offer "Use estimates" button
6. Only show download button when `state === 'generated'`

## Success Criteria

✅ Missing inputs no longer cause errors  
✅ Models become computable by default (auto-estimation)  
✅ Hard gate prevents phantom files  
✅ Explicit states guide user flow  
✅ Idempotent file generation prevents duplicates  
✅ API returns 200 OK for incomplete states (not errors)

## Status

✅ **Complete and Ready for UI Integration**

All backend changes complete. UI component for "Assumptions Completion Mode" is pending (task #5).
