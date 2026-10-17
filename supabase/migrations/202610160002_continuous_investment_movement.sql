alter table public.managed_investments
  drop constraint if exists managed_investments_movement_direction_check;

alter table public.managed_investments
  add constraint managed_investments_movement_direction_check
  check (movement_direction in ('up', 'down', 'continuous', 'paused'));

create or replace function public.advance_managed_investments(p_user_id uuid)
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
              when 'up' then
                investment.movement_amount * due_investments.movement_steps
              when 'down' then
                -investment.movement_amount * due_investments.movement_steps
              else
                (case when random() < 0.5 then 1 else -1 end)
                * investment.movement_amount
                * due_investments.movement_steps
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

revoke all on function public.advance_managed_investments(uuid)
  from public, anon, authenticated;
grant execute on function public.advance_managed_investments(uuid)
  to service_role;

notify pgrst, 'reload schema';
