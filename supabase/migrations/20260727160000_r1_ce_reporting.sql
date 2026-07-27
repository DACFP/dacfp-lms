alter table public.lms_courses
  add column cfp_program_id text;

alter table public.lms_learner_profiles
  add column middle_name text;

grant update (
  display_name,
  first_name,
  middle_name,
  last_name,
  firm,
  job_title,
  phone,
  firm_url,
  address,
  credential_ids,
  updated_at
) on table public.lms_learner_profiles to authenticated;

create table public.lms_ce_report_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_auth_user_id uuid not null references auth.users (id),
  course_ids uuid[] not null,
  period_start date not null,
  period_end date not null,
  row_count integer not null check (row_count >= 0),
  rows jsonb not null,
  filename text not null check (btrim(filename) <> ''),
  constraint lms_ce_report_runs_courses_present
    check (cardinality(course_ids) > 0),
  constraint lms_ce_report_runs_period_order
    check (period_end >= period_start),
  constraint lms_ce_report_runs_rows_array
    check (jsonb_typeof(rows) = 'array'),
  constraint lms_ce_report_runs_row_count_matches
    check (row_count = jsonb_array_length(rows))
);

alter table public.lms_ce_report_runs enable row level security;
alter table public.lms_ce_report_runs force row level security;

revoke all on table public.lms_ce_report_runs
  from public, anon, authenticated;
grant all on table public.lms_ce_report_runs to service_role;

create index lms_ce_report_runs_created_at_idx
  on public.lms_ce_report_runs (created_at desc);
create index lms_ce_report_runs_course_ids_idx
  on public.lms_ce_report_runs using gin (course_ids);

-- The dark-build FPT stands in for the registered Financial Professional
-- Track. Each bonus program is a separate course record even though learner
-- copy calls it a module. Renewal deliberately remains null until supplied.
with program_ids(slug, cfp_program_id) as (
  values
    ('fpt-sandbox', '312442'),
    ('financial-professional-track', '312442'),
    ('custody-security-sandbox', '332761'),
    ('custody-security', '332761'),
    ('spot-ethereum-etfs-sandbox', '328447'),
    ('spot-ethereum-etfs', '328447'),
    ('nfts-sandbox', '321877'),
    ('nfts', '321877'),
    ('defi-daos-sandbox', '321876'),
    ('defi-daos', '321876'),
    ('staking-lending-borrowing-sandbox', '321875'),
    ('staking-lending-borrowing', '321875'),
    ('genius-act-sandbox', '339638'),
    ('genius-act', '339638')
)
update public.lms_courses course
set cfp_program_id = program_ids.cfp_program_id
from program_ids
where course.slug = program_ids.slug;

-- Preserve the prior synthetic container and its completion history, but keep
-- it out of learner and reporting surfaces. R1 models each registered bonus
-- program as its own one-module course.
update public.lms_courses
set status = 'archived'
where slug = 'bonus-sandbox';

insert into public.lms_courses (
  id,
  slug,
  title,
  description,
  status,
  progression,
  prerequisite_course_id,
  ce_credits,
  cfp_program_id,
  requires_terms_acceptance
)
select
  md5('bonus-course:' || bonus.slug)::uuid,
  bonus.slug,
  bonus.title,
  'Open bonus learning unlocked after FPT completion.',
  'published',
  'open',
  flagship.id,
  1,
  bonus.cfp_program_id,
  false
from (
  values
    ('custody-security-sandbox', 'Crypto Custody and Security', '332761'),
    ('spot-ethereum-etfs-sandbox', 'Spot Ethereum ETFs', '328447'),
    ('nfts-sandbox', 'NFTs', '321877'),
    ('defi-daos-sandbox', 'DeFi and DAOs', '321876'),
    ('staking-lending-borrowing-sandbox', 'Staking, Lending and Borrowing', '321875'),
    ('genius-act-sandbox', 'GENIUS Act', '339638')
) bonus(slug, title, cfp_program_id)
join public.lms_courses flagship on flagship.slug = 'fpt-sandbox'
on conflict (id) do update
set slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    progression = excluded.progression,
    prerequisite_course_id = excluded.prerequisite_course_id,
    ce_credits = excluded.ce_credits,
    cfp_program_id = excluded.cfp_program_id,
    requires_terms_acceptance = excluded.requires_terms_acceptance;

insert into public.lms_modules (
  id,
  course_id,
  position,
  title,
  ce_credits,
  bridge_copy
)
select
  md5(course.slug || ':module:1')::uuid,
  course.id,
  1,
  course.title,
  1,
  'Apply ' || course.title || ' concepts in an advisory context.'
from public.lms_courses course
join public.lms_courses flagship
  on flagship.id = course.prerequisite_course_id
 and flagship.slug = 'fpt-sandbox'
where course.status = 'published'
on conflict (id) do update
set course_id = excluded.course_id,
    position = excluded.position,
    title = excluded.title,
    ce_credits = excluded.ce_credits,
    bridge_copy = excluded.bridge_copy;

insert into public.lms_lessons (
  id,
  module_id,
  position,
  title,
  kind,
  video_ref,
  duration_seconds,
  body_md,
  is_required
)
select
  md5(course.slug || ':lesson:1:1')::uuid,
  module.id,
  1,
  course.title || ': Briefing',
  'reading',
  null,
  null,
  'Synthetic bonus-course reading content.',
  true
from public.lms_courses course
join public.lms_courses flagship
  on flagship.id = course.prerequisite_course_id
 and flagship.slug = 'fpt-sandbox'
join public.lms_modules module
  on module.course_id = course.id
 and module.position = 1
where course.status = 'published'
on conflict (id) do update
set module_id = excluded.module_id,
    position = excluded.position,
    title = excluded.title,
    kind = excluded.kind,
    video_ref = excluded.video_ref,
    duration_seconds = excluded.duration_seconds,
    body_md = excluded.body_md,
    is_required = excluded.is_required;

insert into public.lms_enrollments (
  person_email,
  auth_user_id,
  course_id,
  source,
  enrolled_at,
  expires_at,
  status,
  terms_accepted_at,
  order_id
)
select
  flagship_enrollment.person_email,
  flagship_enrollment.auth_user_id,
  bonus.id,
  flagship_enrollment.source,
  flagship_enrollment.enrolled_at,
  flagship_enrollment.expires_at,
  flagship_enrollment.status,
  flagship_enrollment.terms_accepted_at,
  flagship_enrollment.order_id
from public.lms_enrollments flagship_enrollment
join public.lms_courses flagship
  on flagship.id = flagship_enrollment.course_id
 and flagship.slug = 'fpt-sandbox'
join public.lms_courses bonus
  on bonus.prerequisite_course_id = flagship.id
 and bonus.status = 'published'
on conflict (person_email, course_id) do update
set auth_user_id = excluded.auth_user_id,
    source = excluded.source,
    expires_at = excluded.expires_at,
    status = excluded.status,
    order_id = coalesce(excluded.order_id, public.lms_enrollments.order_id);

create or replace function public.lms_grant_enrollment(
  p_email text,
  p_course_slug text,
  p_source text,
  p_expires_at timestamptz,
  p_order_id uuid
)
returns table (
  auth_user_id uuid,
  primary_enrollment_id uuid,
  bonus_enrollment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
  v_course public.lms_courses%rowtype;
  v_bonus_course record;
  v_primary_enrollment_id uuid;
  v_bonus_enrollment_id uuid;
begin
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid email is required';
  end if;

  if p_source not in (
    'fpt_purchase',
    'renewal',
    'enterprise_seat',
    'manual',
    'absorb_migrated',
    'synthetic'
  ) then
    raise exception 'Invalid enrollment source';
  end if;

  select *
  into v_course
  from public.lms_courses
  where slug = p_course_slug;

  if not found then
    raise exception 'Unknown course slug';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email) = v_email
  order by created_at
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      null,
      null,
      '',
      '',
      '',
      '',
      '{}'::jsonb,
      jsonb_build_object('display_name', split_part(v_email, '@', 1)),
      false,
      now(),
      now()
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', false
      ),
      'email',
      null,
      now(),
      now()
    )
    on conflict (provider_id, provider) do nothing;
  end if;

  insert into public.lms_learner_profiles (auth_user_id, display_name)
  values (v_user_id, split_part(v_email, '@', 1))
  on conflict (auth_user_id) do nothing;

  insert into public.lms_enrollments (
    person_email,
    auth_user_id,
    course_id,
    source,
    enrolled_at,
    expires_at,
    status,
    terms_accepted_at,
    order_id
  ) values (
    v_email,
    v_user_id,
    v_course.id,
    p_source,
    now(),
    p_expires_at,
    'active',
    null,
    p_order_id
  )
  on conflict (person_email, course_id) do update
  set auth_user_id = excluded.auth_user_id,
      source = excluded.source,
      expires_at = excluded.expires_at,
      status = 'active',
      order_id = coalesce(excluded.order_id, public.lms_enrollments.order_id)
  returning id into v_primary_enrollment_id;

  if v_course.slug = 'fpt-sandbox' then
    for v_bonus_course in
      select id
      from public.lms_courses
      where prerequisite_course_id = v_course.id
        and status = 'published'
      order by slug
    loop
      insert into public.lms_enrollments (
        person_email,
        auth_user_id,
        course_id,
        source,
        enrolled_at,
        expires_at,
        status,
        terms_accepted_at,
        order_id
      ) values (
        v_email,
        v_user_id,
        v_bonus_course.id,
        p_source,
        now(),
        p_expires_at,
        'active',
        null,
        p_order_id
      )
      on conflict (person_email, course_id) do update
      set auth_user_id = excluded.auth_user_id,
          source = excluded.source,
          expires_at = excluded.expires_at,
          status = 'active',
          order_id = coalesce(excluded.order_id, public.lms_enrollments.order_id)
      returning id into v_bonus_enrollment_id;
    end loop;

    if v_bonus_enrollment_id is null then
      raise exception 'FPT bonus courses are not configured';
    end if;
  end if;

  return query
  select v_user_id, v_primary_enrollment_id, v_bonus_enrollment_id;
end;
$$;

revoke all on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) from public, anon, authenticated;
grant execute on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) to service_role;

create function public.lms_admin_create_ce_report_run(
  p_actor_auth_user_id uuid,
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_include_already_reported boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_filename text;
  v_run public.lms_ce_report_runs%rowtype;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_course_ids), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
  then
    raise exception 'invalid CE report scope' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_course_ids) supplied_course_id
    where not exists (
      select 1 from public.lms_courses course
      where course.id = supplied_course_id
    )
  ) then
    raise exception 'invalid CE report course' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email), '[]'::jsonb)
  into v_rows
  from (
    select
      completion.completed_at,
      enrollment.person_email,
      jsonb_build_object(
        'completion_id', completion.id,
        'course_id', course.id,
        'person_email', enrollment.person_email,
        'cfp_program_id', course.cfp_program_id,
        'date_individual_completed', to_char(
          completion.completed_at at time zone 'America/Phoenix',
          'YYYY-MM-DD'
        ),
        'attendee_cfp_board_id', btrim(profile.credential_ids ->> 'cfp'),
        'attendee_last_name', profile.last_name,
        'attendee_first_name', profile.first_name,
        'attendee_middle_name', coalesce(profile.middle_name, '')
      ) as row_data
    from public.lms_completion_events completion
    join public.lms_enrollments enrollment
      on enrollment.id = completion.enrollment_id
    join public.lms_courses course
      on course.id = enrollment.course_id
    join public.lms_learner_profiles profile
      on profile.auth_user_id = enrollment.auth_user_id
    where course.id = any (p_course_ids)
      and completion.completed_at >= (
        p_period_start::timestamp at time zone 'America/Phoenix'
      )
      and completion.completed_at < (
        (p_period_end + 1)::timestamp at time zone 'America/Phoenix'
      )
      and nullif(btrim(course.cfp_program_id), '') is not null
      and nullif(btrim(profile.credential_ids ->> 'cfp'), '') is not null
      and (
        p_include_already_reported
        or not exists (
          select 1
          from public.lms_ce_report_runs prior_run
          cross join lateral jsonb_array_elements(prior_run.rows) prior_row
          where prior_row ->> 'completion_id' = completion.id::text
        )
      )
  ) candidate;

  if jsonb_array_length(v_rows) = 0 then
    raise exception 'no reportable completions' using errcode = '22023';
  end if;

  v_filename := format(
    'cfp-ce-%s-through-%s.xlsx',
    to_char(p_period_start, 'YYYY-MM-DD'),
    to_char(p_period_end, 'YYYY-MM-DD')
  );

  insert into public.lms_ce_report_runs (
    actor_auth_user_id,
    course_ids,
    period_start,
    period_end,
    row_count,
    rows,
    filename
  ) values (
    p_actor_auth_user_id,
    p_course_ids,
    p_period_start,
    p_period_end,
    jsonb_array_length(v_rows),
    v_rows,
    v_filename
  )
  returning * into v_run;

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    'export_cfp_ce_report',
    jsonb_build_object(
      'run_id', v_run.id,
      'course_ids', to_jsonb(p_course_ids),
      'period_start', p_period_start,
      'period_end', p_period_end,
      'row_count', v_run.row_count,
      'include_already_reported', p_include_already_reported
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke all on function public.lms_admin_create_ce_report_run(
  uuid,
  uuid[],
  date,
  date,
  boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_create_ce_report_run(
  uuid,
  uuid[],
  date,
  date,
  boolean
) to service_role;

create function public.lms_ce_reporting_status()
returns table (
  course_id uuid,
  completion_id uuid,
  completed_at timestamptz,
  reported_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    enrollment.course_id,
    completion.id,
    completion.completed_at,
    (
      select min(report_run.created_at)
      from public.lms_ce_report_runs report_run
      cross join lateral jsonb_array_elements(report_run.rows) report_row
      where report_row ->> 'completion_id' = completion.id::text
    ) as reported_at
  from public.lms_completion_events completion
  join public.lms_enrollments enrollment
    on enrollment.id = completion.enrollment_id
  where enrollment.auth_user_id = (select auth.uid())
  order by completion.completed_at;
$$;

revoke all on function public.lms_ce_reporting_status()
  from public, anon;
grant execute on function public.lms_ce_reporting_status()
  to authenticated, service_role;

comment on column public.lms_courses.cfp_program_id is
  'CFP Board Program ID for this separately registered CE course; nullable while pending.';
comment on column public.lms_learner_profiles.middle_name is
  'Optional learner middle name used in CFP Board CE exports.';
comment on table public.lms_ce_report_runs is
  'Immutable CFP Board export runs whose frozen rows are the retention and reported-state record.';
comment on function public.lms_admin_create_ce_report_run(uuid, uuid[], date, date, boolean) is
  'Creates a frozen CFP CE run and its operator audit action in one transaction.';
comment on function public.lms_ce_reporting_status() is
  'Returns only the signed-in learner completion reporting dates without granting report-run table access.';
