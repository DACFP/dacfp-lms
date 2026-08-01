-- M1 pre-gate review fixes (fresh-context reviewer findings A4, A5, C7).

-- A4: profile edits must not clobber a learner-customized display name.
-- The derived "First Last" value is written only on insert, or when the
-- stored display_name is empty or was itself the previously derived value.
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
      display_name = case
        when public.lms_learner_profiles.display_name = ''
          or public.lms_learner_profiles.display_name =
            btrim(public.lms_learner_profiles.first_name || ' '
              || public.lms_learner_profiles.last_name)
          then excluded.display_name
        else public.lms_learner_profiles.display_name
      end,
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

revoke all on function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text, text
) to service_role;

-- A5: the learner-file audit slice must be an exact-target population, not a
-- substring match. p_target_exact = true matches the email exactly across the
-- same target keys; the §8 search box keeps substring semantics.
create or replace function public.lms_admin_search_audit(
  p_actor_auth_user_id uuid,
  p_actor_email text default null,
  p_action text default null,
  p_target_email text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_target_exact boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_target text := nullif(btrim(coalesce(p_target_email, '')), '');
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  create temp table if not exists m1_audit_rows (
    row_data jsonb,
    created_at timestamptz
  ) on commit drop;
  truncate m1_audit_rows;

  insert into m1_audit_rows
  select
    jsonb_build_object(
      'id', a.id,
      'created_at', a.created_at,
      'action', a.action,
      'actor_auth_user_id', a.actor_auth_user_id,
      'actor_email', lower(au.email),
      'target', a.target
    ),
    a.created_at
  from public.lms_admin_actions a
  join auth.users au on au.id = a.actor_auth_user_id
  where
    (p_actor_email is null or btrim(p_actor_email) = ''
      or au.email ilike '%' || btrim(p_actor_email) || '%')
    and (p_action is null or btrim(p_action) = ''
      or a.action = btrim(p_action))
    and (v_target is null
      or (p_target_exact and (
        lower(a.target ->> 'email') = lower(v_target)
        or lower(a.target ->> 'person_email') = lower(v_target)
        or exists (
          select 1 from public.lms_enrollments e
          where e.id::text = a.target ->> 'enrollment_id'
            and lower(e.person_email) = lower(v_target))
        or exists (
          select 1 from auth.users tu
          where tu.id::text in (
            a.target ->> 'auth_user_id', a.target ->> 'learner_auth_user_id')
            and lower(tu.email) = lower(v_target))))
      or (not p_target_exact and (
        a.target ->> 'email' ilike '%' || v_target || '%'
        or a.target ->> 'person_email' ilike '%' || v_target || '%'
        or exists (
          select 1 from public.lms_enrollments e
          where e.id::text = a.target ->> 'enrollment_id'
            and e.person_email ilike '%' || v_target || '%')
        or exists (
          select 1 from auth.users tu
          where tu.id::text in (
            a.target ->> 'auth_user_id', a.target ->> 'learner_auth_user_id')
            and tu.email ilike '%' || v_target || '%'))));

  select count(*) into v_total from m1_audit_rows;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select row_data, created_at
    from m1_audit_rows
    order by created_at desc
    offset v_offset
    limit v_limit
  ) page;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

drop function public.lms_admin_search_audit(
  uuid, text, text, text, integer, integer
);

revoke all on function public.lms_admin_search_audit(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_search_audit(
  uuid, text, text, text, integer, integer, boolean
) to service_role;

-- C7: read-audit rows (view_dashboard, inspect_learner) stay in the ledger
-- but are excluded from the dashboard's latest-admin-actions strip so the
-- strip shows operations, not views of itself.
create or replace function public.lms_admin_dashboard_counts(p_actor_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  v := jsonb_build_object(
    'total_learners', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_limit => 0)) -> 'total',
    'active_access', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_enrollment_status => 'active', p_limit => 0)) -> 'total',
    'in_progress', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_in_progress => true, p_limit => 0)) -> 'total',
    'completed_30d', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_completed => true, p_completed_within_days => 30,
      p_limit => 0)) -> 'total',
    'completed_all', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_completed => true, p_limit => 0)) -> 'total',
    'expiring_30', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_expiring_days => 30, p_limit => 0)) -> 'total',
    'expiring_60', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_expiring_days => 60, p_limit => 0)) -> 'total',
    'expiring_90', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_expiring_days => 90, p_limit => 0)) -> 'total',
    'stalled', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_stalled => true, p_limit => 0)) -> 'total',
    'deactivated', (public.lms_admin_list_learners(
      p_actor_auth_user_id, p_deactivated => true, p_limit => 0)) -> 'total',
    'stalled_threshold_days', public.lms_stalled_threshold_days()
  );

  return v || jsonb_build_object(
    'recent_completions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'completed_at', ce.completed_at,
        'trigger', ce.trigger,
        'person_email', e.person_email,
        'course_title', c.title
      ) order by ce.completed_at desc)
      from (
        select * from public.lms_completion_events
        order by completed_at desc
        limit 8
      ) ce
      join public.lms_enrollments e on e.id = ce.enrollment_id
      join public.lms_courses c on c.id = e.course_id
    ), '[]'::jsonb),
    'recent_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', a.created_at,
        'action', a.action,
        'actor_email', lower(au.email),
        'target', a.target
      ) order by a.created_at desc)
      from (
        select * from public.lms_admin_actions
        where action not in ('view_dashboard', 'inspect_learner')
        order by created_at desc
        limit 8
      ) a
      join auth.users au on au.id = a.actor_auth_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.lms_admin_dashboard_counts(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_dashboard_counts(uuid)
  to service_role;
