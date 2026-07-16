create table public.lms_learner_profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  credential_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_learner_profiles_credential_ids_object
    check (jsonb_typeof(credential_ids) = 'object')
);

comment on table public.lms_learner_profiles is
  'Learner-owned LMS profile created automatically from auth.users.';

alter table public.lms_learner_profiles enable row level security;
alter table public.lms_learner_profiles force row level security;

revoke all on table public.lms_learner_profiles from anon, authenticated;
grant select on table public.lms_learner_profiles to anon, authenticated;
grant update (display_name, credential_ids, updated_at)
  on table public.lms_learner_profiles to authenticated;

create policy lms_learner_profiles_select_own
on public.lms_learner_profiles
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create policy lms_learner_profiles_update_own
on public.lms_learner_profiles
for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

create function public.lms_stamp_learner_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_app_meta_data := jsonb_set(
    coalesce(new.raw_app_meta_data, '{}'::jsonb),
    '{role}',
    '"learner"'::jsonb,
    true
  );
  return new;
end;
$$;

revoke all on function public.lms_stamp_learner_role() from public;

create trigger lms_auth_user_stamp_learner_role
before insert on auth.users
for each row execute function public.lms_stamp_learner_role();

create function public.lms_create_learner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lms_learner_profiles (
    auth_user_id,
    display_name
  )
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(lower(new.email), '@', 1), ''),
      'Learner'
    )
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.lms_create_learner_profile() from public;

create trigger lms_auth_user_create_learner_profile
after insert on auth.users
for each row execute function public.lms_create_learner_profile();

create function public.lms_set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.lms_set_profile_updated_at() from public;

create trigger lms_learner_profiles_set_updated_at
before update on public.lms_learner_profiles
for each row execute function public.lms_set_profile_updated_at();
