create table if not exists public.event_headline_images (
  id bigserial primary key,
  headline_hash text not null unique,
  headline text not null,
  category text,
  query text not null,
  image_url text not null,
  thumb_url text not null,
  provider text not null default 'pexels',
  source_url text not null,
  author text,
  author_url text,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_event_headline_images_expires_at
  on public.event_headline_images (expires_at desc);

alter table public.event_headline_images enable row level security;
