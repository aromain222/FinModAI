-- Ensure models table has canonical shape
BEGIN;

-- Columns
ALTER TABLE IF EXISTS public.models
  ADD COLUMN IF NOT EXISTS quality_tier text DEFAULT 'preview',
  ADD COLUMN IF NOT EXISTS normalized_assumptions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS units jsonb DEFAULT '{"currency":"USD","scale":"MILLIONS","shares":"MILLIONS","rates":"DECIMAL"}'::jsonb;

-- Defaults/backfill
UPDATE public.models
SET model_type = COALESCE(model_type, type),
    type = COALESCE(type, model_type, 'dcf'),
    scenario = COALESCE(scenario, 'BASE'),
    scenario_adjustment_notes = COALESCE(scenario_adjustment_notes, ''),
    scenario_summary_notes = COALESCE(scenario_summary_notes, ''),
    status = COALESCE(status, 'created')
WHERE TRUE;

ALTER TABLE public.models
  ALTER COLUMN type SET NOT NULL;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION public.models_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS models_updated_at ON public.models;
CREATE TRIGGER models_updated_at
BEFORE UPDATE ON public.models
FOR EACH ROW EXECUTE FUNCTION public.models_updated_at();

-- Enable RLS
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS models_rls_select ON public.models
  FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS models_rls_insert ON public.models
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS models_rls_update ON public.models
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS models_user_id_idx ON public.models (user_id);
CREATE INDEX IF NOT EXISTS models_created_at_idx ON public.models (created_at DESC);
CREATE INDEX IF NOT EXISTS models_status_idx ON public.models (status);

COMMIT;
