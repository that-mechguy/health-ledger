-- Health Ledger · update: friends can sign up, profiles & conditions, medicines, shared Claude key with a daily cap
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
-- Keep this file off GitHub (it names your admin email).

-- ───────────── 1) Admins (you) ─────────────
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
drop policy if exists "see own admin row" on public.app_admins;
create policy "see own admin row" on public.app_admins for select to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.app_admins to service_role;

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower('mishrabhisekh97@gmail.com')
on conflict do nothing;

create or replace function public.hl_is_admin(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.app_admins where user_id = u) $$;
grant execute on function public.hl_is_admin(uuid) to authenticated, service_role;

-- ───────────── 2) Open sign-up: anyone with the link can create an account (each person sees only their own data) ─────────────
drop trigger if exists hl_invite_only on auth.users;
drop function if exists public.hl_check_invite();

-- ───────────── 3) Profile: physique, goal, diet, conditions, allergies ─────────────
create table if not exists public.user_profile (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_profile enable row level security;
drop policy if exists "own profile" on public.user_profile;
create policy "own profile" on public.user_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.user_profile to authenticated;
-- the admin's People list: everyone who has signed up (name from their profile), visible only to admins
drop view if exists public.people_list;
create view public.people_list with (security_invoker = false) as
  select u.id as user_id, u.email, u.created_at as joined_at, u.last_sign_in_at,
         coalesce(p.doc->>'name', u.raw_user_meta_data->>'name') as profile_name, (p.user_id is not null) as has_profile
  from auth.users u
  left join public.user_profile p on p.user_id = u.id
  where public.hl_is_admin();
revoke all on public.people_list from anon;
grant select on public.people_list to authenticated;

-- ───────────── 4) Medicines and the daily taken/missed log ─────────────
create table if not exists public.medications (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc        jsonb not null,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists medications_user on public.medications (user_id);
alter table public.medications enable row level security;
drop policy if exists "own medications" on public.medications;
create policy "own medications" on public.medications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.medications to authenticated;

create table if not exists public.med_log (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  med_id     text not null,
  day        date not null,
  slot       text not null,                 -- scheduled time "08:00", or "prn" for as-needed
  status     text not null check (status in ('taken','skipped')),
  qty        numeric not null default 1,
  at         timestamptz not null default now()
);
create index if not exists med_log_user_day on public.med_log (user_id, day);
alter table public.med_log enable row level security;
drop policy if exists "own med log" on public.med_log;
create policy "own med log" on public.med_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.med_log to authenticated;

-- ───────────── 5) Shared Claude key: daily usage counter (written only by the Edge Function) ─────────────
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  calls   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
drop policy if exists "own usage" on public.ai_usage;
create policy "own usage" on public.ai_usage for select to authenticated using (user_id = auth.uid() or public.hl_is_admin());
grant select, insert, update on public.ai_usage to service_role;

insert into public.hl_private (name, value) values ('ai_daily_cap', '5') on conflict (name) do nothing;
grant select on public.hl_private to service_role;

-- atomically count one AI call; returns the new count, or -1 when the cap is reached (admins are never capped)
create or replace function public.hl_ai_bump(p_uid uuid) returns int
language plpgsql security definer set search_path = public as
$$
declare cap int; n int; d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select coalesce(value::int, 5) into cap from public.hl_private where name = 'ai_daily_cap';
  insert into public.ai_usage (user_id, day, calls) values (p_uid, d, 0) on conflict do nothing;
  select calls into n from public.ai_usage where user_id = p_uid and day = d for update;
  if n >= coalesce(cap, 5) and not public.hl_is_admin(p_uid) then return -1; end if;
  update public.ai_usage set calls = calls + 1 where user_id = p_uid and day = d returning calls into n;
  return n;
end
$$;
revoke all on function public.hl_ai_bump(uuid) from public, anon, authenticated;
grant execute on function public.hl_ai_bump(uuid) to service_role;

-- ───────────── 6) Make sure every nutrition table is private per person ─────────────
do $$
declare t text;
begin
  foreach t in array array['food_entries','water_log','food_products','supplements','nutrition_plan'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
        execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
      end if;
    end if;
  end loop;
end $$;

-- admin: change how many AI actions each friend gets per day (0 = friends must use their own Claude key)
create or replace function public.hl_set_ai_cap(n int) returns int
language plpgsql security definer set search_path = public as
$$
begin
  if not public.hl_is_admin() then raise exception 'admins only'; end if;
  insert into public.hl_private (name, value) values ('ai_daily_cap', greatest(0, least(n, 500))::text)
  on conflict (name) do update set value = excluded.value;
  return greatest(0, least(n, 500));
end
$$;
revoke all on function public.hl_set_ai_cap(int) from public, anon;
grant execute on function public.hl_set_ai_cap(int) to authenticated;
