revoke all on function public.lms_stamp_learner_role()
  from public, anon, authenticated;
revoke all on function public.lms_create_learner_profile()
  from public, anon, authenticated;
revoke all on function public.lms_set_profile_updated_at()
  from public, anon, authenticated;

create schema if not exists lms_private;
revoke all on schema lms_private from public, anon;
grant usage on schema lms_private to authenticated, service_role;

alter function public.lms_has_course_access(uuid, boolean, boolean)
  set schema lms_private;

revoke all on function lms_private.lms_has_course_access(
  uuid,
  boolean,
  boolean
) from public, anon;
grant execute on function lms_private.lms_has_course_access(
  uuid,
  boolean,
  boolean
) to authenticated, service_role;
