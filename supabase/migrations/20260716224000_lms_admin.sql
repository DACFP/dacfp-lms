create table public.lms_admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid not null references auth.users (id),
  action text not null check (btrim(action) <> ''),
  target jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lms_admin_actions_target_object
    check (jsonb_typeof(target) = 'object')
);

alter table public.lms_admin_actions enable row level security;
alter table public.lms_admin_actions force row level security;

revoke all on table public.lms_admin_actions from public, anon, authenticated;
grant all on table public.lms_admin_actions to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lms-resources',
  'lms-resources',
  false,
  5242880,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update public.lms_lesson_resources
set file_ref = 'seed/bitcoin-foundations-workbook.txt'
where file_ref = '/mock-resources/bitcoin-foundations-workbook.txt';

create function public.lms_admin_actor_is_operator(p_actor_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_actor_auth_user_id
      and u.raw_app_meta_data ->> 'role' = 'operator'
  );
$$;

revoke all on function public.lms_admin_actor_is_operator(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_actor_is_operator(uuid)
  to service_role;

create function public.lms_admin_reorder(
  p_actor_auth_user_id uuid,
  p_kind text,
  p_parent_id uuid,
  p_ordered_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  supplied_count integer;
  item_id uuid;
  item_position integer := 1;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;

  supplied_count := coalesce(array_length(p_ordered_ids, 1), 0);
  if supplied_count = 0 or supplied_count <> (
    select count(distinct supplied_id) from unnest(p_ordered_ids) supplied_id
  ) then
    raise exception 'invalid order';
  end if;

  if p_kind = 'modules' then
    select count(*) into expected_count
    from public.lms_modules
    where course_id = p_parent_id;

    if expected_count <> supplied_count or exists (
      select 1
      from unnest(p_ordered_ids) supplied_id
      where not exists (
        select 1 from public.lms_modules m
        where m.id = supplied_id and m.course_id = p_parent_id
      )
    ) then
      raise exception 'invalid module order';
    end if;

    update public.lms_modules
    set position = position + 100000
    where course_id = p_parent_id;

    foreach item_id in array p_ordered_ids loop
      update public.lms_modules set position = item_position where id = item_id;
      item_position := item_position + 1;
    end loop;
  elsif p_kind = 'lessons' then
    select count(*) into expected_count
    from public.lms_lessons
    where module_id = p_parent_id;

    if expected_count <> supplied_count or exists (
      select 1
      from unnest(p_ordered_ids) supplied_id
      where not exists (
        select 1 from public.lms_lessons l
        where l.id = supplied_id and l.module_id = p_parent_id
      )
    ) then
      raise exception 'invalid lesson order';
    end if;

    update public.lms_lessons
    set position = position + 100000
    where module_id = p_parent_id;

    foreach item_id in array p_ordered_ids loop
      update public.lms_lessons set position = item_position where id = item_id;
      item_position := item_position + 1;
    end loop;
  else
    raise exception 'invalid reorder kind';
  end if;

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'reorder_' || p_kind,
    jsonb_build_object(
      'parent_id', p_parent_id,
      'ordered_ids', to_jsonb(p_ordered_ids)
    )
  );

  return jsonb_build_object('ordered_ids', to_jsonb(p_ordered_ids));
end;
$$;

revoke all on function public.lms_admin_reorder(uuid, text, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.lms_admin_reorder(uuid, text, uuid, uuid[])
  to service_role;

create function public.lms_admin_import_question_bank(
  p_actor_auth_user_id uuid,
  p_module_id uuid,
  p_pass_pct integer,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_id uuid;
  question jsonb;
  question_count integer;
  expected_position integer := 1;
  correct_id text;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_pass_pct <> 70 then
    raise exception 'pass_pct must be 70';
  end if;
  if not exists (select 1 from public.lms_modules where id = p_module_id) then
    raise exception 'module unavailable';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'questions must be an array';
  end if;

  question_count := jsonb_array_length(p_questions);
  if question_count <> 10 then
    raise exception 'question bank must contain exactly 10 questions';
  end if;

  for question in select value from jsonb_array_elements(p_questions) loop
    correct_id := question ->> 'correct';
    if (question ->> 'position')::integer <> expected_position
      or btrim(coalesce(question ->> 'prompt', '')) = ''
      or btrim(coalesce(question ->> 'choice_a', '')) = ''
      or btrim(coalesce(question ->> 'choice_b', '')) = ''
      or btrim(coalesce(question ->> 'choice_c', '')) = ''
      or btrim(coalesce(question ->> 'choice_d', '')) = ''
      or correct_id not in ('a', 'b', 'c', 'd')
      or coalesce((question ->> 'points')::integer, 0) <= 0
    then
      raise exception 'invalid question at position %', expected_position;
    end if;
    expected_position := expected_position + 1;
  end loop;

  insert into public.lms_module_quizzes (module_id, question_count, pass_pct)
  values (p_module_id, question_count, 70)
  on conflict (module_id) do update set
    question_count = excluded.question_count,
    pass_pct = 70
  returning id into v_quiz_id;

  delete from public.lms_quiz_questions q where q.quiz_id = v_quiz_id;

  insert into public.lms_quiz_questions (
    quiz_id,
    position,
    prompt,
    choices,
    correct,
    points
  )
  select
    v_quiz_id,
    (value ->> 'position')::integer,
    value ->> 'prompt',
    jsonb_build_array(
      jsonb_build_object('id', 'a', 'text', value ->> 'choice_a'),
      jsonb_build_object('id', 'b', 'text', value ->> 'choice_b'),
      jsonb_build_object('id', 'c', 'text', value ->> 'choice_c'),
      jsonb_build_object('id', 'd', 'text', value ->> 'choice_d')
    ),
    jsonb_build_array(value ->> 'correct'),
    (value ->> 'points')::integer
  from jsonb_array_elements(p_questions);

  insert into public.lms_admin_actions (actor_auth_user_id, action, target)
  values (
    p_actor_auth_user_id,
    'import_question_bank',
    jsonb_build_object(
      'module_id', p_module_id,
      'quiz_id', v_quiz_id,
      'question_count', question_count,
      'pass_pct', 70
    )
  );

  return jsonb_build_object(
    'quiz_id', v_quiz_id,
    'question_count', question_count,
    'pass_pct', 70
  );
end;
$$;

revoke all on function public.lms_admin_import_question_bank(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_admin_import_question_bank(uuid, uuid, integer, jsonb)
  to service_role;

create function public.lms_admin_support_action(
  p_actor_auth_user_id uuid,
  p_action text,
  p_enrollment_id uuid,
  p_quiz_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer := 0;
  completion_inserted boolean := false;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lms_enrollments where id = p_enrollment_id
  ) then
    raise exception 'enrollment unavailable';
  end if;

  if p_action = 'reset_attempt_history' then
    if p_quiz_id is null or not exists (
      select 1
      from public.lms_module_quizzes q
      join public.lms_modules m on m.id = q.module_id
      join public.lms_enrollments e on e.id = p_enrollment_id
      where q.id = p_quiz_id and m.course_id = e.course_id
    ) then
      raise exception 'quiz unavailable';
    end if;

    delete from public.lms_quiz_attempts
    where enrollment_id = p_enrollment_id and quiz_id = p_quiz_id;
    get diagnostics affected_count = row_count;

    insert into public.lms_admin_actions (actor_auth_user_id, action, target)
    values (
      p_actor_auth_user_id,
      'reset_attempt_history',
      jsonb_build_object(
        'enrollment_id', p_enrollment_id,
        'quiz_id', p_quiz_id,
        'deleted_attempts', affected_count
      )
    );

    return jsonb_build_object('deleted_attempts', affected_count);
  elsif p_action = 'manual_mark_complete' then
    insert into public.lms_completion_events (
      enrollment_id,
      completed_at,
      trigger,
      designation_issued
    )
    values (p_enrollment_id, now(), 'manual_admin', false)
    on conflict (enrollment_id) do nothing;
    get diagnostics affected_count = row_count;
    completion_inserted := affected_count = 1;

    insert into public.lms_admin_actions (actor_auth_user_id, action, target)
    values (
      p_actor_auth_user_id,
      'manual_mark_complete',
      jsonb_build_object(
        'enrollment_id', p_enrollment_id,
        'inserted', completion_inserted
      )
    );

    return jsonb_build_object('inserted', completion_inserted);
  end if;

  raise exception 'unsupported support action';
end;
$$;

revoke all on function public.lms_admin_support_action(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lms_admin_support_action(uuid, text, uuid, uuid)
  to service_role;
