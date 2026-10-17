alter table public.managed_investments
  add column movement_direction text not null default 'paused'
    check (movement_direction in ('up', 'down', 'paused')),
  add column movement_amount numeric(14, 2) not null default 1
    check (movement_amount > 0),
  add column movement_interval_seconds integer not null default 30
    check (movement_interval_seconds between 10 and 86400),
  add column next_movement_at timestamptz not null
    default now() + interval '30 seconds';

create table public.managed_investment_history (
  id uuid primary key default gen_random_uuid(),
  managed_investment_id uuid not null
    references public.managed_investments(id) on delete cascade,
  balance_usd numeric(16, 2) not null check (balance_usd >= 0),
  recorded_at timestamptz not null default now()
);

create index managed_investment_history_recorded_idx
  on public.managed_investment_history (managed_investment_id, recorded_at desc);

insert into public.managed_investment_history (
  managed_investment_id,
  balance_usd,
  recorded_at
)
select
  id,
  invested_usd + return_usd,
  updated_at
from public.managed_investments;

alter table public.managed_investment_history enable row level security;
revoke all on public.managed_investment_history from anon, authenticated;
grant all on public.managed_investment_history to service_role;

create function public.record_managed_investment_value()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.managed_investment_history (
    managed_investment_id,
    balance_usd
  )
  values (
    new.id,
    new.invested_usd + new.return_usd
  );

  delete from public.managed_investment_history
  where managed_investment_id = new.id
    and id not in (
      select id
      from public.managed_investment_history
      where managed_investment_id = new.id
      order by recorded_at desc, id desc
      limit 200
    );

  return new;
end;
$$;

revoke all on function public.record_managed_investment_value() from public, anon, authenticated;

create trigger managed_investment_value_history
after insert or update of invested_usd, return_usd
on public.managed_investments
for each row
execute function public.record_managed_investment_value();

create function public.advance_managed_investments(p_user_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  with due_investments as materialized (
    select
      id,
      least(
        100::numeric,
        floor(
          extract(epoch from (now() - next_movement_at))
          / movement_interval_seconds
        ) + 1
      )::integer as movement_steps
    from public.managed_investments
    where user_id = p_user_id
      and movement_direction <> 'paused'
      and next_movement_at <= now()
    for update
  )
  update public.managed_investments as investment
  set
    return_usd = least(
      999999999999.99 - investment.invested_usd,
      greatest(
        -investment.invested_usd,
        investment.return_usd
          + case investment.movement_direction
              when 'up' then investment.movement_amount * due_investments.movement_steps
              else -investment.movement_amount * due_investments.movement_steps
            end
      )
    ),
    next_movement_at = investment.next_movement_at
      + interval '1 second'
        * investment.movement_interval_seconds
        * due_investments.movement_steps,
    updated_at = now()
  from due_investments
  where investment.id = due_investments.id;
$$;

revoke all on function public.advance_managed_investments(uuid) from public, anon, authenticated;
grant execute on function public.advance_managed_investments(uuid) to service_role;
