create table public.market_overrides (
  symbol text primary key check (symbol in ('BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'LINK')),
  price_override numeric check (price_override > 0),
  change_override numeric check (change_override between -100 and 1000),
  updated_at timestamptz not null default now(),
  check (price_override is not null or change_override is not null)
);

create table public.market_content (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  summary text not null check (length(btrim(summary)) between 1 and 500),
  category text not null check (length(btrim(category)) between 1 and 60),
  read_minutes integer not null check (read_minutes between 1 and 60),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check ((published and published_at is not null) or (not published and published_at is null))
);

create index market_content_published_idx
  on public.market_content (published_at desc)
  where published;

alter table public.market_overrides enable row level security;
alter table public.market_content enable row level security;

revoke all on public.market_overrides, public.market_content from anon, authenticated;
grant select on public.market_overrides, public.market_content to service_role;
grant insert, update, delete on public.market_overrides, public.market_content to service_role;
