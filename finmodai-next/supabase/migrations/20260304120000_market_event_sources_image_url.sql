alter table if exists public.market_event_sources
add column if not exists image_url text;

