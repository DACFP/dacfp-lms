-- F6: close the routed-survey UUID mismatch, preserve opaque expired-route
-- identity, and refuse course deletion whenever an enrollment exists.

-- Early sandbox survey fixtures stored deterministic md5 UUIDs without
-- hyphens. Canonical UUID text keeps the browser and submit function on the
-- same section identity without changing any answer or route choice.
update public.lms_survey_questions question
set routes = coalesce(
  (
    select jsonb_object_agg(
      route.key,
      to_jsonb((route.value #>> '{}')::uuid::text)
    )
    from jsonb_each(question.routes) route
  ),
  '{}'::jsonb
)
where question.routes is not null;

-- PostgreSQL cannot change a table-returning function signature with replace.
drop function public.lms_enrollment_course_summaries();

create function public.lms_enrollment_course_summaries()
returns table (
  enrollment_id uuid,
  course_id uuid,
  course_slug text,
  course_title text,
  course_status text,
  prerequisite_course_id uuid,
  module_positions integer[],
  lesson_ids uuid[],
  quiz_module_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id as enrollment_id,
    c.id as course_id,
    c.slug as course_slug,
    c.title as course_title,
    c.status::text as course_status,
    c.prerequisite_course_id,
    coalesce(
      array(
        select m.position
        from public.lms_modules m
        where m.course_id = c.id
        order by m.position
      ),
      array[]::integer[]
    ) as module_positions,
    coalesce(
      array(
        select l.id
        from public.lms_lessons l
        join public.lms_modules m on m.id = l.module_id
        where m.course_id = c.id
        order by m.position, l.position
      ),
      array[]::uuid[]
    ) as lesson_ids,
    coalesce(
      array(
        select q.module_id
        from public.lms_module_quizzes q
        join public.lms_modules m on m.id = q.module_id
        where m.course_id = c.id
        order by m.position
      ),
      array[]::uuid[]
    ) as quiz_module_ids
  from public.lms_enrollments e
  join public.lms_courses c on c.id = e.course_id
  where e.auth_user_id = auth.uid()
    and (
      e.status = 'expired'
      or (e.expires_at is not null and e.expires_at <= now())
    );
$$;

revoke all on function public.lms_enrollment_course_summaries()
  from public, anon;
grant execute on function public.lms_enrollment_course_summaries()
  to authenticated, service_role;

comment on function public.lms_enrollment_course_summaries() is
  'Returns minimal course and opaque route identity for the caller own expired enrollments; no course content.';

create function public.lms_refuse_enrolled_course_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.lms_enrollments enrollment
    where enrollment.course_id = old.id
  ) then
    raise exception 'Course has enrollments and cannot be deleted. Contact support before retiring it.'
      using errcode = '22023';
  end if;

  return old;
end;
$$;

revoke all on function public.lms_refuse_enrolled_course_delete()
  from public, anon, authenticated;

create trigger lms_courses_refuse_enrolled_delete
before delete on public.lms_courses
for each row execute function public.lms_refuse_enrolled_course_delete();

comment on function public.lms_refuse_enrolled_course_delete() is
  'Refuses deletion of any course with an enrollment; child content otherwise follows declared cascade paths.';
