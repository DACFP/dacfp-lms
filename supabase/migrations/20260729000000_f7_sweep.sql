-- F7: persist module bridge copy, make scratch-module question imports
-- self-contained with field-specific validation, and refresh the FPT catalog
-- description to match Introduction plus Modules 1-4.

create or replace function public.lms_admin_save_module(
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
  v_module public.lms_modules%rowtype;
  v_id uuid;
  v_course_id uuid;
  v_position integer;
  v_target jsonb;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'module payload must be an object' using errcode = '22023';
  end if;

  if p_action = 'create_module' then
    v_course_id := (p_payload ->> 'course_id')::uuid;
    select coalesce(max(module.position), 0) + 1
    into v_position
    from public.lms_modules module
    where module.course_id = v_course_id;

    insert into public.lms_modules (
      course_id,
      position,
      title,
      ce_credits,
      bridge_copy
    ) values (
      v_course_id,
      coalesce((p_payload ->> 'position')::integer, v_position),
      btrim(p_payload ->> 'title'),
      nullif(p_payload ->> 'ce_credits', '')::numeric,
      nullif(btrim(p_payload ->> 'bridge_copy'), '')
    )
    returning * into v_module;
    v_target := jsonb_build_object(
      'module_id', v_module.id,
      'course_id', v_course_id,
      'fields', jsonb_build_array('title', 'ce_credits', 'bridge_copy')
    );
  elsif p_action = 'update_module' then
    v_id := (p_payload ->> 'id')::uuid;
    update public.lms_modules module
    set title = case when p_payload ? 'title'
          then btrim(p_payload ->> 'title') else module.title end,
        ce_credits = case when p_payload ? 'ce_credits'
          then nullif(p_payload ->> 'ce_credits', '')::numeric
          else module.ce_credits end,
        bridge_copy = case when p_payload ? 'bridge_copy'
          then nullif(btrim(p_payload ->> 'bridge_copy'), '')
          else module.bridge_copy end
    where module.id = v_id
    returning * into v_module;
    if not found then
      raise exception 'module unavailable' using errcode = '22023';
    end if;
    v_target := jsonb_build_object(
      'module_id', v_id,
      'fields', to_jsonb(array(
        select jsonb_object_keys(p_payload)
        order by 1
      ))
    );
  else
    raise exception 'module action must be create_module or update_module'
      using errcode = '22023';
  end if;

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    p_action,
    v_target
  );

  return to_jsonb(v_module);
end;
$$;

revoke all on function public.lms_admin_save_module(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_admin_save_module(uuid, text, jsonb)
  to service_role;

comment on function public.lms_admin_save_module(uuid, text, jsonb) is
  'Creates or updates an operator-authored module, including bridge_copy, and writes one audit action.';

create or replace function public.lms_admin_import_question_bank(
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
  v_quiz public.lms_module_quizzes%rowtype;
  v_question jsonb;
  v_question_index integer;
  v_choice jsonb;
  v_choice_index integer;
  v_expected_position integer := 1;
  v_choice_count integer;
  v_correct_count integer;
  v_unknown_id text;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_pass_pct <> 70 then
    raise exception 'field "pass_pct" must equal the published policy value 70'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'field "questions" must be an array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) <> 10 then
    raise exception 'field "questions" must contain exactly 10 questions; received %',
      jsonb_array_length(p_questions) using errcode = '22023';
  end if;

  for v_question, v_question_index in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(p_questions) with ordinality item(value, ordinality)
  loop
    if jsonb_typeof(v_question) <> 'object' then
      raise exception 'question % must be an object', v_question_index
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_question -> 'position') <> 'number'
      or (v_question ->> 'position') !~ '^[0-9]+$'
      or (v_question ->> 'position')::integer <> v_expected_position
    then
      raise exception 'question % field "position" must equal %',
        v_question_index, v_expected_position using errcode = '22023';
    end if;
    if jsonb_typeof(v_question -> 'prompt') <> 'string'
      or btrim(v_question ->> 'prompt') = ''
    then
      raise exception 'question % field "prompt" must be a non-empty string',
        v_expected_position using errcode = '22023';
    end if;
    if jsonb_typeof(v_question -> 'choices') <> 'array' then
      raise exception 'question % field "choices" must be an array',
        v_expected_position using errcode = '22023';
    end if;
    v_choice_count := jsonb_array_length(v_question -> 'choices');
    if v_choice_count < 2 or v_choice_count > 12 then
      raise exception 'question % field "choices" must contain between 2 and 12 items; received %',
        v_expected_position, v_choice_count using errcode = '22023';
    end if;
    for v_choice, v_choice_index in
      select item.value, (item.ordinality - 1)::integer
      from jsonb_array_elements(v_question -> 'choices') with ordinality item(value, ordinality)
    loop
      if jsonb_typeof(v_choice) <> 'object' then
        raise exception 'question % field "choices[%]" must be an object',
          v_expected_position, v_choice_index using errcode = '22023';
      end if;
      if jsonb_typeof(v_choice -> 'id') <> 'string'
        or btrim(v_choice ->> 'id') = ''
      then
        raise exception 'question % field "choices[%].id" must be a non-empty string',
          v_expected_position, v_choice_index using errcode = '22023';
      end if;
      if jsonb_typeof(v_choice -> 'text') <> 'string'
        or btrim(v_choice ->> 'text') = ''
      then
        raise exception 'question % field "choices[%].text" must be a non-empty string',
          v_expected_position, v_choice_index using errcode = '22023';
      end if;
    end loop;
    if (
      select count(*) <> count(distinct choice ->> 'id')
      from jsonb_array_elements(v_question -> 'choices') choice
    ) then
      raise exception 'question % field "choices" contains duplicate ids',
        v_expected_position using errcode = '22023';
    end if;

    if jsonb_typeof(v_question -> 'correct') <> 'array' then
      raise exception 'question % field "correct" must be an array',
        v_expected_position using errcode = '22023';
    end if;
    v_correct_count := jsonb_array_length(v_question -> 'correct');
    if v_correct_count = 0 then
      raise exception 'question % field "correct" must contain at least one choice id',
        v_expected_position using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_question -> 'correct') correct_id
      where jsonb_typeof(correct_id) <> 'string'
        or btrim(correct_id #>> '{}') = ''
    ) then
      raise exception 'question % field "correct" values must be non-empty choice ids',
        v_expected_position using errcode = '22023';
    end if;
    if (
      select count(*) <> count(distinct correct_id #>> '{}')
      from jsonb_array_elements(v_question -> 'correct') correct_id
    ) then
      raise exception 'question % field "correct" contains duplicate choice ids',
        v_expected_position using errcode = '22023';
    end if;
    select correct_id #>> '{}'
    into v_unknown_id
    from jsonb_array_elements(v_question -> 'correct') correct_id
    where not exists (
      select 1
      from jsonb_array_elements(v_question -> 'choices') choice
      where choice ->> 'id' = correct_id #>> '{}'
    )
    limit 1;
    if v_unknown_id is not null then
      raise exception 'question % field "correct" contains unknown choice id "%"',
        v_expected_position, v_unknown_id using errcode = '22023';
    end if;

    v_expected_position := v_expected_position + 1;
    v_unknown_id := null;
  end loop;

  insert into public.lms_module_quizzes (
    module_id,
    question_count,
    pass_pct
  ) values (
    p_module_id,
    10,
    70
  )
  on conflict (module_id) do update
  set question_count = excluded.question_count,
      pass_pct = excluded.pass_pct
  returning * into v_quiz;

  delete from public.lms_quiz_questions
  where quiz_id = v_quiz.id;

  insert into public.lms_quiz_questions (
    quiz_id,
    position,
    prompt,
    choices,
    correct,
    points
  )
  select
    v_quiz.id,
    (question ->> 'position')::integer,
    btrim(question ->> 'prompt'),
    question -> 'choices',
    question -> 'correct',
    1
  from jsonb_array_elements(p_questions) question
  order by (question ->> 'position')::integer;

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    'import_question_bank',
    jsonb_build_object(
      'module_id', p_module_id,
      'quiz_id', v_quiz.id,
      'question_count', 10
    )
  );

  return jsonb_build_object(
    'module_id', p_module_id,
    'quiz_id', v_quiz.id,
    'question_count', 10,
    'pass_pct', 70
  );
end;
$$;

revoke all on function public.lms_admin_import_question_bank(
  uuid, uuid, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.lms_admin_import_question_bank(
  uuid, uuid, integer, jsonb
) to service_role;

comment on function public.lms_admin_import_question_bank(
  uuid, uuid, integer, jsonb
) is 'Replaces a fixed-policy 10-question bank, creating the module quiz when absent and naming every rejected field and question position.';

update public.lms_courses
set description = 'A sandbox edition of the Financial Professional Track with Introduction and Modules 1-4.'
where slug = 'fpt-sandbox'
  and description = 'A four-module preview of the Financial Professional Track.';
