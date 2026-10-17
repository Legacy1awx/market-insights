create table public.deposit_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('USDT', 'BTC', 'ETH', 'SOL')),
  network text not null check (network in ('TRON-TRC20', 'BITCOIN', 'ETHEREUM', 'SOLANA')),
  amount numeric(40, 18) not null check (amount > 0),
  transaction_hash text not null check (length(transaction_hash) between 64 and 100),
  sender_address text check (sender_address is null or length(sender_address) <= 150),
  recipient_address text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  review_note text check (review_note is null or length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (network, transaction_hash),
  check (
    (symbol = 'USDT' and network = 'TRON-TRC20')
    or (symbol = 'BTC' and network = 'BITCOIN')
    or (symbol = 'ETH' and network = 'ETHEREUM')
    or (symbol = 'SOL' and network = 'SOLANA')
  ),
  check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('confirmed', 'rejected') and reviewed_at is not null)
  )
);

create index deposit_submissions_user_idx
  on public.deposit_submissions (user_id, submitted_at desc);
create index deposit_submissions_admin_idx
  on public.deposit_submissions (status, submitted_at desc);

create table public.deposit_review_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.deposit_submissions(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  previous_status text not null check (previous_status = 'pending'),
  new_status text not null check (new_status in ('confirmed', 'rejected')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);

create index deposit_review_events_submission_idx
  on public.deposit_review_events (submission_id, created_at desc);

alter table public.deposit_submissions enable row level security;
alter table public.deposit_review_events enable row level security;

revoke all on public.deposit_submissions, public.deposit_review_events from anon, authenticated;
grant all on public.deposit_submissions, public.deposit_review_events to service_role;

create or replace function public.review_deposit_submission(
  p_submission_id uuid,
  p_admin_id uuid,
  p_status text,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_status text;
begin
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'Invalid deposit review status.';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'Review note is too long.';
  end if;

  update public.deposit_submissions
  set status = p_status,
      review_note = nullif(btrim(p_note), ''),
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = p_submission_id and status = 'pending'
  returning 'pending' into v_previous_status;

  if not found then
    return false;
  end if;

  insert into public.deposit_review_events (
    submission_id, admin_id, previous_status, new_status, note
  ) values (
    p_submission_id, p_admin_id, v_previous_status, p_status, nullif(btrim(p_note), '')
  );
  return true;
end;
$$;

revoke all on function public.review_deposit_submission(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_deposit_submission(uuid, uuid, text, text) to service_role;

create or replace function public.count_user_deposit_submissions(p_user_ids uuid[])
returns table (user_id uuid, deposit_count bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select submission.user_id, count(*) as deposit_count
  from public.deposit_submissions as submission
  where submission.user_id = any(p_user_ids)
  group by submission.user_id;
$$;

revoke all on function public.count_user_deposit_submissions(uuid[]) from public, anon, authenticated;
grant execute on function public.count_user_deposit_submissions(uuid[]) to service_role;
