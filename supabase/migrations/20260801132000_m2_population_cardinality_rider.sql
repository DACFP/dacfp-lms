-- M2 review rider: enforce the one-row membership population in the view body
-- and carry stable learner identity into quiz rollups.

create or replace view public.v_lms_m2_course_enrollment_population
with (security_invoker = on)
as
select
  enrollment.id as enrollment_id,
  enrollment.auth_user_id,
  lower(enrollment.person_email) as learner_email,
  enrollment.source as enrollment_source,
  enrollment.status as enrollment_status,
  enrollment.enrolled_at,
  enrollment.expires_at,
  course.id as course_id,
  course.slug as course_slug,
  course.title as course_title,
  completion.id as completion_event_id,
  completion.completed_at as course_completed_at,
  completion.trigger as completion_trigger
from public.lms_enrollments enrollment
join public.lms_courses course
  on course.id = enrollment.course_id
left join lateral (
  select event.id, event.completed_at, event.trigger
  from public.lms_completion_events event
  where event.enrollment_id = enrollment.id
  order by event.completed_at desc, event.id desc
  limit 1
) completion on true;

create or replace view public.v_lms_m2_quiz_attempt_population
with (security_invoker = on)
as
select
  attempt.id as attempt_id,
  attempt.enrollment_id,
  membership.course_id,
  membership.course_slug,
  membership.course_title,
  module.id as module_id,
  module.position as module_position,
  module.title as module_title,
  quiz.id as quiz_id,
  attempt.attempt_number,
  attempt.started_at,
  attempt.submitted_at,
  attempt.answers,
  attempt.score,
  attempt.passed,
  membership.auth_user_id
from public.lms_quiz_attempts attempt
join public.v_lms_m2_course_enrollment_population membership
  on membership.enrollment_id = attempt.enrollment_id
join public.lms_module_quizzes quiz
  on quiz.id = attempt.quiz_id
join public.lms_modules module
  on module.id = quiz.module_id
 and module.course_id = membership.course_id
where attempt.submitted_at is not null;

comment on view public.v_lms_m2_course_enrollment_population is
  'M2 canonical course-membership population: exactly one row per enrollment, shared by quiz and survey reporting surfaces.';

comment on view public.v_lms_m2_quiz_attempt_population is
  'M2 submitted-attempt population. Pass rate means passed submitted attempts divided by submitted attempts; unique learners prefer auth user identity and fall back to enrollment; retake volume means submitted attempts numbered above one.';

alter view public.v_lms_m2_course_enrollment_population set (security_invoker = on);
alter view public.v_lms_m2_quiz_attempt_population set (security_invoker = on);

revoke all on table public.v_lms_m2_course_enrollment_population
  from public, anon, authenticated, service_role;
revoke all on table public.v_lms_m2_quiz_attempt_population
  from public, anon, authenticated, service_role;

grant select on table public.v_lms_m2_course_enrollment_population
  to service_role;
grant select on table public.v_lms_m2_quiz_attempt_population
  to service_role;
