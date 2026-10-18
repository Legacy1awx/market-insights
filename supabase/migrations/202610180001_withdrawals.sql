-- User withdrawal requests, reviewed by admins.
-- Flow: pending ⇄ processing → completed | rejected (completed/rejected are final).
-- Completing a request deducts the amount from the user's investment in the
-- same token: return first, then the invested principal.

-- Allow an investment to be fully withdrawn (value $0) instead of deleted,
-- so its chart history is kept.
alter table public.managed_investments
  drop constraint if exists managed_investments_invested_usd_check;
alter table public.managed_investments
  add constraint managed_investments_invested_usd_check
  check (invested_usd >= 0);

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('USDT', 'BTC', 'ETH', 'SOL')),
  amount_usd numeric(14, 2) not null check (amount_usd > 0),
  destination_address text not null
    check (length(destination_address) between 20 and 150),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'rejected')),
  admin_note text check (admin_note is null or length(admin_note) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index withdrawal_requests_user_idx
  on public.withdrawal_requests (user_id, created_at desc);
create index withdrawal_requests_status_idx
  on public.withdrawal_requests (status, created_at desc);

create table public.withdrawal_events (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null
    references public.withdrawal_requests(id) on delete cascade,
  status text not null
    check (status in ('pending', 'processing', 'completed', 'rejected')),
  note text check (note is null or length(note) <= 500),
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index withdrawal_events_withdrawal_idx
  on public.withdrawal_events (withdrawal_id, created_at);

alter table public.withdrawal_requests enable row level security;
alter table public.withdrawal_events enable row level security;
revoke all on public.withdrawal_requests, public.withdrawal_events
  from anon, authenticated;
grant all on public.withdrawal_requests, public.withdrawal_events
  to service_role;

-- Records the initial "pending" event for every new request.
create function public.record_withdrawal_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.withdrawal_events (withdrawal_id, status)
  values (new.id, new.status);
  return new;
end;
$$;

revoke all on function public.record_withdrawal_created()
  from public, anon, authenticated;

create trigger withdrawal_created
after insert on public.withdrawal_requests
for each row execute function public.record_withdrawal_created();

-- Changes a request's status. Returns:
--   'ok', 'not_found', 'final' (already completed/rejected),
--   'unchanged', 'insufficient_funds' (completing more than the investment holds).
create function public.set_withdrawal_status(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_status text,
  p_note text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.withdrawal_requests%rowtype;
  v_investment public.managed_investments%rowtype;
  v_from_return numeric(14, 2);
  v_note text := nullif(btrim(p_note), '');
begin
  if p_status not in ('pending', 'processing', 'completed', 'rejected') then
    raise exception 'Invalid withdrawal status.';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_request.status in ('completed', 'rejected') then
    return 'final';
  end if;
  if v_request.status = p_status then
    return 'unchanged';
  end if;

  if p_status = 'completed' then
    -- Settle any pending timed movement first so the balance is current.
    perform public.advance_managed_investments(v_request.user_id);

    select * into v_investment
    from public.managed_investments
    where user_id = v_request.user_id and symbol = v_request.symbol
    for update;
    if not found
      or v_investment.invested_usd + v_investment.return_usd
        < v_request.amount_usd then
      return 'insufficient_funds';
    end if;

    -- Take from the return (profit) first, then from the principal.
    v_from_return := least(
      greatest(v_investment.return_usd, 0),
      v_request.amount_usd
    );
    update public.managed_investments
    set
      return_usd = return_usd - v_from_return,
      invested_usd = invested_usd - (v_request.amount_usd - v_from_return),
      updated_by = p_admin_id,
      updated_at = now()
    where id = v_investment.id;
  end if;

  update public.withdrawal_requests
  set
    status = p_status,
    admin_note = coalesce(v_note, admin_note),
    updated_by = p_admin_id,
    updated_at = now()
  where id = p_withdrawal_id;

  insert into public.withdrawal_events (withdrawal_id, status, note, admin_id)
  values (p_withdrawal_id, p_status, v_note, p_admin_id);

  return 'ok';
end;
$$;

revoke all on function public.set_withdrawal_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_withdrawal_status(uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
