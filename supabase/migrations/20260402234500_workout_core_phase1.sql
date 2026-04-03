begin;

create extension if not exists pgcrypto;

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text null,
  status text not null default 'active',
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz null,

  constraint workout_sessions_status_allowed
    check (status in ('active', 'completed', 'incomplete')),

  constraint workout_sessions_lifecycle_check
    check (
      (status = 'active' and ended_at is null)
      or
      (status in ('completed', 'incomplete') and ended_at is not null)
    )
);

create unique index if not exists workout_sessions_one_active_per_user_idx
  on public.workout_sessions (user_id)
  where status = 'active';

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  order_index integer not null,
  superset_group_id uuid null,
  created_at timestamptz not null default timezone('utc', now()),

  constraint workout_exercises_order_index_positive
    check (order_index > 0),

  constraint workout_exercises_session_order_unique
    unique (session_id, order_index)
);

create index if not exists workout_exercises_session_order_idx
  on public.workout_exercises (session_id, order_index);

create index if not exists workout_exercises_exercise_id_idx
  on public.workout_exercises (exercise_id);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null,
  set_type text not null default 'working',
  weight_lbs numeric(6,2) null,
  reps integer null,
  completed boolean not null default false,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),

  constraint workout_sets_set_number_positive
    check (set_number > 0),

  constraint workout_sets_set_type_allowed
    check (set_type in ('working', 'warmup', 'drop', 'failure')),

  constraint workout_sets_weight_non_negative
    check (weight_lbs is null or weight_lbs >= 0),

  constraint workout_sets_reps_non_negative
    check (reps is null or reps >= 0),

  constraint workout_sets_completed_requires_reps_gt_zero
    check (
      (completed = true and reps is not null and reps > 0)
      or
      (completed = false and (reps is null or reps >= 0))
    ),

  constraint workout_sets_completion_consistency
    check (
      (completed = false and completed_at is null)
      or
      (completed = true and completed_at is not null)
    ),

  constraint workout_sets_exercise_set_number_unique
    unique (workout_exercise_id, set_number)
);

create index if not exists workout_sets_exercise_set_number_idx
  on public.workout_sets (workout_exercise_id, set_number);

create index if not exists workout_sets_completed_idx
  on public.workout_sets (completed);

alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists workout_sessions_owner_select on public.workout_sessions;
drop policy if exists workout_sessions_owner_insert on public.workout_sessions;
drop policy if exists workout_sessions_owner_update on public.workout_sessions;
drop policy if exists workout_sessions_owner_delete on public.workout_sessions;

create policy workout_sessions_owner_select
on public.workout_sessions
for select
using (auth.uid() = user_id);

create policy workout_sessions_owner_insert
on public.workout_sessions
for insert
with check (auth.uid() = user_id);

create policy workout_sessions_owner_update
on public.workout_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy workout_sessions_owner_delete
on public.workout_sessions
for delete
using (auth.uid() = user_id);

drop policy if exists workout_exercises_owner_select on public.workout_exercises;
drop policy if exists workout_exercises_owner_insert on public.workout_exercises;
drop policy if exists workout_exercises_owner_update on public.workout_exercises;
drop policy if exists workout_exercises_owner_delete on public.workout_exercises;

create policy workout_exercises_owner_select
on public.workout_exercises
for select
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_exercises.session_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_exercises_owner_insert
on public.workout_exercises
for insert
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_exercises.session_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_exercises_owner_update
on public.workout_exercises
for update
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_exercises.session_id
      and ws.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_exercises.session_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_exercises_owner_delete
on public.workout_exercises
for delete
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_exercises.session_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_sets_owner_select on public.workout_sets;
drop policy if exists workout_sets_owner_insert on public.workout_sets;
drop policy if exists workout_sets_owner_update on public.workout_sets;
drop policy if exists workout_sets_owner_delete on public.workout_sets;

create policy workout_sets_owner_select
on public.workout_sets
for select
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id = we.session_id
    where we.id = workout_sets.workout_exercise_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_sets_owner_insert
on public.workout_sets
for insert
with check (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id = we.session_id
    where we.id = workout_sets.workout_exercise_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_sets_owner_update
on public.workout_sets
for update
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id = we.session_id
    where we.id = workout_sets.workout_exercise_id
      and ws.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id = we.session_id
    where we.id = workout_sets.workout_exercise_id
      and ws.user_id = auth.uid()
  )
);

create policy workout_sets_owner_delete
on public.workout_sets
for delete
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id = we.session_id
    where we.id = workout_sets.workout_exercise_id
      and ws.user_id = auth.uid()
  )
);

commit;
