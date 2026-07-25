alter table public.lms_learner_profiles
  add column first_name text not null default '',
  add column last_name text not null default '',
  add column firm text not null default '',
  add column job_title text not null default '',
  add column phone text,
  add column firm_url text,
  add column address jsonb,
  add constraint lms_learner_profiles_address_object
    check (address is null or jsonb_typeof(address) = 'object');

with normalized as (
  select
    auth_user_id,
    regexp_replace(btrim(display_name), '\s+', ' ', 'g') as full_name
  from public.lms_learner_profiles
), split_names as (
  select
    auth_user_id,
    coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Learner') as first_name,
    case
      when strpos(full_name, ' ') > 0 then btrim(substr(full_name, strpos(full_name, ' ') + 1))
      else ''
    end as last_name
  from normalized
)
update public.lms_learner_profiles profile
set first_name = split_names.first_name,
    last_name = split_names.last_name
from split_names
where profile.auth_user_id = split_names.auth_user_id;

grant update (
  display_name,
  first_name,
  last_name,
  firm,
  job_title,
  phone,
  firm_url,
  address,
  credential_ids,
  updated_at
) on table public.lms_learner_profiles to authenticated;

create or replace function public.lms_create_learner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(split_part(btrim(new.raw_user_meta_data ->> 'display_name'), ' ', 1), ''),
    nullif(split_part(lower(new.email), '@', 1), ''),
    'Learner'
  );
  v_last_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    ''
  );
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(concat_ws(' ', v_first_name, v_last_name)), ''),
    'Learner'
  );

  insert into public.lms_learner_profiles (
    auth_user_id,
    display_name,
    first_name,
    last_name,
    firm,
    job_title
  )
  values (
    new.id,
    v_display_name,
    v_first_name,
    v_last_name,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'firm'), ''), ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'job_title'), ''), '')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.lms_create_learner_profile()
  from public, anon, authenticated;

create or replace function public.lms_record_video_heartbeat(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_position_seconds integer
)
returns public.lms_lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_duration_seconds integer;
  v_progression text;
  v_existing public.lms_lesson_progress%rowtype;
  v_result public.lms_lesson_progress%rowtype;
  v_position_seconds integer;
  v_next_max integer;
  v_growth numeric;
  v_elapsed_seconds numeric;
  v_allowed_growth numeric;
begin
  if p_position_seconds is null or p_position_seconds < 0 then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  select lesson.kind, lesson.duration_seconds, course.progression
  into v_kind, v_duration_seconds, v_progression
  from public.lms_lessons lesson
  join public.lms_modules module on module.id = lesson.module_id
  join public.lms_courses course on course.id = module.course_id
  join public.lms_enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.course_id = course.id
  where lesson.id = p_lesson_id;

  if not found
    or v_kind <> 'video'
    or v_duration_seconds is null
    or v_duration_seconds <= 0
  then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  v_position_seconds := least(p_position_seconds, v_duration_seconds);

  select progress.*
  into v_existing
  from public.lms_lesson_progress progress
  where progress.enrollment_id = p_enrollment_id
    and progress.lesson_id = p_lesson_id
  for update;

  if not found then
    if v_progression = 'sequential' and v_position_seconds > 2 then
      raise exception 'progress_update_rejected' using errcode = '22023';
    end if;

    insert into public.lms_lesson_progress (
      enrollment_id,
      lesson_id,
      started_at,
      completed_at,
      last_position_seconds,
      max_watched_seconds,
      max_watched_updated_at,
      updated_at
    )
    values (
      p_enrollment_id,
      p_lesson_id,
      v_now,
      case
        when v_position_seconds::numeric >= v_duration_seconds::numeric * 0.95
          then v_now
        else null
      end,
      v_position_seconds,
      v_position_seconds,
      v_now,
      v_now
    )
    returning * into v_result;

    return v_result;
  end if;

  -- A completed lesson is in review mode. Its playhead may move freely, but
  -- its already-earned maximum remains historical completion evidence.
  v_next_max := case
    when v_existing.completed_at is not null then v_existing.max_watched_seconds
    else greatest(v_existing.max_watched_seconds, v_position_seconds)
  end;
  v_growth := v_next_max - v_existing.max_watched_seconds;
  v_elapsed_seconds := greatest(
    0,
    extract(epoch from (
      v_now - coalesce(
        v_existing.max_watched_updated_at,
        v_existing.started_at,
        v_existing.updated_at
      )
    ))
  );
  v_allowed_growth := greatest(2, (v_elapsed_seconds * 1.5) + 1);

  if v_progression = 'sequential'
    and v_existing.completed_at is null
    and v_growth > v_allowed_growth
  then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  update public.lms_lesson_progress progress
  set started_at = coalesce(progress.started_at, v_now),
      completed_at = coalesce(
        progress.completed_at,
        case
          when v_next_max::numeric >= v_duration_seconds::numeric * 0.95
            then v_now
          else null
        end
      ),
      last_position_seconds = v_position_seconds,
      max_watched_seconds = v_next_max,
      max_watched_updated_at = case
        when v_next_max > progress.max_watched_seconds then v_now
        else progress.max_watched_updated_at
      end,
      updated_at = v_now
  where progress.id = v_existing.id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.lms_record_video_heartbeat(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.lms_record_video_heartbeat(uuid, uuid, integer)
  to service_role;

comment on column public.lms_learner_profiles.address is
  'Optional learner mailing address object: line1, line2, city, state, postal, country.';
comment on function public.lms_record_video_heartbeat(uuid, uuid, integer) is
  'Records plausible first-pass video progress; completed lessons accept free review seeks without changing earned max-watch evidence.';
