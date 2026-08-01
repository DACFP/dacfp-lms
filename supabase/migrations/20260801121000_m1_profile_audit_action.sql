-- M1 rider: the profile upsert RPC serves both §4 create-learner and
-- §4 edit-profile. The audit action name must say which one happened, so
-- the caller passes it; anything else is rejected.
create or replace function public.lms_admin_upsert_learner_profile(
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_cfp_id text,
  p_audit_action text default 'update_learner_profile'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.lms_learner_profiles%rowtype;
  v_new public.lms_learner_profiles%rowtype;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_middle text := nullif(btrim(coalesce(p_middle_name, '')), '');
  v_cfp text := nullif(btrim(coalesce(p_cfp_id, '')), '');
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_audit_action not in ('create_learner', 'update_learner_profile') then
    raise exception 'invalid audit action' using errcode = '22023';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'first and last name are required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'learner unavailable' using errcode = '22023';
  end if;

  select * into v_old
  from public.lms_learner_profiles
  where auth_user_id = p_auth_user_id;

  insert into public.lms_learner_profiles (
    auth_user_id, display_name, first_name, middle_name, last_name,
    credential_ids
  ) values (
    p_auth_user_id,
    v_first || ' ' || v_last,
    v_first,
    v_middle,
    v_last,
    case when v_cfp is null then '{}'::jsonb
         else jsonb_build_object('cfp', v_cfp) end
  )
  on conflict (auth_user_id) do update
  set first_name = excluded.first_name,
      middle_name = excluded.middle_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      credential_ids = case
        when v_cfp is null
          then public.lms_learner_profiles.credential_ids - 'cfp'
        else public.lms_learner_profiles.credential_ids
          || jsonb_build_object('cfp', v_cfp)
      end,
      updated_at = now()
  returning * into v_new;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    p_audit_action,
    jsonb_build_object(
      'auth_user_id', p_auth_user_id,
      'email', (select lower(email) from auth.users where id = p_auth_user_id),
      'old', case when v_old.auth_user_id is null then null else jsonb_build_object(
        'first_name', v_old.first_name,
        'middle_name', v_old.middle_name,
        'last_name', v_old.last_name,
        'cfp_id', v_old.credential_ids ->> 'cfp'
      ) end,
      'new', jsonb_build_object(
        'first_name', v_new.first_name,
        'middle_name', v_new.middle_name,
        'last_name', v_new.last_name,
        'cfp_id', v_new.credential_ids ->> 'cfp'
      )
    )
  );

  return jsonb_build_object(
    'auth_user_id', v_new.auth_user_id,
    'first_name', v_new.first_name,
    'middle_name', v_new.middle_name,
    'last_name', v_new.last_name,
    'cfp_id', v_new.credential_ids ->> 'cfp'
  );
end;
$$;

-- The 6-argument signature from the base M1 migration is superseded.
drop function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text
);

revoke all on function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text, text
) to service_role;
