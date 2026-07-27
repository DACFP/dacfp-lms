-- Reapply the established conflict-target repair after F3 replaces
-- lms_grant_enrollment to add the LMS provisioning marker.
do $migration$
declare
  current_definition text;
  repaired_definition text;
begin
  select pg_get_functiondef(proc.oid)
  into current_definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'lms_grant_enrollment'
    and pg_get_function_identity_arguments(proc.oid) =
      'p_email text, p_course_slug text, p_source text, p_expires_at timestamp with time zone, p_order_id uuid';

  repaired_definition := replace(
    current_definition,
    'on conflict (auth_user_id) do nothing',
    'on conflict on constraint lms_learner_profiles_pkey do nothing'
  );

  if current_definition is null or repaired_definition = current_definition then
    raise exception 'Expected F3 lms_grant_enrollment conflict target was not found';
  end if;

  execute repaired_definition;
end;
$migration$;

revoke all on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) from public, anon, authenticated;
grant execute on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) to service_role;
