-- Add MODEL_AND_VIZ to agent_artifacts type constraint
-- This ensures MODEL_AND_VIZ artifacts can be stored and versioned

alter table public.agent_artifacts
  drop constraint if exists agent_artifacts_type_check;

alter table public.agent_artifacts
  add constraint agent_artifacts_type_check check (
    type in (
      'MODEL_AND_VIZ',
      'FORECAST_BLUEPRINT',
      'SCENARIO_ENGINE',
      'DCF_DRIVERS',
      'MARKET_IMPACT_BRIEF',
      'SQL_QUERY',
      'PYTHON_NOTEBOOK',
      'SLIDE_OUTLINE',
      'CHECKLIST'
    )
  );

