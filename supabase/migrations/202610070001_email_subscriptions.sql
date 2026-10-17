create extension if not exists pgcrypto;

create table public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  price_alerts boolean not null default false,
  weekly_brief boolean not null default false,
  pending_price_alerts boolean not null default false,
  pending_weekly_brief boolean not null default false,
  pending_alert_rules jsonb not null default '[]'::jsonb,
  one_time_code_hash text unique,
  one_time_code_expires_at timestamptz,
  management_token_hash text unique,
  management_token_expires_at timestamptz,
  verified_at timestamptz,
  last_weekly_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.email_alert_rules (
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  symbol text not null check (symbol in ('BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'LINK')),
  kind text not null check (kind in ('above', 'below', 'up', 'down')),
  target numeric not null check (target > 0),
  reference_price numeric not null check (reference_price > 0),
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, id)
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  dedupe_key text not null unique,
  kind text not null check (kind in ('price_alert', 'weekly_brief')),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.email_attempt_limits (
  bucket_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null
);

create index email_alert_rules_ready_idx on public.email_alert_rules (subscriber_id, enabled) where enabled and last_triggered_at is null;
create index email_outbox_ready_idx on public.email_outbox (next_attempt_at, created_at) where status = 'queued';
create index email_subscribers_active_weekly_idx on public.email_subscribers (id) where status = 'active' and weekly_brief;

alter table public.email_subscribers enable row level security;
alter table public.email_alert_rules enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_attempt_limits enable row level security;

revoke all on public.email_subscribers, public.email_alert_rules, public.email_outbox, public.email_attempt_limits from anon, authenticated;
grant all on public.email_subscribers, public.email_alert_rules, public.email_outbox, public.email_attempt_limits to service_role;

create or replace function public.consume_email_attempt(
  p_bucket_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  insert into public.email_attempt_limits (bucket_hash, window_started_at, attempts)
  values (p_bucket_hash, now(), 1)
  on conflict (bucket_hash) do update
  set window_started_at = case
        when email_attempt_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
        else email_attempt_limits.window_started_at
      end,
      attempts = case
        when email_attempt_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
        else email_attempt_limits.attempts + 1
      end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

create or replace function public.begin_email_subscription(
  p_email text,
  p_price_alerts boolean,
  p_weekly_brief boolean,
  p_alert_rules jsonb,
  p_code_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscriber_id uuid;
begin
  if jsonb_typeof(p_alert_rules) <> 'array' or jsonb_array_length(p_alert_rules) > 50 then
    raise exception 'Invalid alert rules.';
  end if;

  insert into public.email_subscribers as existing (
    email,
    status,
    pending_price_alerts,
    pending_weekly_brief,
    pending_alert_rules,
    one_time_code_hash,
    one_time_code_expires_at
  ) values (
    lower(btrim(p_email)),
    'pending',
    p_price_alerts,
    p_weekly_brief,
    p_alert_rules,
    p_code_hash,
    p_expires_at
  )
  on conflict (email) do update
  set status = case when existing.status = 'active' then 'active' else 'pending' end,
      pending_price_alerts = excluded.pending_price_alerts,
      pending_weekly_brief = excluded.pending_weekly_brief,
      pending_alert_rules = excluded.pending_alert_rules,
      one_time_code_hash = excluded.one_time_code_hash,
      one_time_code_expires_at = excluded.one_time_code_expires_at
  returning id into v_subscriber_id;

  return v_subscriber_id;
end;
$$;

create or replace function public.verify_email_subscription(p_email text, p_code_hash text)
returns table (subscriber_id uuid, email text, price_alerts boolean, weekly_brief boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscriber public.email_subscribers%rowtype;
  v_rule jsonb;
begin
  update public.email_subscribers as subscriber
  set one_time_code_hash = null,
      one_time_code_expires_at = null,
      status = 'active',
      price_alerts = pending_price_alerts,
      weekly_brief = pending_weekly_brief,
      verified_at = coalesce(verified_at, now())
  where subscriber.email = p_email
    and subscriber.one_time_code_hash = p_code_hash
    and subscriber.one_time_code_expires_at > now()
    and subscriber.status in ('pending', 'active')
  returning subscriber.* into v_subscriber;

  if not found then
    return;
  end if;

  delete from public.email_alert_rules as saved
  where saved.subscriber_id = v_subscriber.id
    and not exists (
      select 1
      from jsonb_array_elements(v_subscriber.pending_alert_rules) as incoming(value)
      where incoming.value ->> 'id' = saved.id
    );

  if v_subscriber.pending_alert_rules <> '[]'::jsonb then
    for v_rule in select value from jsonb_array_elements(v_subscriber.pending_alert_rules)
    loop
      insert into public.email_alert_rules (subscriber_id, id, symbol, kind, target, reference_price, enabled)
      values (
        v_subscriber.id,
        v_rule ->> 'id',
        v_rule ->> 'symbol',
        v_rule ->> 'kind',
        (v_rule ->> 'target')::numeric,
        (v_rule ->> 'referencePrice')::numeric,
        coalesce((v_rule ->> 'enabled')::boolean, true)
      )
      on conflict (subscriber_id, id) do update
      set symbol = excluded.symbol,
          kind = excluded.kind,
          target = excluded.target,
          reference_price = excluded.reference_price,
          enabled = excluded.enabled,
          last_triggered_at = null;
    end loop;
  end if;

  update public.email_subscribers
  set pending_alert_rules = '[]'::jsonb,
      pending_price_alerts = false,
      pending_weekly_brief = false
  where id = v_subscriber.id;

  return query select v_subscriber.id, v_subscriber.email, v_subscriber.price_alerts, v_subscriber.weekly_brief;
end;
$$;

create or replace function public.replace_email_alert_rules(p_subscriber_id uuid, p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule jsonb;
begin
  delete from public.email_alert_rules as saved
  where saved.subscriber_id = p_subscriber_id
    and not exists (
      select 1
      from jsonb_array_elements(p_rules) as incoming(value)
      where incoming.value ->> 'id' = saved.id
    );

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    insert into public.email_alert_rules (subscriber_id, id, symbol, kind, target, reference_price, enabled)
    values (
      p_subscriber_id,
      v_rule ->> 'id',
      v_rule ->> 'symbol',
      v_rule ->> 'kind',
      (v_rule ->> 'target')::numeric,
      (v_rule ->> 'referencePrice')::numeric,
      coalesce((v_rule ->> 'enabled')::boolean, true)
    )
    on conflict (subscriber_id, id) do update
    set symbol = excluded.symbol,
        kind = excluded.kind,
        target = excluded.target,
        reference_price = excluded.reference_price,
        enabled = excluded.enabled,
        last_triggered_at = case
          when email_alert_rules.symbol <> excluded.symbol
            or email_alert_rules.kind <> excluded.kind
            or email_alert_rules.target <> excluded.target
            or email_alert_rules.reference_price <> excluded.reference_price then null
          else email_alert_rules.last_triggered_at
        end;
  end loop;
end;
$$;

create or replace function public.save_email_preferences(
  p_subscriber_id uuid,
  p_price_alerts boolean,
  p_weekly_brief boolean,
  p_rules jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 50 then
    raise exception 'Invalid alert rules.';
  end if;
  update public.email_subscribers
  set price_alerts = p_price_alerts,
      weekly_brief = p_weekly_brief
  where id = p_subscriber_id and status = 'active';
  if not found then
    raise exception 'Active subscriber not found.';
  end if;
  perform public.replace_email_alert_rules(p_subscriber_id, p_rules);
end;
$$;

create or replace function public.queue_price_alert(
  p_subscriber_id uuid,
  p_rule_id text,
  p_current_price numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.email_alert_rules%rowtype;
  v_outbox_id uuid;
begin
  update public.email_alert_rules
  set enabled = false, last_triggered_at = clock_timestamp()
  where subscriber_id = p_subscriber_id
    and id = p_rule_id
    and enabled
    and last_triggered_at is null
    and case kind
      when 'above' then p_current_price >= target
      when 'below' then p_current_price <= target
      when 'up' then ((p_current_price / reference_price) - 1) * 100 >= target
      when 'down' then ((p_current_price / reference_price) - 1) * 100 <= -target
    end
  returning * into v_rule;

  if not found then
    return null;
  end if;

  insert into public.email_outbox (subscriber_id, dedupe_key, kind, payload)
  values (
    p_subscriber_id,
    'alert:' || p_subscriber_id::text || ':' || p_rule_id || ':' || to_char(v_rule.last_triggered_at at time zone 'utc', 'YYYYMMDDHH24MISSMS'),
    'price_alert',
    jsonb_build_object(
      'symbol', v_rule.symbol,
      'kind', v_rule.kind,
      'target', v_rule.target,
      'referencePrice', v_rule.reference_price,
      'currentPrice', p_current_price
    )
  )
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$$;

create or replace function public.queue_reached_price_alerts(p_prices jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with snapshots as (
    select key as symbol, value::numeric as current_price
    from jsonb_each_text(p_prices)
  ), candidates as (
    select
      rule.subscriber_id,
      rule.id,
      rule.symbol,
      rule.kind,
      rule.target,
      rule.reference_price,
      snapshot.current_price
    from public.email_alert_rules as rule
    join public.email_subscribers as subscriber
      on subscriber.id = rule.subscriber_id
    join snapshots as snapshot on snapshot.symbol = rule.symbol
    where rule.enabled
      and rule.last_triggered_at is null
      and subscriber.status = 'active'
      and subscriber.price_alerts
      and case rule.kind
        when 'above' then snapshot.current_price >= rule.target
        when 'below' then snapshot.current_price <= rule.target
        when 'up' then ((snapshot.current_price / rule.reference_price) - 1) * 100 >= rule.target
        when 'down' then ((snapshot.current_price / rule.reference_price) - 1) * 100 <= -rule.target
      end
  ), triggered as (
    update public.email_alert_rules as rule
    set enabled = false, last_triggered_at = clock_timestamp()
    from candidates
    where rule.subscriber_id = candidates.subscriber_id
      and rule.id = candidates.id
      and rule.enabled
      and rule.last_triggered_at is null
    returning rule.subscriber_id, rule.id, rule.symbol, rule.kind, rule.target,
      rule.reference_price, rule.last_triggered_at, candidates.current_price
  ), enqueued as (
    insert into public.email_outbox (subscriber_id, dedupe_key, kind, payload)
    select
      subscriber_id,
      'alert:' || subscriber_id::text || ':' || id || ':' || to_char(last_triggered_at at time zone 'utc', 'YYYYMMDDHH24MISSMS'),
      'price_alert',
      jsonb_build_object(
        'symbol', symbol,
        'kind', kind,
        'target', target,
        'referencePrice', reference_price,
        'currentPrice', current_price
      )
    from triggered
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_count from enqueued;

  return v_count;
end;
$$;

create or replace function public.claim_email_outbox(p_limit integer default 50)
returns setof public.email_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  with selected as (
    select id
    from public.email_outbox
    where (status = 'queued' and next_attempt_at <= now())
      or (status = 'sending' and claimed_at < now() - interval '15 minutes')
    order by created_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.email_outbox as outbox
  set status = 'sending', attempts = attempts + 1, claimed_at = now()
  from selected
  where outbox.id = selected.id
  returning outbox.*;
$$;

revoke all on function public.consume_email_attempt(text, integer, integer) from public, anon, authenticated;
revoke all on function public.begin_email_subscription(text, boolean, boolean, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.verify_email_subscription(text, text) from public, anon, authenticated;
revoke all on function public.replace_email_alert_rules(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_email_preferences(uuid, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.queue_price_alert(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.queue_reached_price_alerts(jsonb) from public, anon, authenticated;
revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.consume_email_attempt(text, integer, integer) to service_role;
grant execute on function public.begin_email_subscription(text, boolean, boolean, jsonb, text, timestamptz) to service_role;
grant execute on function public.verify_email_subscription(text, text) to service_role;
grant execute on function public.replace_email_alert_rules(uuid, jsonb) to service_role;
grant execute on function public.save_email_preferences(uuid, boolean, boolean, jsonb) to service_role;
grant execute on function public.queue_price_alert(uuid, text, numeric) to service_role;
grant execute on function public.queue_reached_price_alerts(jsonb) to service_role;
grant execute on function public.claim_email_outbox(integer) to service_role;
