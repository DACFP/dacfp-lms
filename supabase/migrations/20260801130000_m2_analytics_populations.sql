-- M2: named, service-role-only populations for quiz analytics and survey browsing.
-- These views are read models only. They add no mutation path and preserve the
-- existing RLS posture of every base table.

create view public.v_lms_m2_course_enrollment_population
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

comment on view public.v_lms_m2_course_enrollment_population is
  'M2 canonical course-membership population: exactly one row per enrollment, shared by quiz and survey reporting surfaces.';

create view public.v_lms_m2_quiz_attempt_population
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

comment on view public.v_lms_m2_quiz_attempt_population is
  'M2 submitted-attempt population. Pass rate means passed submitted attempts divided by submitted attempts; unique learners prefer auth user identity and fall back to enrollment; retake volume means submitted attempts numbered above one.';

create view public.v_lms_m2_quiz_question_population
with (security_invoker = on)
as
select
  course.id as course_id,
  course.slug as course_slug,
  course.title as course_title,
  module.id as module_id,
  module.position as module_position,
  module.title as module_title,
  quiz.id as quiz_id,
  question.id as question_id,
  question.position as question_position,
  question.prompt,
  question.choices,
  question.correct as correct_choice_ids,
  attempt.attempt_id,
  attempt.enrollment_id,
  attempt.attempt_number,
  attempt.submitted_at,
  case
    when attempt.attempt_id is null
      or not (attempt.answers ? question.id::text)
    then null::jsonb
    else attempt.answers -> question.id::text
  end as selected_choice_ids,
  case
    when attempt.attempt_id is null
      or not (attempt.answers ? question.id::text)
    then null::boolean
    else
      array(
        select selected.value
        from jsonb_array_elements_text(
          coalesce(attempt.answers -> question.id::text, '[]'::jsonb)
        ) as selected(value)
        order by selected.value
      ) = array(
        select expected.value
        from jsonb_array_elements_text(question.correct) as expected(value)
        order by expected.value
      )
  end as answered_correctly
from public.lms_quiz_questions question
join public.lms_module_quizzes quiz
  on quiz.id = question.quiz_id
join public.lms_modules module
  on module.id = quiz.module_id
join public.lms_courses course
  on course.id = module.course_id
left join public.v_lms_m2_quiz_attempt_population attempt
  on attempt.quiz_id = quiz.id;

comment on view public.v_lms_m2_quiz_question_population is
  'M2 question-response population anchored on every fixed 10-question bank item, including zero-attempt questions. Submitted attempts without a stored key for the current question are unknown and excluded from question rates; an explicitly stored empty selection remains a miss. Correct choices are service-role-only and may appear only in the operator UI.';

create view public.v_lms_m2_survey_response_population
with (security_invoker = on)
as
select
  response.id as response_id,
  response.enrollment_id,
  membership.learner_email,
  membership.course_id,
  membership.course_slug,
  membership.course_title,
  membership.enrollment_status,
  membership.course_completed_at,
  module.id as module_id,
  module.position as module_position,
  lesson.id as survey_id,
  lesson.position as survey_position,
  lesson.title as survey_title,
  response.submitted_at,
  response.answers,
  response.choice_free_text,
  response.path
from public.lms_survey_responses response
join public.v_lms_m2_course_enrollment_population membership
  on membership.enrollment_id = response.enrollment_id
join public.lms_lessons lesson
  on lesson.id = response.lesson_id
 and lesson.kind = 'survey'
join public.lms_modules module
  on module.id = lesson.module_id
 and module.course_id = membership.course_id;

comment on view public.v_lms_m2_survey_response_population is
  'M2 immutable survey-response population. Course membership and completion context come from the shared enrollment population; path preserves presented section order.';

alter view public.v_lms_m2_course_enrollment_population set (security_invoker = on);
alter view public.v_lms_m2_quiz_attempt_population set (security_invoker = on);
alter view public.v_lms_m2_quiz_question_population set (security_invoker = on);
alter view public.v_lms_m2_survey_response_population set (security_invoker = on);

revoke all on table public.v_lms_m2_course_enrollment_population
  from public, anon, authenticated;
revoke all on table public.v_lms_m2_quiz_attempt_population
  from public, anon, authenticated;
revoke all on table public.v_lms_m2_quiz_question_population
  from public, anon, authenticated;
revoke all on table public.v_lms_m2_survey_response_population
  from public, anon, authenticated;

grant select on table public.v_lms_m2_course_enrollment_population
  to service_role;
grant select on table public.v_lms_m2_quiz_attempt_population
  to service_role;
grant select on table public.v_lms_m2_quiz_question_population
  to service_role;
grant select on table public.v_lms_m2_survey_response_population
  to service_role;
