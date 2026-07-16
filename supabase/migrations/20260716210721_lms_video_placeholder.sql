insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lms-video',
  'lms-video',
  false,
  5242880,
  array['video/mp4']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

update public.lms_lessons
set video_ref = 'placeholder/dacfp-lms-placeholder.mp4',
    duration_seconds = 4
where kind = 'video';

revoke insert, update on table public.lms_lesson_progress from authenticated;

drop policy if exists lms_lesson_progress_insert_own
  on public.lms_lesson_progress;
drop policy if exists lms_lesson_progress_update_own
  on public.lms_lesson_progress;

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
      v_now
    )
    returning * into v_result;

    return v_result;
  end if;

  v_next_max := greatest(v_existing.max_watched_seconds, v_position_seconds);
  v_growth := v_next_max - v_existing.max_watched_seconds;
  v_elapsed_seconds := greatest(
    0,
    extract(epoch from (v_now - v_existing.updated_at))
  );
  v_allowed_growth := greatest(2, (v_elapsed_seconds * 1.5) + 1);

  if v_progression = 'sequential' and v_growth > v_allowed_growth then
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
      max_watched_seconds = greatest(
        progress.max_watched_seconds,
        v_position_seconds
      ),
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

create or replace function public.lms_complete_reading(
  p_enrollment_id uuid,
  p_lesson_id uuid
)
returns public.lms_lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_result public.lms_lesson_progress%rowtype;
begin
  select lesson.kind
  into v_kind
  from public.lms_lessons lesson
  join public.lms_modules module on module.id = lesson.module_id
  join public.lms_enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.course_id = module.course_id
  where lesson.id = p_lesson_id;

  if not found or v_kind <> 'reading' then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  insert into public.lms_lesson_progress (
    enrollment_id,
    lesson_id,
    started_at,
    completed_at,
    last_position_seconds,
    max_watched_seconds,
    updated_at
  )
  values (
    p_enrollment_id,
    p_lesson_id,
    v_now,
    v_now,
    0,
    0,
    v_now
  )
  on conflict (enrollment_id, lesson_id) do update
  set started_at = coalesce(public.lms_lesson_progress.started_at, v_now),
      completed_at = coalesce(public.lms_lesson_progress.completed_at, v_now),
      updated_at = v_now
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.lms_complete_reading(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_complete_reading(uuid, uuid)
  to service_role;

comment on function public.lms_record_video_heartbeat(uuid, uuid, integer) is
  'Service-role-only atomic video heartbeat writer used by lms-progress.';
comment on function public.lms_complete_reading(uuid, uuid) is
  'Service-role-only reading completion writer used by lms-progress.';
