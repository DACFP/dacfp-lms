-- M1: learner management + operator dashboard.
-- Every function here is SECURITY DEFINER with a pinned search_path,
-- revoked from public/anon/authenticated, granted to service_role only,
-- and every mutation writes one lms_admin_actions row.

-- -----------------------------------------------------------------------
-- Support notes: append-only records on a learner. No update/delete path
-- exists in M1 by design; the author email is stamped at write time so the
-- record stays historically accurate even if the operator account changes.
-- -----------------------------------------------------------------------
create table public.lms_learner_notes (
  id uuid primary key default gen_random_uuid(),
  learner_auth_user_id uuid not null references auth.users(id) on delete cascade,
  author_auth_user_id uuid not null references auth.users(id),
  author_email text not null,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

alter table public.lms_learner_notes enable row level security;
alter table public.lms_learner_notes force row level security;
revoke all on public.lms_learner_notes from public, anon, authenticated;
grant all on public.lms_learner_notes to service_role;

create index lms_learner_notes_learner_idx
  on public.lms_learner_notes (learner_auth_user_id, created_at desc);

-- -----------------------------------------------------------------------
-- Audit ledger indexes for M1 §8 server-side search + pagination.
-- -----------------------------------------------------------------------
create index lms_admin_actions_created_at_idx
  on public.lms_admin_actions (created_at desc);
create index lms_admin_actions_action_idx
  on public.lms_admin_actions (action);
create index lms_admin_actions_actor_idx
  on public.lms_admin_actions (actor_auth_user_id);

-- -----------------------------------------------------------------------
-- The canonical stalled threshold (M1 §2): an active, incomplete
-- enrollment with no progress activity in the last N days. This function
-- is the single named home of N; the directory and every dashboard tile
-- read it from here.
-- -----------------------------------------------------------------------
create function public.lms_stalled_threshold_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 14 $$;

revoke all on function public.lms_stalled_threshold_days()
  from public, anon, authenticated;
grant execute on function public.lms_stalled_threshold_days() to service_role;

-- -----------------------------------------------------------------------
-- Per-learner enrollment detail rows shared by the directory function
-- above. access_state and stalled are the canonical derivations.
-- -----------------------------------------------------------------------
create function public.lms_admin_enrollment_detail(p_auth_user_id uuid)
returns table (
  enrollment_id uuid,
  course_id uuid,
  course_slug text,
  course_title text,
  enrolled_at timestamptz,
  expires_at timestamptz,
  access_state text,
  percent_complete numeric,
  last_activity timestamptz,
  completed_at timestamptz,
  stalled boolean,
  in_progress boolean,
  flagship boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    e.id as enrollment_id,
    e.course_id,
    c.slug as course_slug,
    c.title as course_title,
    e.enrolled_at,
    e.expires_at,
    case
      when e.status = 'revoked' then 'revoked'
      when e.status = 'expired'
        or (e.expires_at is not null and e.expires_at <= now()) then 'expired'
      else 'active'
    end as access_state,
    v.percent_complete,
    v.last_activity,
    ce.completed_at,
    (
      e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
      and ce.completed_at is null
      and v.last_activity <
        now() - make_interval(days => public.lms_stalled_threshold_days())
    ) as stalled,
    (
      e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
      and ce.completed_at is null
      and v.status = 'in_progress'
    ) as in_progress,
    (c.prerequisite_course_id is null and c.progression = 'sequential') as flagship
  from public.lms_enrollments e
  join public.lms_courses c on c.id = e.course_id
  left join public.lms_completion_events ce on ce.enrollment_id = e.id
  left join public.v_lms_person_progress v
    on v.course_id = e.course_id
   and lower(v.person_email) = lower(e.person_email)
  where e.auth_user_id = p_auth_user_id
$$;

revoke all on function public.lms_admin_enrollment_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_enrollment_detail(uuid)
  to service_role;

-- -----------------------------------------------------------------------
-- Canonical learner directory (M1 §2) — one row per learner account.
-- Dashboard tiles (M1 §1) call this same function with the tile's filter,
-- so a tile count equals its linked filtered row count by construction.
-- Population contract: auth.users rows whose lms_role is not 'operator'.
-- Progress fields derive from v_lms_person_progress (the platform's
-- canonical per-person-per-course progress object).
-- -----------------------------------------------------------------------
create function public.lms_admin_list_learners(
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
  delete from m1_directory_rows;

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

-- -----------------------------------------------------------------------
-- Operator dashboard counts (M1 §1). Each tile's count is read from the
-- same directory function its link opens, with the same filter, so the
-- two cannot drift.
-- -----------------------------------------------------------------------
create function public.lms_admin_dashboard_counts(p_actor_auth_user_id uuid)
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

-- -----------------------------------------------------------------------
-- M1 §4: profile field edits (first, middle, last, CFP Board ID).
-- Email change is out of scope. Audits old and new values.
-- -----------------------------------------------------------------------
create function public.lms_admin_upsert_learner_profile(
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_cfp_id text
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
    'update_learner_profile',
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
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.lms_admin_upsert_learner_profile(
  uuid, uuid, text, text, text, text
) to service_role;

-- -----------------------------------------------------------------------
-- M1 §5: set / extend expiration. Writes a new expiration and audits old
-- and new values. Extending a lapsed enrollment past now restores access
-- (this is also the deliberate un-revoke path).
-- -----------------------------------------------------------------------
create function public.lms_admin_set_enrollment_expiration(
  p_actor_auth_user_id uuid,
  p_enrollment_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.lms_enrollments%rowtype;
  v_new_status text;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_expires_at is null then
    raise exception 'expiration is required' using errcode = '22023';
  end if;

  select * into v_old from public.lms_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'enrollment unavailable' using errcode = '22023';
  end if;

  v_new_status := case
    when p_expires_at > now() then 'active'
    else v_old.status
  end;

  update public.lms_enrollments
  set expires_at = p_expires_at,
      status = v_new_status
  where id = p_enrollment_id;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'set_enrollment_expiration',
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'email', v_old.person_email,
      'old_expires_at', v_old.expires_at,
      'new_expires_at', p_expires_at,
      'old_status', v_old.status,
      'new_status', v_new_status
    )
  );

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'expires_at', p_expires_at,
    'status', v_new_status
  );
end;
$$;

revoke all on function public.lms_admin_set_enrollment_expiration(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.lms_admin_set_enrollment_expiration(
  uuid, uuid, timestamptz
) to service_role;

-- -----------------------------------------------------------------------
-- M1 §5: revoke access — expired-now semantics. Progress history is
-- never deleted.
-- -----------------------------------------------------------------------
create function public.lms_admin_revoke_enrollment(
  p_actor_auth_user_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.lms_enrollments%rowtype;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  select * into v_old from public.lms_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'enrollment unavailable' using errcode = '22023';
  end if;

  update public.lms_enrollments
  set status = 'revoked',
      expires_at = now()
  where id = p_enrollment_id;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'revoke_enrollment',
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'email', v_old.person_email,
      'old_status', v_old.status,
      'old_expires_at', v_old.expires_at
    )
  );

  return jsonb_build_object('enrollment_id', p_enrollment_id, 'status', 'revoked');
end;
$$;

revoke all on function public.lms_admin_revoke_enrollment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_revoke_enrollment(uuid, uuid)
  to service_role;

-- -----------------------------------------------------------------------
-- M1 §4: delete guard. Deletion is permitted only when the learner has
-- zero completion events and zero CE report inclusion. The edge function
-- performs the actual auth-admin delete (auth.users cascades through the
-- platform FK graph) and audits after success; this guard is read-only.
-- -----------------------------------------------------------------------
create function public.lms_admin_delete_learner_guard(
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_completions integer;
  v_ce_rows integer;
  v_enrollments integer;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = p_auth_user_id;
  if v_email is null then
    raise exception 'learner unavailable' using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users
    where id = p_auth_user_id
      and raw_app_meta_data ->> 'lms_role' = 'operator'
  ) then
    raise exception 'operators cannot be deleted here' using errcode = '22023';
  end if;

  select count(*) into v_completions
  from public.lms_completion_events ce
  join public.lms_enrollments e on e.id = ce.enrollment_id
  where e.auth_user_id = p_auth_user_id;

  select count(*) into v_ce_rows
  from public.lms_ce_report_runs r,
       jsonb_array_elements(r.rows) as included
  where lower(included ->> 'person_email') = v_email;

  select count(*) into v_enrollments
  from public.lms_enrollments
  where auth_user_id = p_auth_user_id;

  return jsonb_build_object(
    'allowed', v_completions = 0 and v_ce_rows = 0,
    'email', v_email,
    'completion_count', v_completions,
    'ce_report_row_count', v_ce_rows,
    'enrollment_count', v_enrollments
  );
end;
$$;

revoke all on function public.lms_admin_delete_learner_guard(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_delete_learner_guard(uuid, uuid)
  to service_role;

-- -----------------------------------------------------------------------
-- M1 §6: mark a single lesson complete (support intervention for playback
-- or tracking failures). Sets completed_at only — video positions are
-- never fabricated. The edge function then re-runs the progression engine
-- (the same detector the learner path uses) so downstream unlock and
-- course-completion state stays consistent.
-- -----------------------------------------------------------------------
create function public.lms_admin_complete_lesson(
  p_actor_auth_user_id uuid,
  p_enrollment_id uuid,
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.lms_enrollments%rowtype;
  v_kind text;
  v_row public.lms_lesson_progress%rowtype;
  v_already boolean;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  select * into v_enrollment
  from public.lms_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'enrollment unavailable' using errcode = '22023';
  end if;

  select l.kind into v_kind
  from public.lms_lessons l
  join public.lms_modules m on m.id = l.module_id
  where l.id = p_lesson_id and m.course_id = v_enrollment.course_id;
  if v_kind is null then
    raise exception 'lesson unavailable' using errcode = '22023';
  end if;
  if v_kind = 'survey' then
    raise exception 'survey lessons complete only through learner submission'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.lms_lesson_progress
    where enrollment_id = p_enrollment_id
      and lesson_id = p_lesson_id
      and completed_at is not null
  ) into v_already;

  insert into public.lms_lesson_progress (
    enrollment_id, lesson_id, started_at, completed_at,
    last_position_seconds, max_watched_seconds, updated_at
  ) values (
    p_enrollment_id, p_lesson_id, now(), now(), 0, 0, now()
  )
  on conflict (enrollment_id, lesson_id) do update
  set completed_at = coalesce(public.lms_lesson_progress.completed_at, now()),
      started_at = coalesce(public.lms_lesson_progress.started_at, now()),
      updated_at = now()
  returning * into v_row;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'admin_complete_lesson',
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'email', v_enrollment.person_email,
      'lesson_id', p_lesson_id,
      'already_complete', v_already
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.lms_admin_complete_lesson(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_complete_lesson(uuid, uuid, uuid)
  to service_role;

-- -----------------------------------------------------------------------
-- M1 §3: append a support note. Notes are append-only; the audit row is
-- written in the same transaction.
-- -----------------------------------------------------------------------
create function public.lms_admin_add_learner_note(
  p_actor_auth_user_id uuid,
  p_learner_auth_user_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.lms_learner_notes%rowtype;
  v_actor_email text;
  v_learner_email text;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'note body is required' using errcode = '22023';
  end if;

  select lower(email) into v_actor_email
  from auth.users where id = p_actor_auth_user_id;
  select lower(email) into v_learner_email
  from auth.users where id = p_learner_auth_user_id;
  if v_learner_email is null then
    raise exception 'learner unavailable' using errcode = '22023';
  end if;

  insert into public.lms_learner_notes (
    learner_auth_user_id, author_auth_user_id, author_email, body
  ) values (
    p_learner_auth_user_id, p_actor_auth_user_id, v_actor_email, btrim(p_body)
  )
  returning * into v_note;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'add_learner_note',
    jsonb_build_object(
      'note_id', v_note.id,
      'learner_auth_user_id', p_learner_auth_user_id,
      'email', v_learner_email
    )
  );

  return to_jsonb(v_note);
end;
$$;

revoke all on function public.lms_admin_add_learner_note(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.lms_admin_add_learner_note(uuid, uuid, text)
  to service_role;

-- -----------------------------------------------------------------------
-- M1 §8 + §3: audit search with resolved actor emails, server-side
-- pagination, and target-email matching that also resolves enrollment and
-- auth-user identifiers in older target payloads.
-- -----------------------------------------------------------------------
create function public.lms_admin_search_audit(
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
  delete from m1_audit_rows;

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
