# Settings System Implementation Summary

## ✅ Completed

### 1. Settings Infrastructure
- **`lib/settings/schema.ts`**: Complete Zod schema with validation for all settings
- **`lib/settings/defaults.ts`**: System defaults with merge logic
- **`lib/settings/store.ts`**: File-based persistence (dev) with Supabase-ready interface

### 2. Settings Application Layer
- **`lib/models/shared/applyDefaults.ts`**: Applies defaults for all model types (DCF, LBO, Merger, Operating, 3-Statement, Comps)
- **`lib/models/shared/guardrails.ts`**: Evaluates guardrails and returns warnings/blocks

### 3. Settings API
- **`app/api/settings/route.ts`**: GET/POST for settings
- **`app/api/system/status/route.ts`**: Read-only system diagnostics

### 4. Settings UI
- **`app/dashboard/settings/page.tsx`**: Complete refactor with:
  - Profile section (email read-only)
  - Model Defaults (grouped by model type)
  - Guardrails (with warn/block toggles)
  - Data Preferences
  - Reporting preferences
  - System Status (read-only, shows API key presence)
  - Save functionality with toast notifications

### 5. Model Route Integration
- **`app/api/models/merger/route.ts`**: ✅ Wired settings (defaults + guardrails)
- **`app/api/models/operating/route.ts`**: ✅ Wired settings (defaults + guardrails)

### 6. UI Components
- **`components/models/AppliedDefaultBadge.tsx`**: Badge to show applied defaults
- **`components/models/AppliedDefaultsList.tsx`**: List component for applied defaults
- **`components/models/ResetToDefaultsButton.tsx`**: Button to reset to settings defaults
- **`components/ui/toast.tsx`**: Simple toast component
- **`hooks/use-toast.ts`**: Toast hook

### 7. Create Page Updates
- Added state for `appliedDefaults`, `warnings`, `blocks`
- Display warnings/blocks prominently
- Display applied defaults list
- Clear defaults/warnings on form reset

## 🔄 Remaining Work

### 1. Wire Settings into Remaining Model Routes

The following routes need to be updated to follow the same pattern as `merger` and `operating`:

**Pattern to follow:**
```typescript
// Load settings and apply defaults
const settings = await getCurrentUserSettings(req);
const { effectiveInputs, appliedDefaults } = applyDefaultsToModelInputs(modelType, inputs, settings);

// Re-parse with defaults applied
const finalParseResult = ModelInputSchema.safeParse(effectiveInputs);
if (!finalParseResult.success) {
  return NextResponse.json({ error: 'Invalid input data after applying defaults', details: finalParseResult.error.errors }, { status: 400 });
}

const input = finalParseResult.data;

// ... compute model ...

// Evaluate guardrails
const guardrailResult = evaluateGuardrails(modelType, output, settings);

// If any blocks exist, return 400
if (guardrailResult.blocks.length > 0) {
  return NextResponse.json({ error: 'Model outputs violate guardrails', blocks: guardrailResult.blocks, warnings: guardrailResult.warnings }, { status: 400 });
}

// Return response with appliedDefaults and warnings
return NextResponse.json({
  // ... existing response ...
  appliedDefaults,
  warnings: guardrailResult.warnings,
});
```

**Routes to update:**
- `app/api/models/generate/route.ts` (if it handles DCF/LBO/3-Statement/Comps)
- Any other model-specific routes

### 2. Update Compute Functions (Optional)

The compute functions don't need to accept settings if defaults are applied at the API boundary. However, if you want settings-aware compute logic, update:

- `lib/models/dcf/compute.ts` (if exists)
- `lib/models/lbo/compute.ts` (if exists)
- `lib/models/three-statement/compute.ts` (if exists)
- `lib/models/comps/compute.ts` (if exists)

**Note**: Merger and Operating compute functions don't need settings since defaults are applied before compute.

### 3. Enhanced UI for Applied Defaults

Currently, applied defaults are shown as a list. To show them next to individual fields:

1. Map `appliedDefaults` by path
2. In each input field, check if a default was applied
3. Show `<AppliedDefaultBadge>` next to the field

Example:
```tsx
{appliedDefaultsMap['taxRate'] && (
  <AppliedDefaultBadge appliedDefault={appliedDefaultsMap['taxRate']} />
)}
```

### 4. Toast Component Enhancement

The current toast is basic. Consider:
- Using a toast library (e.g., `sonner`, `react-hot-toast`)
- Better animations
- Multiple toast support

## Architecture Notes

### Precedence Rule
```
model input > user settings default > system default > fail
```

### Settings Never Override
- Settings only apply when `input === undefined || input === null`
- Explicit user inputs (including `0` or empty string) are preserved

### Defaults Applied at Boundary
- Defaults are applied in API routes before compute
- Compute functions receive fully-resolved inputs
- This keeps compute functions pure and testable

### Guardrails Evaluated After Compute
- Guardrails check outputs, not inputs
- Can block (400) or warn (included in response)
- Settings control the action (warn vs block)

## Testing Checklist

- [ ] Settings page loads and saves correctly
- [ ] System status shows API key presence
- [ ] Merger model applies defaults and evaluates guardrails
- [ ] Operating model applies defaults and evaluates guardrails
- [ ] Applied defaults are visible in UI
- [ ] Warnings are displayed prominently
- [ ] Blocks prevent model generation
- [ ] No placeholder zeros introduced
- [ ] Explicit user inputs are never overridden

## File Structure

```
finmodai-next/
├── lib/
│   ├── settings/
│   │   ├── schema.ts          ✅ Settings schema
│   │   ├── defaults.ts        ✅ System defaults
│   │   └── store.ts           ✅ Persistence layer
│   └── models/
│       └── shared/
│           ├── applyDefaults.ts  ✅ Default application
│           └── guardrails.ts     ✅ Guardrail evaluation
├── app/
│   ├── api/
│   │   ├── settings/
│   │   │   └── route.ts       ✅ Settings API
│   │   ├── system/
│   │   │   └── status/
│   │   │       └── route.ts   ✅ System status API
│   │   └── models/
│   │       ├── merger/
│   │       │   └── route.ts   ✅ Wired settings
│   │       └── operating/
│   │           └── route.ts   ✅ Wired settings
│   └── dashboard/
│       └── settings/
│           └── page.tsx       ✅ Settings UI
└── components/
    ├── models/
    │   ├── AppliedDefaultBadge.tsx      ✅ Badge component
    │   └── ResetToDefaultsButton.tsx     ✅ Reset button
    └── ui/
        └── toast.tsx                     ✅ Toast component
```

## Next Steps

1. Wire settings into remaining model routes (DCF, LBO, 3-Statement, Comps)
2. Test end-to-end with real inputs
3. Add field-level applied default badges (optional enhancement)
4. Consider adding settings import/export functionality
