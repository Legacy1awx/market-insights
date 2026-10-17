create table public.managed_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('USDT', 'BTC', 'ETH', 'SOL')),
  invested_usd numeric(14, 2) not null check (invested_usd > 0),
  return_usd numeric(14, 2) not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol),
  check (return_usd >= -invested_usd)
);

create index managed_investments_user_idx
  on public.managed_investments (user_id, symbol);

alter table public.managed_investments enable row level security;
revoke all on public.managed_investments from anon, authenticated;
grant all on public.managed_investments to service_role;
