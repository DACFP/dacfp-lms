alter table public.lms_module_quizzes
  add constraint lms_module_quizzes_pass_pct_published_policy
    check (pass_pct = 70),
  add constraint lms_module_quizzes_question_count_published_policy
    check (question_count = 10);

revoke update (terms_accepted_at)
  on table public.lms_enrollments from authenticated;

drop policy if exists lms_enrollments_update_own
  on public.lms_enrollments;

create function public.lms_accept_terms(p_course_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_enrollment_id uuid;
  v_existing timestamptz;
  v_accepted_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'terms acceptance unavailable' using errcode = '42501';
  end if;

  select e.id, e.terms_accepted_at
  into v_enrollment_id, v_existing
  from public.lms_enrollments e
  where e.auth_user_id = v_user_id
    and e.course_id = p_course_id
    and e.status = 'active'
    and (e.expires_at is null or e.expires_at > now())
  for update;

  if not found then
    raise exception 'terms acceptance unavailable' using errcode = '42501';
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  v_accepted_at := clock_timestamp();
  update public.lms_enrollments e
  set terms_accepted_at = v_accepted_at
  where e.id = v_enrollment_id
    and e.terms_accepted_at is null
  returning e.terms_accepted_at into v_accepted_at;

  if not found then
    select e.terms_accepted_at
    into v_accepted_at
    from public.lms_enrollments e
    where e.id = v_enrollment_id;
  end if;

  return v_accepted_at;
end;
$$;

revoke all on function public.lms_accept_terms(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_accept_terms(uuid)
  to authenticated;

alter table public.lms_lesson_progress
  add column max_watched_updated_at timestamptz;

update public.lms_lesson_progress
set max_watched_updated_at = coalesce(updated_at, started_at, now());

alter table public.lms_lesson_progress
  alter column max_watched_updated_at set default now(),
  alter column max_watched_updated_at set not null;

create or replace function public.lms_record_video_heartbeat(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_position_seconds integer
)
returns public.lms_lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_duration_seconds integer;
  v_progression text;
  v_existing public.lms_lesson_progress%rowtype;
  v_result public.lms_lesson_progress%rowtype;
  v_position_seconds integer;
  v_next_max integer;
  v_growth numeric;
  v_elapsed_seconds numeric;
  v_allowed_growth numeric;
begin
  if p_position_seconds is null or p_position_seconds < 0 then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  select lesson.kind, lesson.duration_seconds, course.progression
  into v_kind, v_duration_seconds, v_progression
  from public.lms_lessons lesson
  join public.lms_modules module on module.id = lesson.module_id
  join public.lms_courses course on course.id = module.course_id
  join public.lms_enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.course_id = course.id
  where lesson.id = p_lesson_id;

  if not found
    or v_kind <> 'video'
    or v_duration_seconds is null
    or v_duration_seconds <= 0
  then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  v_position_seconds := least(p_position_seconds, v_duration_seconds);

  select progress.*
  into v_existing
  from public.lms_lesson_progress progress
  where progress.enrollment_id = p_enrollment_id
    and progress.lesson_id = p_lesson_id
  for update;

  if not found then
    if v_progression = 'sequential' and v_position_seconds > 2 then
      raise exception 'progress_update_rejected' using errcode = '22023';
    end if;

    insert into public.lms_lesson_progress (
      enrollment_id,
      lesson_id,
      started_at,
      completed_at,
      last_position_seconds,
      max_watched_seconds,
      max_watched_updated_at,
      updated_at
    )
    values (
      p_enrollment_id,
      p_lesson_id,
      v_now,
      case
        when v_position_seconds::numeric >= v_duration_seconds::numeric * 0.95
          then v_now
        else null
      end,
      v_position_seconds,
      v_position_seconds,
      v_now,
      v_now
    )
    returning * into v_result;

    return v_result;
  end if;

  v_next_max := greatest(v_existing.max_watched_seconds, v_position_seconds);
  v_growth := v_next_max - v_existing.max_watched_seconds;
  v_elapsed_seconds := greatest(
    0,
    extract(epoch from (
      v_now - coalesce(
        v_existing.max_watched_updated_at,
        v_existing.started_at,
        v_existing.updated_at
      )
    ))
  );
  v_allowed_growth := greatest(2, (v_elapsed_seconds * 1.5) + 1);

  if v_progression = 'sequential' and v_growth > v_allowed_growth then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  update public.lms_lesson_progress progress
  set started_at = coalesce(progress.started_at, v_now),
      completed_at = coalesce(
        progress.completed_at,
        case
          when v_next_max::numeric >= v_duration_seconds::numeric * 0.95
            then v_now
          else null
        end
      ),
      last_position_seconds = v_position_seconds,
      max_watched_seconds = v_next_max,
      max_watched_updated_at = case
        when v_next_max > progress.max_watched_seconds then v_now
        else progress.max_watched_updated_at
      end,
      updated_at = v_now
  where progress.id = v_existing.id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.lms_record_video_heartbeat(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.lms_record_video_heartbeat(uuid, uuid, integer)
  to service_role;

create or replace function public.lms_complete_reading(
  p_enrollment_id uuid,
  p_lesson_id uuid
)
returns public.lms_lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_result public.lms_lesson_progress%rowtype;
begin
  select lesson.kind
  into v_kind
  from public.lms_lessons lesson
  join public.lms_modules module on module.id = lesson.module_id
  join public.lms_enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.course_id = module.course_id
  where lesson.id = p_lesson_id;

  if not found or v_kind <> 'reading' then
    raise exception 'progress_update_rejected' using errcode = '22023';
  end if;

  insert into public.lms_lesson_progress (
    enrollment_id,
    lesson_id,
    started_at,
    completed_at,
    last_position_seconds,
    max_watched_seconds,
    max_watched_updated_at,
    updated_at
  )
  values (
    p_enrollment_id,
    p_lesson_id,
    v_now,
    v_now,
    0,
    0,
    v_now,
    v_now
  )
  on conflict (enrollment_id, lesson_id) do update
  set started_at = coalesce(public.lms_lesson_progress.started_at, v_now),
      completed_at = coalesce(public.lms_lesson_progress.completed_at, v_now),
      max_watched_updated_at = coalesce(
        public.lms_lesson_progress.max_watched_updated_at,
        v_now
      ),
      updated_at = v_now
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.lms_complete_reading(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_complete_reading(uuid, uuid)
  to service_role;

create function public.lms_admin_crud(
  p_actor_auth_user_id uuid,
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.lms_courses%rowtype;
  v_module public.lms_modules%rowtype;
  v_lesson public.lms_lessons%rowtype;
  v_id uuid;
  v_parent_id uuid;
  v_position integer;
  v_target jsonb;
  v_result jsonb;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid admin payload' using errcode = '22023';
  end if;

  if p_action = 'create_course' then
    insert into public.lms_courses (
      slug,
      title,
      description,
      status,
      progression,
      prerequisite_course_id,
      ce_credits,
      requires_terms_acceptance
    ) values (
      lower(btrim(p_payload ->> 'slug')),
      btrim(p_payload ->> 'title'),
      btrim(p_payload ->> 'description'),
      p_payload ->> 'status',
      p_payload ->> 'progression',
      nullif(p_payload ->> 'prerequisite_course_id', '')::uuid,
      nullif(p_payload ->> 'ce_credits', '')::numeric,
      coalesce((p_payload ->> 'requires_terms_acceptance')::boolean, false)
    )
    returning * into v_course;
    v_result := to_jsonb(v_course);
    v_target := jsonb_build_object('course_id', v_course.id, 'slug', v_course.slug);

  elsif p_action = 'update_course' then
    v_id := (p_payload ->> 'id')::uuid;
    if p_payload ? 'prerequisite_course_id'
      and nullif(p_payload ->> 'prerequisite_course_id', '')::uuid = v_id
    then
      raise exception 'course cannot require itself' using errcode = '22023';
    end if;
    update public.lms_courses c
    set slug = case when p_payload ? 'slug'
          then lower(btrim(p_payload ->> 'slug')) else c.slug end,
        title = case when p_payload ? 'title'
          then btrim(p_payload ->> 'title') else c.title end,
        description = case when p_payload ? 'description'
          then btrim(p_payload ->> 'description') else c.description end,
        status = case when p_payload ? 'status'
          then p_payload ->> 'status' else c.status end,
        progression = case when p_payload ? 'progression'
          then p_payload ->> 'progression' else c.progression end,
        prerequisite_course_id = case when p_payload ? 'prerequisite_course_id'
          then nullif(p_payload ->> 'prerequisite_course_id', '')::uuid
          else c.prerequisite_course_id end,
        ce_credits = case when p_payload ? 'ce_credits'
          then nullif(p_payload ->> 'ce_credits', '')::numeric
          else c.ce_credits end,
        requires_terms_acceptance = case when p_payload ? 'requires_terms_acceptance'
          then (p_payload ->> 'requires_terms_acceptance')::boolean
          else c.requires_terms_acceptance end
    where c.id = v_id
    returning * into v_course;
    if not found then raise exception 'course unavailable'; end if;
    v_result := to_jsonb(v_course);
    v_target := jsonb_build_object(
      'course_id', v_id,
      'fields', to_jsonb(array(select jsonb_object_keys(p_payload) order by 1))
    );

  elsif p_action = 'delete_course' then
    v_id := (p_payload ->> 'id')::uuid;
    delete from public.lms_courses c where c.id = v_id returning * into v_course;
    if not found then raise exception 'course unavailable'; end if;
    v_result := jsonb_build_object('id', v_id);
    v_target := jsonb_build_object('course_id', v_id);

  elsif p_action = 'create_module' then
    v_parent_id := (p_payload ->> 'course_id')::uuid;
    select coalesce(max(m.position), 0) + 1
    into v_position
    from public.lms_modules m
    where m.course_id = v_parent_id;
    insert into public.lms_modules (course_id, position, title, ce_credits)
    values (
      v_parent_id,
      coalesce((p_payload ->> 'position')::integer, v_position),
      btrim(p_payload ->> 'title'),
      nullif(p_payload ->> 'ce_credits', '')::numeric
    )
    returning * into v_module;
    v_result := to_jsonb(v_module);
    v_target := jsonb_build_object('module_id', v_module.id, 'course_id', v_parent_id);

  elsif p_action = 'update_module' then
    v_id := (p_payload ->> 'id')::uuid;
    update public.lms_modules m
    set title = case when p_payload ? 'title'
          then btrim(p_payload ->> 'title') else m.title end,
        ce_credits = case when p_payload ? 'ce_credits'
          then nullif(p_payload ->> 'ce_credits', '')::numeric
          else m.ce_credits end
    where m.id = v_id
    returning * into v_module;
    if not found then raise exception 'module unavailable'; end if;
    v_result := to_jsonb(v_module);
    v_target := jsonb_build_object(
      'module_id', v_id,
      'fields', to_jsonb(array(select jsonb_object_keys(p_payload) order by 1))
    );

  elsif p_action = 'delete_module' then
    v_id := (p_payload ->> 'id')::uuid;
    delete from public.lms_modules m where m.id = v_id returning * into v_module;
    if not found then raise exception 'module unavailable'; end if;
    v_result := jsonb_build_object('id', v_id);
    v_target := jsonb_build_object('module_id', v_id);

  elsif p_action = 'create_lesson' then
    v_parent_id := (p_payload ->> 'module_id')::uuid;
    select coalesce(max(l.position), 0) + 1
    into v_position
    from public.lms_lessons l
    where l.module_id = v_parent_id;
    insert into public.lms_lessons (
      module_id,
      position,
      title,
      kind,
      video_ref,
      duration_seconds,
      body_md,
      is_required
    ) values (
      v_parent_id,
      coalesce((p_payload ->> 'position')::integer, v_position),
      btrim(p_payload ->> 'title'),
      p_payload ->> 'kind',
      nullif(p_payload ->> 'video_ref', ''),
      nullif(p_payload ->> 'duration_seconds', '')::integer,
      nullif(p_payload ->> 'body_md', ''),
      coalesce((p_payload ->> 'is_required')::boolean, true)
    )
    returning * into v_lesson;
    v_result := to_jsonb(v_lesson);
    v_target := jsonb_build_object('lesson_id', v_lesson.id, 'module_id', v_parent_id);

  elsif p_action = 'update_lesson' then
    v_id := (p_payload ->> 'id')::uuid;
    update public.lms_lessons l
    set title = case when p_payload ? 'title'
          then btrim(p_payload ->> 'title') else l.title end,
        kind = case when p_payload ? 'kind'
          then p_payload ->> 'kind' else l.kind end,
        video_ref = case
          when p_payload ? 'kind' and p_payload ->> 'kind' = 'reading' then null
          when p_payload ? 'video_ref' then nullif(p_payload ->> 'video_ref', '')
          else l.video_ref end,
        duration_seconds = case
          when p_payload ? 'kind' and p_payload ->> 'kind' = 'reading' then null
          when p_payload ? 'duration_seconds'
            then nullif(p_payload ->> 'duration_seconds', '')::integer
          else l.duration_seconds end,
        body_md = case
          when p_payload ? 'kind' and p_payload ->> 'kind' = 'video' then null
          when p_payload ? 'body_md' then nullif(p_payload ->> 'body_md', '')
          else l.body_md end,
        is_required = case when p_payload ? 'is_required'
          then (p_payload ->> 'is_required')::boolean else l.is_required end
    where l.id = v_id
    returning * into v_lesson;
    if not found then raise exception 'lesson unavailable'; end if;
    v_result := to_jsonb(v_lesson);
    v_target := jsonb_build_object(
      'lesson_id', v_id,
      'fields', to_jsonb(array(select jsonb_object_keys(p_payload) order by 1))
    );

  elsif p_action = 'delete_lesson' then
    v_id := (p_payload ->> 'id')::uuid;
    delete from public.lms_lessons l where l.id = v_id returning * into v_lesson;
    if not found then raise exception 'lesson unavailable'; end if;
    v_result := jsonb_build_object('id', v_id);
    v_target := jsonb_build_object('lesson_id', v_id);

  else
    raise exception 'unsupported admin CRUD action' using errcode = '22023';
  end if;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (p_actor_auth_user_id, p_action, v_target);

  return v_result;
end;
$$;

revoke all on function public.lms_admin_crud(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_admin_crud(uuid, text, jsonb)
  to service_role;

create function public.lms_admin_find_auth_user_by_email(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', u.id, 'email', lower(u.email))
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  order by u.created_at
  limit 1;
$$;

revoke all on function public.lms_admin_find_auth_user_by_email(text)
  from public, anon, authenticated;
grant execute on function public.lms_admin_find_auth_user_by_email(text)
  to service_role;

drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable();

drop policy if exists lms_enrollments_select_own
  on public.lms_enrollments;
create policy lms_enrollments_select_own
on public.lms_enrollments
for select
to authenticated
using (auth_user_id = (select auth.uid()));

drop policy if exists lms_lesson_progress_select_own
  on public.lms_lesson_progress;
create policy lms_lesson_progress_select_own
on public.lms_lesson_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = (select auth.uid())
  )
);

drop policy if exists lms_quiz_attempts_select_own
  on public.lms_quiz_attempts;
create policy lms_quiz_attempts_select_own
on public.lms_quiz_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = (select auth.uid())
  )
);

drop policy if exists lms_completion_events_select_own
  on public.lms_completion_events;
create policy lms_completion_events_select_own
on public.lms_completion_events
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = (select auth.uid())
  )
);

create index lms_admin_actions_actor_auth_user_id_idx
  on public.lms_admin_actions (actor_auth_user_id);
create index lms_courses_prerequisite_course_id_idx
  on public.lms_courses (prerequisite_course_id);
create index lms_enrollments_auth_user_id_idx
  on public.lms_enrollments (auth_user_id);
create index lms_enrollments_course_id_idx
  on public.lms_enrollments (course_id);
create index lms_lesson_progress_lesson_id_idx
  on public.lms_lesson_progress (lesson_id);
create index lms_lesson_resources_lesson_id_idx
  on public.lms_lesson_resources (lesson_id);
create index lms_quiz_attempts_quiz_id_idx
  on public.lms_quiz_attempts (quiz_id);
create index lms_quiz_questions_quiz_id_idx
  on public.lms_quiz_questions (quiz_id);

comment on function public.lms_accept_terms(uuid) is
  'Authenticated server-stamped, idempotent acceptance for an active own enrollment.';
comment on function public.lms_admin_crud(uuid, text, jsonb) is
  'Service-only atomic course/module/lesson CRUD plus audit writer.';
comment on column public.lms_lesson_progress.max_watched_updated_at is
  'Advances only when max_watched_seconds grows; plausibility clock anchor.';
