-- Add followup_answers to agent_artifacts for clarifying-question workflow

alter table public.agent_artifacts
  add column if not exists followup_answers jsonb not null default '{}'::jsonb;

