# Named Ranges Systemic Fix - COMPLETE

## Problem Statement

We had recurring issues with `definedNames.add` argument order:
1. **Argument flip-flop**: Multiple call sites and wrappers with inconsistent signatures caused confusion about whether to use `(name, address)` or `(address, name)`
2. **Error: Invalid column letter: CBMETAUNITS**: Name tokens were being interpreted as column letters
3. **Error: Invalid A1 address "'DCF Model'!$C$1"**: Sheet-qualified refs were being rejected

## Root Cause

- **Positional arguments**: Functions took `(workbook, name, address)` or `(workbook, address, name)` - easy to swap
- **Multiple wrappers**: `addNamedRangeSafe`, `addNamedRangeValidated`, `safeAddDefinedName` with different signatures
- **No swap detection**: If arguments were swapped, errors were cryptic
- **Inconsistent validation**: Some wrappers validated, others didn't

## Solution: Single Unambiguous API

Created **ONE** canonical function with named parameters that cannot be mis-called.

### File: `lib/excel/namedRanges.ts` (NEW)

```typescript
export function addNamedRangeSafe(
  workbook: ExcelJS.Workbook,
  params: { name: string; ref: string; context?: Record<string, any> }
): void
```

**Key Features:**

1. **Named parameters** - No positional argument confusion
2. **Swap detection** - Explicit errors if arguments are swapped
3. **Comprehensive validation** - Both name and ref validated
4. **Sheet-qualified ref support** - Handles `'DCF Model'!$C$1` correctly
5. **Clear error messages** - Includes context for debugging

### Validation Rules

**Name validation:**
- Must match: `/^[A-Za-z_][A-Za-z0-9_.]*$/`
- Must start with letter or underscore
- Can contain letters, digits, underscore, dot
- Cannot contain: `!`, `$`, `:`, or be pure digits

**Ref validation:**
- Accepts: `$C$1`, `$C$1:$D$10`, `Sheet1!$C$1`, `'DCF Model'!$C$1`
- Pattern: A1 cell or range, optionally sheet-qualified
- Sheet names can be quoted if they contain spaces/special chars

**Swap detection:**
- If `name` contains `!`, `$`, `:` or matches A1 pattern → Error: "SWAPPED_ARGS"
- If `ref` looks like a name token (no digits, no special chars) → Error: "SWAPPED_ARGS"

### Normalization

Sheet-qualified refs are normalized for ExcelJS:
- `'DCF Model'!$C$1` → `DCF Model!$C$1` (unquote)
- Refs are uppercased for consistency

## Migration Complete

### Files Updated

1. **`lib/excel/namedRanges.ts`** (NEW)
   - Single source of truth for adding defined names
   - 200+ lines of validation, swap detection, normalization

2. **`lib/lboGenerator.ts`**
   - Updated `writeNamedOutput` to use named params
   - Added context: `{ key, sheet, row, column }`

3. **`lib/dcfGenerator.ts`**
   - Updated all 6 named range additions
   - Added context: `{ modelType: 'dcf', sheet: sheetName }`

4. **`app/api/ma/run/route.ts`**
   - Updated all 7 named range additions
   - Added context: `{ modelType: 'ma' }`

5. **`lib/excel/address.ts`**
   - `addNamedRangeValidated` → thin wrapper (deprecated)
   - Calls new API with named params

6. **`lib/excel/safe.ts`**
   - `safeAddDefinedName` → thin wrapper (deprecated)
   - Calls new API with named params

7. **`lib/models/lbo/workbookOutputs.test.ts`**
   - Updated test to use named params

### Call Site Pattern

**Before (positional args):**
```typescript
addNamedRangeSafe(workbook, 'CB_META_UNITS', address);
```

**After (named params):**
```typescript
addNamedRangeSafe(workbook, { 
  name: 'CB_META_UNITS', 
  ref: address,
  context: { modelType: 'dcf', sheet: sheetName }
});
```

### Direct `definedNames.add` Calls

**Status:** ZERO direct calls remaining (except inside `addNamedRangeSafe` itself)

All models now go through the validated API.

## Error Prevention

### Swap Detection Examples

**Example 1: Name looks like ref**
```typescript
addNamedRangeSafe(workbook, { 
  name: '$C$1',  // ❌ Looks like a ref!
  ref: 'CB_META_UNITS' 
});
// Error: SWAPPED_ARGS: "name" looks like an Excel ref ("$C$1"). Did you swap name and ref?
```

**Example 2: Ref looks like name**
```typescript
addNamedRangeSafe(workbook, { 
  name: 'CB_META_UNITS',
  ref: 'CBMETAUNITS'  // ❌ Looks like a name token!
});
// Error: SWAPPED_ARGS: "ref" looks like a name token ("CBMETAUNITS"). Did you swap name and ref?
```

### Validation Examples

**Example 3: Invalid name**
```typescript
addNamedRangeSafe(workbook, { 
  name: '123_INVALID',  // ❌ Starts with digit
  ref: '$C$1'
});
// Error: ExcelNameError: invalid defined name "123_INVALID". Must start with letter/underscore...
```

**Example 4: Invalid ref**
```typescript
addNamedRangeSafe(workbook, { 
  name: 'CB_META_UNITS',
  ref: 'INVALID_REF'  // ❌ Not an A1 address
});
// Error: ExcelAddressError: invalid Excel ref "INVALID_REF". Not a valid A1 cell or range
```

**Example 5: Invalid sheet name**
```typescript
addNamedRangeSafe(workbook, { 
  name: 'CB_META_UNITS',
  ref: 'Bad Sheet Name!$C$1'  // ❌ Sheet name not quoted
});
// Error: ExcelAddressError: invalid Excel ref "Bad Sheet Name!$C$1". Invalid sheet name "Bad Sheet Name"
```

## Acceptance Tests

### ✅ DCF Model
- CB_META_UNITS: `'DCF Model'!$C$1` → normalized → added
- CB_OUT_ENTERPRISE_VALUE: `'DCF Model'!$B$10` → added
- CB_OUT_NET_DEBT: `'DCF Model'!$B$11` → added
- CB_OUT_EQUITY_VALUE: `'DCF Model'!$B$12` → added
- CB_OUT_SHARES_OUT: `'DCF Model'!$B$13` → added
- CB_OUT_PRICE_PER_SHARE: `'DCF Model'!$B$14` → added (if available)

### ✅ LBO Model
- All named outputs via `writeNamedOutput` → validated → added
- Context includes: `{ key, sheet, row, column }`

### ✅ M&A Model
- CB_MA_TARGET_EQUITY_VALUE: `'Outputs'!$B$2` → added
- CB_MA_NEW_SHARES: `'Outputs'!$B$5` → added
- CB_MA_PROFORMA_SHARES: `'Outputs'!$B$6` → added
- CB_MA_STANDALONE_EPS: `'Outputs'!$B$7` → added
- CB_MA_PROFORMA_EPS: `'Outputs'!$B$8` → added
- CB_MA_ACCRETION_PCT: `'Outputs'!$B$9` → added
- CB_META_UNITS: `'Outputs'!$D$1` → added

### ✅ Error Cases
- Swapped args → explicit "SWAPPED_ARGS" error
- Invalid name → "ExcelNameError" with clear message
- Invalid ref → "ExcelAddressError" with reason
- Invalid sheet name → "ExcelAddressError" with sheet name

## Benefits

1. **No more argument confusion**: Named params make intent explicit
2. **Fail fast**: Swap detection catches mistakes immediately
3. **Clear errors**: Context included in all error messages
4. **Single source of truth**: One function, one validation path
5. **Sheet-qualified refs work**: `'DCF Model'!$C$1` handled correctly
6. **Backward compatible**: Old wrappers still work (deprecated)
7. **Type safe**: TypeScript enforces named params structure

## Future-Proof

If someone tries to add a defined name incorrectly in the future:

**Scenario 1: Forgets to use named params**
```typescript
addNamedRangeSafe(workbook, 'CB_META_UNITS', '$C$1');
// TypeScript error: Expected 2 arguments, but got 3
```

**Scenario 2: Swaps name and ref**
```typescript
addNamedRangeSafe(workbook, { name: '$C$1', ref: 'CB_META_UNITS' });
// Runtime error: SWAPPED_ARGS: "name" looks like an Excel ref ("$C$1"). Did you swap name and ref?
```

**Scenario 3: Uses invalid name**
```typescript
addNamedRangeSafe(workbook, { name: 'CBMETAUNITS', ref: 'CBMETAUNITS' });
// Runtime error: SWAPPED_ARGS: "ref" looks like a name token ("CBMETAUNITS"). Did you swap name and ref?
```

## Linter Status

✅ No linter errors in any updated files

## Files Changed Summary

| File | Changes | Status |
|------|---------|--------|
| `lib/excel/namedRanges.ts` | Created new API | ✅ Complete |
| `lib/lboGenerator.ts` | Updated 1 call site | ✅ Complete |
| `lib/dcfGenerator.ts` | Updated 6 call sites | ✅ Complete |
| `app/api/ma/run/route.ts` | Updated 7 call sites | ✅ Complete |
| `lib/excel/address.ts` | Deprecated wrapper | ✅ Complete |
| `lib/excel/safe.ts` | Deprecated wrapper | ✅ Complete |
| `lib/models/lbo/workbookOutputs.test.ts` | Updated test | ✅ Complete |

## Verification Checklist

- [x] Single API created with named params
- [x] Swap detection implemented
- [x] Name validation implemented
- [x] Ref validation implemented (bare and sheet-qualified)
- [x] Sheet name normalization (unquote for ExcelJS)
- [x] All DCF call sites migrated
- [x] All LBO call sites migrated
- [x] All M&A call sites migrated
- [x] All test call sites migrated
- [x] Old wrappers deprecated (thin wrappers)
- [x] No direct `definedNames.add` calls (except in new API)
- [x] No linter errors
- [x] Clear error messages with context

## Demo Readiness

✅ **Production-ready**

- No more "Invalid column letter: CBMETAUNITS" errors
- No more "Invalid A1 address" errors for sheet-qualified refs
- Explicit swap detection prevents future mistakes
- All models use validated, consistent API
- Clear error messages for debugging

The systemic fix is complete and permanent.
