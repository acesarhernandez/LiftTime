begin;

create table if not exists public.auth_identity_map (
  issuer text not null,
  subject text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),

  constraint auth_identity_map_pk primary key (issuer, subject),
  constraint auth_identity_map_auth_user_id_unique unique (auth_user_id),
  constraint auth_identity_map_issuer_not_blank
    check (length(btrim(issuer)) > 0),
  constraint auth_identity_map_subject_not_blank
    check (length(btrim(subject)) > 0)
);

alter table public.auth_identity_map enable row level security;

revoke all on table public.auth_identity_map from public;
revoke all on table public.auth_identity_map from anon;
revoke all on table public.auth_identity_map from authenticated;

grant select, insert, update, delete on table public.auth_identity_map to service_role;

commit;
