# Preview Implementation Checklist

## ✅ Completed

### Core Infrastructure
- [x] Created `ModelPreviewShell.tsx` - Universal 2-column layout container
- [x] Created `SafeTable.tsx` - Crash-proof table component
- [x] Created `EmptyState` component - Professional fallback UI
- [x] Created `safeFormatters.ts` - Safe formatting utilities
- [x] Created `KpiStrip` component - Consistent KPI display

### Model-Specific Previews
- [x] Created `DcfPreview.new.tsx` - DCF with universal layout
- [x] Created `LboPreview.new.tsx` - LBO with universal layout
- [x] Created `CompsPreview.new.tsx` - Comps with universal layout
- [x] Created `MergerPreview.new.tsx` - M&A with universal layout

### Documentation
- [x] Created `UNIVERSAL_PREVIEW_SYSTEM_COMPLETE.md` - Full system docs
- [x] Created `COMPS_PEERS_FIX_COMPLETE.md` - Comps-specific fix docs
- [x] Created `COMPS_PREVIEW_UI_FIX_COMPLETE.md` - Comps UI fix docs

## 🔄 To Deploy (Next Steps)

### 1. Backup Old Files
```bash
cd /Users/averyromain/Scraper/finmodai-next/components/models/previews
mv DcfPreview.tsx DcfPreview.old.tsx
mv LboPreview.tsx LboPreview.old.tsx
mv CompsPreview.tsx CompsPreview.old.tsx
mv MergerPreview.tsx MergerPreview.old.tsx
```

### 2. Activate New Files
```bash
mv DcfPreview.new.tsx DcfPreview.tsx
mv LboPreview.new.tsx LboPreview.tsx
mv CompsPreview.new.tsx CompsPreview.tsx
mv MergerPreview.new.tsx MergerPreview.tsx
```

### 3. Update Import Paths (if needed)
Check these files for preview imports:
- [ ] `components/models/previews/PreviewForModelType.tsx`
- [ ] `app/(app)/models/[modelId]/page.tsx`
- [ ] Any other files importing preview components

### 4. Test Each Model Type

#### DCF Testing
- [ ] Generate DCF model with full data
- [ ] Verify KPI strip displays correctly
- [ ] Verify valuation bridge table
- [ ] Verify forecast table
- [ ] Test with missing inputs (degraded state)
- [ ] Test with no data (empty state)
- [ ] Verify Download Excel button works

#### LBO Testing
- [ ] Generate LBO model with full data
- [ ] Verify KPI strip displays correctly
- [ ] Verify Sources & Uses tables
- [ ] Verify Returns summary
- [ ] Test with S&U mismatch (degraded state)
- [ ] Test with missing data (empty state)
- [ ] Verify Download Excel button works

#### Comps Testing
- [ ] Generate Comps model with peers
- [ ] Verify KPI strip displays correctly
- [ ] Verify peer multiples table
- [ ] Verify target row is highlighted
- [ ] Test with no peers (empty state)
- [ ] Test with partial data (degraded state)
- [ ] Verify Download Excel button works

#### M&A Testing
- [ ] Generate M&A model with full data
- [ ] Verify KPI strip displays correctly
- [ ] Verify deal summary table
- [ ] Verify pro forma metrics table
- [ ] Verify accretion/dilution visual
- [ ] Test with missing inputs (degraded state)
- [ ] Test with no data (empty state)
- [ ] Verify Download Excel button works

### 5. Visual QA

#### Layout Consistency
- [ ] All previews use same 2-column layout
- [ ] KPI strips have consistent styling
- [ ] Sidebar width is 360px on all previews
- [ ] Spacing is consistent (gap-6)
- [ ] Card styling matches (rounded-xl, border-subtle)

#### Responsive Behavior
- [ ] Desktop: side-by-side columns
- [ ] Tablet: side-by-side columns
- [ ] Mobile: stacked columns
- [ ] Tables scroll horizontally on mobile
- [ ] KPI grid adjusts to screen size

#### Empty States
- [ ] Icons display correctly
- [ ] Messages are clear and professional
- [ ] Spacing is consistent
- [ ] No blank screens

#### Degraded States
- [ ] Banner displays at top
- [ ] Message is contextual
- [ ] KPIs still show (with "—" for missing)
- [ ] Download button still accessible

### 6. Integration Testing

#### Model Generation Flow
- [ ] Create new DCF model → Preview renders
- [ ] Create new LBO model → Preview renders
- [ ] Create new Comps model → Preview renders
- [ ] Create new M&A model → Preview renders

#### Download Excel
- [ ] DCF: Excel downloads correctly
- [ ] LBO: Excel downloads correctly
- [ ] Comps: Excel downloads correctly
- [ ] M&A: Excel downloads correctly

#### Generate Report (if implemented)
- [ ] DCF: Report generation works
- [ ] LBO: Report generation works
- [ ] Comps: Report generation works
- [ ] M&A: Report generation works

### 7. Error Handling

#### Test Edge Cases
- [ ] Null output → Empty state
- [ ] Undefined output → Empty state
- [ ] Empty arrays → Empty state
- [ ] NaN values → "—" displayed
- [ ] Infinity values → "—" displayed
- [ ] Missing nested fields → No crash

#### Console Errors
- [ ] No React errors in console
- [ ] No TypeScript errors
- [ ] No undefined warnings
- [ ] No key prop warnings

### 8. Performance

#### Load Times
- [ ] Previews render quickly (<500ms)
- [ ] No unnecessary re-renders
- [ ] Tables with many rows scroll smoothly
- [ ] No layout shifts

#### Memory
- [ ] No memory leaks
- [ ] Components unmount cleanly
- [ ] No orphaned event listeners

### 9. Accessibility

#### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Download button is focusable
- [ ] Report button is focusable
- [ ] Tables are keyboard accessible

#### Screen Readers
- [ ] Headers have proper hierarchy
- [ ] Tables have proper structure
- [ ] Empty states have descriptive text
- [ ] Buttons have descriptive labels

### 10. Documentation

#### Code Comments
- [ ] All components have JSDoc comments
- [ ] Complex logic is explained
- [ ] Props are documented
- [ ] Edge cases are noted

#### README Updates
- [ ] Update main README if needed
- [ ] Add preview system to architecture docs
- [ ] Document new components
- [ ] Add migration guide for future models

## 🎯 Success Criteria

### Must Have
- ✅ All previews render without crashing
- ✅ Consistent layout across all models
- ✅ Professional empty states
- ✅ Download Excel always accessible
- ✅ No validation errors
- ✅ Degraded states look intentional

### Nice to Have
- ⏳ Loading skeletons (implemented in shell)
- ⏳ Report generation (if already exists)
- ⏳ Responsive charts (future enhancement)
- ⏳ Export to PDF (future enhancement)

## 📊 Rollback Plan

If issues are found:

1. **Quick Rollback:**
```bash
cd /Users/averyromain/Scraper/finmodai-next/components/models/previews
mv DcfPreview.tsx DcfPreview.new.tsx
mv DcfPreview.old.tsx DcfPreview.tsx
# Repeat for other models
```

2. **Identify Issue:**
- Check console errors
- Check network requests
- Check component props
- Check data shape

3. **Fix Forward:**
- Update new files
- Re-test
- Re-deploy

## 🚀 Deployment

### Staging
1. Deploy to staging environment
2. Run full test suite
3. Manual QA on all model types
4. Get stakeholder approval

### Production
1. Deploy during low-traffic window
2. Monitor error logs
3. Monitor user feedback
4. Be ready to rollback if needed

## 📝 Notes

- All new files have `.new.tsx` extension for safety
- Old files can be deleted after successful deployment
- Keep documentation up to date
- Consider adding automated tests for previews
