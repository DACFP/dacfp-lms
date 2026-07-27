-- F3 production-blocker remediation. SPEC.md v3.2 Hard Rules apply.

-- A1-1: scope LMS auth behavior to explicitly provisioned users and keep
-- the LMS role separate from every other product's app-metadata role.
create or replace function public.lms_mark_signup_provisioned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'lms_provisioned' = 'true' then
    new.raw_app_meta_data := jsonb_set(
      coalesce(new.raw_app_meta_data, '{}'::jsonb),
      '{lms_provisioned}',
      'true'::jsonb,
      true
    );
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
      - 'lms_provisioned';
  end if;
  return new;
end;
$$;

revoke all on function public.lms_mark_signup_provisioned()
  from public, anon, authenticated;

create or replace function public.lms_stamp_learner_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_app_meta_data ->> 'lms_role' is null then
    new.raw_app_meta_data := jsonb_set(
      coalesce(new.raw_app_meta_data, '{}'::jsonb),
      '{lms_role}',
      '"learner"'::jsonb,
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.lms_stamp_learner_role()
  from public, anon, authenticated;

drop trigger if exists lms_auth_user_mark_lms_provisioned on auth.users;
drop trigger if exists lms_auth_user_stamp_learner_role on auth.users;
drop trigger if exists lms_auth_user_create_learner_profile on auth.users;

-- Trigger names are deliberate: PostgreSQL orders same-event triggers by
-- name, so the signup marker is promoted before the role stamp runs.
create trigger lms_auth_user_mark_lms_provisioned
before insert on auth.users
for each row
when (new.raw_user_meta_data ->> 'lms_provisioned' = 'true')
execute function public.lms_mark_signup_provisioned();

create trigger lms_auth_user_stamp_learner_role
before insert on auth.users
for each row
when (new.raw_app_meta_data ->> 'lms_provisioned' = 'true')
execute function public.lms_stamp_learner_role();

create trigger lms_auth_user_create_learner_profile
after insert on auth.users
for each row
when (new.raw_app_meta_data ->> 'lms_provisioned' = 'true')
execute function public.lms_create_learner_profile();

-- Existing sandbox learners and operators predate the marker. Backfill only
-- users already linked to an LMS profile, preserving any non-LMS role claim.
update auth.users user_row
set raw_app_meta_data = jsonb_set(
  jsonb_set(
    coalesce(user_row.raw_app_meta_data, '{}'::jsonb),
    '{lms_provisioned}',
    'true'::jsonb,
    true
  ),
  '{lms_role}',
  to_jsonb(
    case
      when user_row.raw_app_meta_data ->> 'role' = 'operator' then 'operator'
      else 'learner'
    end
  ),
  true
)
where not (coalesce(user_row.raw_app_meta_data, '{}'::jsonb) ? 'lms_role')
  and exists (
    select 1
    from public.lms_learner_profiles profile
    where profile.auth_user_id = user_row.id
  );

create or replace function public.lms_admin_actor_is_operator(
  p_actor_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users user_row
    where user_row.id = p_actor_auth_user_id
      and user_row.raw_app_meta_data ->> 'lms_role' = 'operator'
  );
$$;

revoke all on function public.lms_admin_actor_is_operator(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_actor_is_operator(uuid)
  to service_role;

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
      jsonb_build_object('lms_provisioned', true),
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

-- A1-2: survey submissions are accepted only through lms-submit-survey.
revoke insert on public.lms_survey_responses from authenticated;
drop policy if exists lms_survey_responses_insert_own
  on public.lms_survey_responses;

-- A1-6: bound every learner-writable profile field at the database boundary.
create or replace function public.lms_credential_ids_values_valid(
  p_credential_ids jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  credential_value jsonb;
begin
  for credential_value in
    select item.value from jsonb_each(p_credential_ids) item
  loop
    if jsonb_typeof(credential_value) <> 'string'
      or length(credential_value #>> '{}') > 64
    then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.lms_credential_ids_values_valid(jsonb)
  from public, anon;
grant execute on function public.lms_credential_ids_values_valid(jsonb)
  to authenticated, service_role;

alter table public.lms_learner_profiles
  drop constraint if exists lms_learner_profiles_display_name_length,
  drop constraint if exists lms_learner_profiles_first_name_length,
  drop constraint if exists lms_learner_profiles_middle_name_length,
  drop constraint if exists lms_learner_profiles_last_name_length,
  drop constraint if exists lms_learner_profiles_firm_length,
  drop constraint if exists lms_learner_profiles_job_title_length,
  drop constraint if exists lms_learner_profiles_phone_length,
  drop constraint if exists lms_learner_profiles_firm_url_length,
  drop constraint if exists lms_learner_profiles_address_size,
  drop constraint if exists lms_learner_profiles_credential_ids_size,
  drop constraint if exists lms_learner_profiles_credential_ids_values,
  drop constraint if exists lms_learner_profiles_firm_url_http;

alter table public.lms_learner_profiles
  add constraint lms_learner_profiles_display_name_length
    check (length(display_name) <= 200),
  add constraint lms_learner_profiles_first_name_length
    check (length(first_name) <= 200),
  add constraint lms_learner_profiles_middle_name_length
    check (middle_name is null or length(middle_name) <= 200),
  add constraint lms_learner_profiles_last_name_length
    check (length(last_name) <= 200),
  add constraint lms_learner_profiles_firm_length
    check (length(firm) <= 200),
  add constraint lms_learner_profiles_job_title_length
    check (length(job_title) <= 200),
  add constraint lms_learner_profiles_phone_length
    check (phone is null or length(phone) <= 200),
  add constraint lms_learner_profiles_firm_url_length
    check (firm_url is null or length(firm_url) <= 200),
  add constraint lms_learner_profiles_address_size
    check (address is null or pg_column_size(address) < 4096),
  add constraint lms_learner_profiles_credential_ids_size
    check (pg_column_size(credential_ids) < 1024),
  add constraint lms_learner_profiles_credential_ids_values
    check (public.lms_credential_ids_values_valid(credential_ids)),
  add constraint lms_learner_profiles_firm_url_http
    check (firm_url is null or firm_url ~ '^https?://');

revoke update (updated_at)
  on public.lms_learner_profiles from authenticated;

-- A1-19: keep the final anon privilege state explicit in one ledger entry.
revoke all on table public.lms_learner_profiles from anon;

-- A1-3: one candidate query feeds both preview and frozen run creation.
create or replace function public.lms_ce_report_candidates(
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_include_already_reported boolean
)
returns table (
  completion_id uuid,
  completed_at timestamptz,
  person_email text,
  bucket text,
  excluded_reason text,
  already_reported boolean,
  selected_for_run boolean,
  row_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate_base as (
    select
      completion.id as completion_id,
      completion.completed_at,
      enrollment.person_email,
      course.id as course_id,
      course.cfp_program_id,
      profile.auth_user_id as profile_id,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.credential_ids,
      exists (
        select 1
        from public.lms_ce_report_runs prior_run
        cross join lateral jsonb_array_elements(prior_run.rows) prior_row
        where prior_row ->> 'completion_id' = completion.id::text
      ) as already_reported
    from public.lms_completion_events completion
    join public.lms_enrollments enrollment
      on enrollment.id = completion.enrollment_id
    join public.lms_courses course
      on course.id = enrollment.course_id
    left join public.lms_learner_profiles profile
      on profile.auth_user_id = enrollment.auth_user_id
    where course.id = any (p_course_ids)
      and completion.completed_at >= (
        p_period_start::timestamp at time zone 'America/Phoenix'
      )
      and completion.completed_at < (
        (p_period_end + 1)::timestamp at time zone 'America/Phoenix'
      )
  ), classified as (
    select
      candidate_base.*,
      case
        when profile_id is null then 'no-profile'
        when nullif(btrim(cfp_program_id), '') is null then 'no-program-id'
        when credential_ids ? 'cfp'
          and jsonb_typeof(credential_ids -> 'cfp') <> 'string'
          then 'non-string-cfp'
        when nullif(btrim(first_name), '') is null
          or nullif(btrim(last_name), '') is null
          then 'blank-name'
        else null
      end as excluded_reason,
      case
        when jsonb_typeof(credential_ids -> 'cfp') = 'string'
          then btrim(credential_ids ->> 'cfp')
        else ''
      end as cfp_id
    from candidate_base
  ), bucketed as (
    select
      classified.*,
      case
        when excluded_reason is not null then 'excluded'
        when cfp_id = '' then 'missing_id'
        else 'reportable'
      end as bucket
    from classified
  )
  select
    bucketed.completion_id,
    bucketed.completed_at,
    bucketed.person_email,
    bucketed.bucket,
    bucketed.excluded_reason,
    bucketed.already_reported,
    bucketed.bucket = 'reportable'
      and (p_include_already_reported or not bucketed.already_reported)
      as selected_for_run,
    jsonb_build_object(
      'completion_id', bucketed.completion_id,
      'course_id', bucketed.course_id,
      'person_email', bucketed.person_email,
      'cfp_program_id', coalesce(bucketed.cfp_program_id, ''),
      'date_individual_completed', to_char(
        bucketed.completed_at at time zone 'America/Phoenix',
        'YYYY-MM-DD'
      ),
      'attendee_cfp_board_id', bucketed.cfp_id,
      'attendee_last_name', coalesce(bucketed.last_name, ''),
      'attendee_first_name', coalesce(bucketed.first_name, ''),
      'attendee_middle_name', coalesce(bucketed.middle_name, '')
    ) as row_data
  from bucketed;
$$;

revoke all on function public.lms_ce_report_candidates(
  uuid[], date, date, boolean
) from public, anon, authenticated;
grant execute on function public.lms_ce_report_candidates(
  uuid[], date, date, boolean
) to service_role;

create or replace function public.lms_admin_preview_ce_report(
  p_actor_auth_user_id uuid,
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_include_already_reported boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reportable jsonb;
  v_missing_id jsonb;
  v_already_reported jsonb;
  v_excluded jsonb;
  v_pending_program_courses jsonb;
  v_nudge_count integer;
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
      select 1
      from public.lms_courses course
      where course.id = supplied_course_id
    )
  ) then
    raise exception 'invalid CE report course' using errcode = '22023';
  end if;

  select
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (where candidate.selected_for_run),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (
          where candidate.bucket = 'missing_id'
            and not candidate.already_reported
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (
          where candidate.already_reported
            and candidate.bucket <> 'excluded'
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        candidate.row_data || jsonb_build_object('reason', candidate.excluded_reason)
        order by candidate.completed_at, candidate.person_email
      ) filter (where candidate.bucket = 'excluded'),
      '[]'::jsonb
    )
  into v_reportable, v_missing_id, v_already_reported, v_excluded
  from public.lms_ce_report_candidates(
    p_course_ids,
    p_period_start,
    p_period_end,
    p_include_already_reported
  ) candidate;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', course.id, 'title', course.title)
      order by course.title
    ),
    '[]'::jsonb
  )
  into v_pending_program_courses
  from public.lms_courses course
  where course.id = any (p_course_ids)
    and nullif(btrim(course.cfp_program_id), '') is null;

  select count(*)::integer
  into v_nudge_count
  from public.lms_completion_events completion
  join public.lms_enrollments enrollment
    on enrollment.id = completion.enrollment_id
  join public.lms_courses course
    on course.id = enrollment.course_id
  where course.id = any (p_course_ids)
    and nullif(btrim(course.cfp_program_id), '') is not null
    and completion.completed_at <= now() - interval '10 days'
    and not exists (
      select 1
      from public.lms_ce_report_runs prior_run
      cross join lateral jsonb_array_elements(prior_run.rows) prior_row
      where prior_row ->> 'completion_id' = completion.id::text
    );

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'reportable', v_reportable,
    'missing_id', v_missing_id,
    'already_reported', v_already_reported,
    'excluded', v_excluded,
    'pending_program_courses', v_pending_program_courses,
    'nudge_count', v_nudge_count
  );
end;
$$;

revoke all on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean
) to service_role;

drop function if exists public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, boolean
);

create function public.lms_admin_create_ce_report_run(
  p_actor_auth_user_id uuid,
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_completion_ids uuid[],
  p_include_already_reported boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live_ids uuid[];
  v_preview_ids uuid[];
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
      select 1
      from public.lms_courses course
      where course.id = supplied_course_id
    )
  ) then
    raise exception 'invalid CE report course' using errcode = '22023';
  end if;

  select
    coalesce(
      array_agg(candidate.completion_id order by candidate.completion_id)
        filter (where candidate.selected_for_run),
      '{}'::uuid[]
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (where candidate.selected_for_run),
      '[]'::jsonb
    )
  into v_live_ids, v_rows
  from public.lms_ce_report_candidates(
    p_course_ids,
    p_period_start,
    p_period_end,
    p_include_already_reported
  ) candidate;

  if cardinality(v_live_ids) = 0 then
    raise exception 'no reportable completions' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct supplied_id order by supplied_id), '{}'::uuid[])
  into v_preview_ids
  from unnest(coalesce(p_completion_ids, '{}'::uuid[])) supplied_id;

  if cardinality(v_preview_ids) <> coalesce(cardinality(p_completion_ids), 0)
    or v_preview_ids <> v_live_ids
  then
    raise exception 'CE report candidates changed; run preview again'
      using errcode = '22023';
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
      'completion_ids', to_jsonb(v_preview_ids),
      'row_count', v_run.row_count,
      'include_already_reported', p_include_already_reported
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke all on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean
) to service_role;

-- A1-35: the original R1 slug-matching UPDATE is sandbox-content DML. A
-- promotion must supply its own course-slug/program-ID mapping, then run this
-- assertion before any CE report is previewed or created.
create or replace function public.lms_assert_ce_reportable()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing text;
begin
  select string_agg(course.slug, ', ' order by course.slug)
  into v_missing
  from public.lms_courses course
  where course.status = 'published'
    and coalesce(course.ce_credits, 0) > 0
    and nullif(btrim(course.cfp_program_id), '') is null;

  if v_missing is not null then
    raise exception 'CE-reportable courses missing CFP program IDs: %', v_missing
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.lms_assert_ce_reportable()
  from public, anon, authenticated;
grant execute on function public.lms_assert_ce_reportable()
  to service_role;

comment on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean
) is 'Returns the authoritative CE candidate buckets used by run creation.';
comment on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean
) is 'Freezes only the completion IDs approved in the immediately preceding CE preview.';
comment on function public.lms_assert_ce_reportable() is
  'Promotion assertion: every published CE-bearing course must have a CFP program ID.';
