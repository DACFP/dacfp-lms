revoke insert, update on table public.lms_quiz_attempts from authenticated;

drop policy if exists lms_quiz_attempts_insert_own
  on public.lms_quiz_attempts;
drop policy if exists lms_quiz_attempts_update_own
  on public.lms_quiz_attempts;
