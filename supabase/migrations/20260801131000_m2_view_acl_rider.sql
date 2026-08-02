-- Supabase default privileges grant service_role broad relation privileges.
-- M2 populations are read-only, so narrow every new view to SELECT explicitly.

revoke all on table public.v_lms_m2_course_enrollment_population
  from service_role;
revoke all on table public.v_lms_m2_quiz_attempt_population
  from service_role;
revoke all on table public.v_lms_m2_quiz_question_population
  from service_role;
revoke all on table public.v_lms_m2_survey_response_population
  from service_role;

grant select on table public.v_lms_m2_course_enrollment_population
  to service_role;
grant select on table public.v_lms_m2_quiz_attempt_population
  to service_role;
grant select on table public.v_lms_m2_quiz_question_population
  to service_role;
grant select on table public.v_lms_m2_survey_response_population
  to service_role;
