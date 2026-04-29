create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  name text not null,
  brand text not null,
  price numeric(10, 2) not null,
  image text not null,
  rating numeric(3, 2) not null,
  category text not null,
  retailer text not null,
  purchase_url text not null,
  colors text[] not null default '{}',
  styles text[] not null default '{}',
  use_cases text[] not null default '{}',
  summary text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists saved_items (
  user_id uuid not null references users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_products_price on products(price);
create index if not exists idx_saved_items_user on saved_items(user_id);
