begin;

create extension if not exists pgcrypto;

create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text null,
  experience_level text null,
  training_goal text null,
  created_at timestamptz not null default timezone('utc', now()),
  last_active_at timestamptz null,
  is_admin boolean not null default false,
  is_disabled boolean not null default false,

  constraint users_profile_email_not_blank
    check (length(btrim(email)) > 0),
  constraint users_profile_display_name_not_blank_if_present
    check (display_name is null or length(btrim(display_name)) > 0)
);

create table if not exists public.exercise_requests (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  user_id uuid null references auth.users(id) on delete set null,
  user_email text null,
  notes text null,
  reference_link text null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),

  constraint exercise_requests_exercise_name_not_blank
    check (length(btrim(exercise_name)) > 0),
  constraint exercise_requests_user_email_not_blank_if_present
    check (user_email is null or length(btrim(user_email)) > 0),
  constraint exercise_requests_status_allowed
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists exercise_requests_created_at_idx
  on public.exercise_requests (created_at desc);

create index if not exists exercise_requests_status_idx
  on public.exercise_requests (status);

create index if not exists exercise_requests_user_id_idx
  on public.exercise_requests (user_id);

alter table public.users_profile enable row level security;
alter table public.exercise_requests enable row level security;

create or replace function public.is_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users_profile up
    where up.id = p_user_id
      and up.is_admin = true
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
revoke all on function public.is_admin_user(uuid) from anon;
grant execute on function public.is_admin_user(uuid) to authenticated;

drop policy if exists users_profile_owner_insert on public.users_profile;
drop policy if exists users_profile_owner_read on public.users_profile;
drop policy if exists users_profile_owner_update on public.users_profile;
drop policy if exists users_profile_admin_read_all on public.users_profile;
drop policy if exists users_profile_admin_update_all on public.users_profile;

create policy users_profile_owner_insert
on public.users_profile
for insert
with check (auth.uid() = id);

create policy users_profile_owner_read
on public.users_profile
for select
using (auth.uid() = id);

create policy users_profile_owner_update
on public.users_profile
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy users_profile_admin_read_all
on public.users_profile
for select
using (public.is_admin_user(auth.uid()));

create policy users_profile_admin_update_all
on public.users_profile
for update
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists exercise_requests_user_insert_own on public.exercise_requests;
drop policy if exists exercise_requests_admin_read_all on public.exercise_requests;
drop policy if exists exercise_requests_admin_update_all on public.exercise_requests;

create policy exercise_requests_user_insert_own
on public.exercise_requests
for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy exercise_requests_admin_read_all
on public.exercise_requests
for select
using (public.is_admin_user(auth.uid()));

create policy exercise_requests_admin_update_all
on public.exercise_requests
for update
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

commit;
