alter table if exists public.market_events
  add column if not exists drivers jsonb not null default '[]'::jsonb;

alter table if exists public.market_events
  add column if not exists market_impact jsonb not null default '{}'::jsonb;

alter table if exists public.market_events
  add column if not exists transmission_path jsonb not null default '[]'::jsonb;

update public.market_events
set drivers = case
  when drivers = '[]'::jsonb and summary_bullets is not null then summary_bullets
  else drivers
end
where drivers = '[]'::jsonb;

update public.market_events
set market_impact = case
  when market_impact = '{}'::jsonb then
    jsonb_strip_nulls(
      jsonb_build_object(
        'equities',
        case when coalesce(jsonb_typeof(impact_targets), '') = 'array' and impact_targets ? 'Equities'
          then 'Legacy event flagged for equity impact.' else null end,
        'rates',
        case when coalesce(jsonb_typeof(impact_targets), '') = 'array' and impact_targets ? 'Rates'
          then 'Legacy event flagged for rates impact.' else null end,
        'fx',
        case when coalesce(jsonb_typeof(impact_targets), '') = 'array' and impact_targets ? 'FX'
          then 'Legacy event flagged for FX impact.' else null end,
        'oil',
        case when coalesce(jsonb_typeof(impact_targets), '') = 'array' and impact_targets ? 'Oil'
          then 'Legacy event flagged for oil impact.' else null end,
        'credit',
        case when coalesce(jsonb_typeof(impact_targets), '') = 'array' and impact_targets ? 'Credit'
          then 'Legacy event flagged for credit impact.' else null end,
        'sectors',
        case
          when coalesce(jsonb_typeof(impact_targets), '') = 'array' then (
            select case
              when count(*) > 0 then 'Legacy sector targets: ' || string_agg(value, ', ' order by value)
              else null
            end
            from jsonb_array_elements_text(impact_targets) as t(value)
            where value not in ('Equities', 'Rates', 'FX', 'Oil', 'Credit')
          )
          else null
        end
      )
    )
  else market_impact
end
where market_impact = '{}'::jsonb;

update public.market_events
set transmission_path = case
  when transmission_path = '[]'::jsonb then jsonb_build_array('Legacy cached event -> structured transmission path pending refresh')
  else transmission_path
end
where transmission_path = '[]'::jsonb;
