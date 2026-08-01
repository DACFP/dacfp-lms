-- M1 rider: PostgREST connections run with the safeupdate guard, which
-- rejects DELETE without a WHERE clause. The temp-table clears in the two
-- paginated read functions become TRUNCATE (same effect, guard-safe).

create or replace function public.lms_admin_list_learners(
  p_actor_auth_user_id uuid,
  p_search text default null,
  p_course_id uuid default null,
  p_enrollment_status text default null, -- 'active' | 'expired' | 'none'
  p_stalled boolean default false,
  p_expiring_days integer default null,  -- 30 | 60 | 90
  p_completed boolean default false,
  p_completed_within_days integer default null,
  p_in_progress boolean default false,
  p_deactivated boolean default false,
  p_sort text default 'email',
  p_dir text default 'asc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 0), 10000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_enrollment_status is not null
    and p_enrollment_status not in ('active', 'expired', 'none') then
    raise exception 'invalid status filter' using errcode = '22023';
  end if;
  if p_expiring_days is not null and p_expiring_days not in (30, 60, 90) then
    raise exception 'invalid expiration window' using errcode = '22023';
  end if;
  if p_sort not in ('email', 'expiration', 'progress', 'last_activity') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_dir not in ('asc', 'desc') then
    raise exception 'invalid sort direction' using errcode = '22023';
  end if;

  create temp table if not exists m1_directory_rows (
    auth_user_id uuid,
    email text,
    row_data jsonb,
    sort_email text,
    sort_expires timestamptz,
    sort_percent numeric,
    sort_activity timestamptz
  ) on commit drop;
  truncate m1_directory_rows;

  insert into m1_directory_rows
  select
    l.auth_user_id,
    l.email,
    jsonb_build_object(
      'auth_user_id', l.auth_user_id,
      'email', l.email,
      'first_name', l.first_name,
      'middle_name', l.middle_name,
      'last_name', l.last_name,
      'display_name', l.display_name,
      'cfp_id', l.cfp_id,
      'deactivated', l.deactivated,
      'created_at', l.created_at,
      'enrollment_count', l.enrollment_count,
      'course_title', l.sel_course_title,
      'course_slug', l.sel_course_slug,
      'enrollment_status', l.sel_status,
      'percent_complete', l.sel_percent,
      'expires_at', l.sel_expires_at,
      'last_activity', l.sel_last_activity,
      'stalled', l.any_stalled,
      'completed', l.any_completed,
      'latest_completed_at', l.latest_completed_at
    ),
    l.email,
    l.sel_expires_at,
    l.sel_percent,
    l.sel_last_activity
  from (
    select
      u.id as auth_user_id,
      lower(u.email) as email,
      u.created_at,
      (u.banned_until is not null and u.banned_until > now()) as deactivated,
      coalesce(pr.first_name, '') as first_name,
      pr.middle_name,
      coalesce(pr.last_name, '') as last_name,
      coalesce(pr.display_name, '') as display_name,
      pr.credential_ids ->> 'cfp' as cfp_id,
      coalesce(agg.enrollment_count, 0) as enrollment_count,
      sel.course_title as sel_course_title,
      sel.course_slug as sel_course_slug,
      coalesce(sel.access_state, 'none') as sel_status,
      sel.percent_complete as sel_percent,
      sel.expires_at as sel_expires_at,
      case
        when p_course_id is null then agg.last_activity
        else sel.last_activity
      end as sel_last_activity,
      coalesce(agg.any_stalled, false) as any_stalled,
      coalesce(agg.any_completed, false) as any_completed,
      agg.latest_completed_at,
      coalesce(agg.any_active, false) as any_active,
      coalesce(agg.any_lapsed, false) as any_lapsed,
      coalesce(agg.any_in_progress, false) as any_in_progress,
      agg.nearest_active_expiry
    from auth.users u
    left join public.lms_learner_profiles pr on pr.auth_user_id = u.id
    left join lateral (
      select
        count(*) as enrollment_count,
        max(d.last_activity) as last_activity,
        bool_or(d.stalled) as any_stalled,
        bool_or(d.completed_at is not null) as any_completed,
        max(d.completed_at) as latest_completed_at,
        bool_or(d.access_state = 'active') as any_active,
        bool_or(d.access_state in ('expired', 'revoked')) as any_lapsed,
        bool_or(d.in_progress) as any_in_progress,
        min(d.expires_at) filter (where d.access_state = 'active')
          as nearest_active_expiry
      from public.lms_admin_enrollment_detail(u.id) d
      where p_course_id is null or d.course_id = p_course_id
    ) agg on true
    left join lateral (
      select d.*
      from public.lms_admin_enrollment_detail(u.id) d
      where p_course_id is null or d.course_id = p_course_id
      order by d.flagship desc, d.enrolled_at asc
      limit 1
    ) sel on true
    where coalesce(u.raw_app_meta_data ->> 'lms_role', 'learner') <> 'operator'
      and u.deleted_at is null
      and (u.is_sso_user is not true)
  ) l
  where
    (p_search is null or btrim(p_search) = ''
      or l.email ilike '%' || btrim(p_search) || '%'
      or l.display_name ilike '%' || btrim(p_search) || '%'
      or (l.first_name || ' ' || l.last_name) ilike '%' || btrim(p_search) || '%')
    and (p_course_id is null or l.enrollment_count > 0)
    and (p_enrollment_status is null
      or (p_enrollment_status = 'active' and l.any_active)
      or (p_enrollment_status = 'expired' and l.any_lapsed)
      or (p_enrollment_status = 'none' and l.enrollment_count = 0))
    and (not p_stalled or l.any_stalled)
    and (p_expiring_days is null
      or (l.nearest_active_expiry is not null
        and l.nearest_active_expiry > now()
        and l.nearest_active_expiry <= now() + make_interval(days => p_expiring_days)))
    and (not p_completed or l.any_completed)
    and (p_completed_within_days is null
      or l.latest_completed_at >= now() - make_interval(days => p_completed_within_days))
    and (not p_in_progress or l.any_in_progress)
    and (not p_deactivated or l.deactivated);

  select count(*) into v_total from m1_directory_rows;

  select coalesce(jsonb_agg(row_data order by ord), '[]'::jsonb)
  into v_rows
  from (
    select row_data, row_number() over (
      order by
        case when p_sort = 'email' and p_dir = 'asc' then sort_email end asc,
        case when p_sort = 'email' and p_dir = 'desc' then sort_email end desc,
        case when p_sort = 'expiration' and p_dir = 'asc' then sort_expires end asc nulls last,
        case when p_sort = 'expiration' and p_dir = 'desc' then sort_expires end desc nulls last,
        case when p_sort = 'progress' and p_dir = 'asc' then sort_percent end asc nulls last,
        case when p_sort = 'progress' and p_dir = 'desc' then sort_percent end desc nulls last,
        case when p_sort = 'last_activity' and p_dir = 'asc' then sort_activity end asc nulls last,
        case when p_sort = 'last_activity' and p_dir = 'desc' then sort_activity end desc nulls last,
        sort_email asc
    ) as ord
    from m1_directory_rows
    order by ord
    offset v_offset
    limit v_limit
  ) page;

  return jsonb_build_object(
    'total', v_total,
    'rows', v_rows,
    'stalled_threshold_days', public.lms_stalled_threshold_days()
  );
end;
$$;

revoke all on function public.lms_admin_list_learners(
  uuid, text, uuid, text, boolean, integer, boolean, integer, boolean,
  boolean, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.lms_admin_list_learners(
  uuid, text, uuid, text, boolean, integer, boolean, integer, boolean,
  boolean, text, text, integer, integer
) to service_role;

create or replace function public.lms_admin_search_audit(
  p_actor_auth_user_id uuid,
  p_actor_email text default null,
  p_action text default null,
  p_target_email text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
      or a.target ->> 'email' ilike '%' || v_target || '%'
      or a.target ->> 'person_email' ilike '%' || v_target || '%'
      or exists (
        select 1 from public.lms_enrollments e
        where e.id::text = a.target ->> 'enrollment_id'
          and e.person_email ilike '%' || v_target || '%')
      or exists (
        select 1 from auth.users tu
        where tu.id::text in (
          a.target ->> 'auth_user_id', a.target ->> 'learner_auth_user_id')
          and tu.email ilike '%' || v_target || '%'));

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

revoke all on function public.lms_admin_search_audit(
  uuid, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.lms_admin_search_audit(
  uuid, text, text, text, integer, integer
) to service_role;
