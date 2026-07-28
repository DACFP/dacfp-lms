-- F5: preserve honest expired-course presentation without weakening content RLS.
--
-- Expired learners retain their own enrollment rows, but the course-content
-- policies intentionally hide lms_courses alongside modules and lessons. This
-- function returns only the minimum course identity needed to label that
-- enrollment. It never returns module, lesson, resource, quiz, or survey data.

create or replace function public.lms_enrollment_course_summaries()
returns table (
  enrollment_id uuid,
  course_id uuid,
  course_slug text,
  course_title text,
  course_status text,
  prerequisite_course_id uuid
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
    c.prerequisite_course_id
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
  'Returns minimal course identity for the caller own expired enrollments; no course content.';
