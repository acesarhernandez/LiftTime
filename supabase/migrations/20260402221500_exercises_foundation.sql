begin;

create extension if not exists pgcrypto;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),

  muscle_groups text[] not null,
  secondary_muscles text[] not null default '{}'::text[],
  equipment text[] not null,
  category text not null,
  mechanic text not null,
  force text not null,
  difficulty text not null,

  tracking_type text not null,
  progression_model text not null,
  default_sets integer not null,
  default_reps integer not null,
  rep_range_min integer not null,
  rep_range_max integer not null,
  increment_lbs numeric(6,2) not null default 5,
  is_bodyweight boolean not null default false,
  is_unilateral boolean not null default false,
  beginner_starting_weight_lbs numeric(6,2) null,
  progressive_overload_notes text null,

  instructions text[] not null,
  cues text[] not null default '{}'::text[],
  common_mistakes text[] not null default '{}'::text[],

  media_url text null,
  media_type text not null default 'none',
  thumbnail_url text null,
  secondary_media_urls text[] not null default '{}'::text[],

  constraint exercises_name_not_blank
    check (length(btrim(name)) > 0),

  constraint exercises_slug_not_blank
    check (length(btrim(slug)) > 0),

  constraint exercises_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  constraint exercises_muscle_groups_present
    check (coalesce(array_length(muscle_groups, 1), 0) > 0),

  constraint exercises_equipment_present
    check (coalesce(array_length(equipment, 1), 0) > 0),

  constraint exercises_instructions_present
    check (coalesce(array_length(instructions, 1), 0) > 0),

  constraint exercises_muscle_groups_allowed
    check (
      muscle_groups <@ array[
        'chest','back','shoulders','biceps','triceps','forearms',
        'quads','hamstrings','glutes','calves','core','traps'
      ]::text[]
    ),

  constraint exercises_secondary_muscles_allowed
    check (
      secondary_muscles <@ array[
        'chest','back','shoulders','biceps','triceps','forearms',
        'quads','hamstrings','glutes','calves','core','traps'
      ]::text[]
    ),

  constraint exercises_equipment_allowed
    check (
      equipment <@ array[
        'barbell','dumbbell','cable','machine','bodyweight',
        'kettlebell','band','bench','pullup_bar','dip_bar'
      ]::text[]
    ),

  constraint exercises_category_allowed
    check (category in ('compound', 'isolation')),

  constraint exercises_mechanic_allowed
    check (mechanic in ('push', 'pull', 'static', 'hinge', 'squat')),

  constraint exercises_force_allowed
    check (force in ('push', 'pull', 'static')),

  constraint exercises_difficulty_allowed
    check (difficulty in ('beginner', 'intermediate', 'advanced')),

  constraint exercises_tracking_type_allowed
    check (tracking_type in ('weight_reps', 'bodyweight_reps', 'duration', 'reps_only')),

  constraint exercises_progression_model_allowed
    check (progression_model in ('linear', 'double_progression', 'rep_ladder', 'none')),

  constraint exercises_media_type_allowed
    check (media_type in ('gif', 'image', 'video', 'none')),

  constraint exercises_default_sets_positive
    check (default_sets > 0),

  constraint exercises_default_reps_positive
    check (default_reps > 0),

  constraint exercises_rep_range_valid
    check (rep_range_min > 0 and rep_range_max >= rep_range_min),

  constraint exercises_default_reps_within_range
    check (default_reps between rep_range_min and rep_range_max),

  constraint exercises_increment_lbs_positive
    check (increment_lbs > 0),

  constraint exercises_beginner_starting_weight_non_negative
    check (beginner_starting_weight_lbs is null or beginner_starting_weight_lbs >= 0)
);

create index exercises_name_lower_idx
  on public.exercises (lower(name));

create index exercises_is_active_idx
  on public.exercises (is_active);

create index exercises_category_idx
  on public.exercises (category);

create index exercises_difficulty_idx
  on public.exercises (difficulty);

create index exercises_tracking_type_idx
  on public.exercises (tracking_type);

create index exercises_muscle_groups_gin_idx
  on public.exercises using gin (muscle_groups);

create index exercises_equipment_gin_idx
  on public.exercises using gin (equipment);

alter table public.exercises enable row level security;

drop policy if exists exercises_select_active_or_admin on public.exercises;
drop policy if exists exercises_admin_insert on public.exercises;
drop policy if exists exercises_admin_update on public.exercises;
drop policy if exists exercises_admin_delete on public.exercises;

create policy exercises_select_active_or_admin
on public.exercises
for select
using (
  (auth.uid() is not null and is_active = true)
  or exists (
    select 1
    from public.users_profile
    where users_profile.id = auth.uid()
      and users_profile.is_admin = true
  )
);

create policy exercises_admin_insert
on public.exercises
for insert
with check (
  exists (
    select 1
    from public.users_profile
    where users_profile.id = auth.uid()
      and users_profile.is_admin = true
  )
);

create policy exercises_admin_update
on public.exercises
for update
using (
  exists (
    select 1
    from public.users_profile
    where users_profile.id = auth.uid()
      and users_profile.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users_profile
    where users_profile.id = auth.uid()
      and users_profile.is_admin = true
  )
);

create policy exercises_admin_delete
on public.exercises
for delete
using (
  exists (
    select 1
    from public.users_profile
    where users_profile.id = auth.uid()
      and users_profile.is_admin = true
  )
);

commit;
