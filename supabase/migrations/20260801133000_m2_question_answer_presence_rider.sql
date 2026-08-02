-- M2 review rider: a submitted attempt without the current question key is
-- unknown, not a miss. Explicitly stored empty selections remain misses.

create or replace view public.v_lms_m2_quiz_question_population
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
        from jsonb_array_elements_text(attempt.answers -> question.id::text) as selected(value)
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

alter view public.v_lms_m2_quiz_question_population set (security_invoker = on);
revoke all on table public.v_lms_m2_quiz_question_population
  from public, anon, authenticated, service_role;
grant select on table public.v_lms_m2_quiz_question_population
  to service_role;
