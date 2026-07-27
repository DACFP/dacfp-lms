-- F4 integrity batch: question-bank fidelity, deletion safety, survey-flow
-- preservation, and manual-completion CE reporting controls.

-- A1-5: preserve arbitrary choice counts and multi-answer keys verbatim.
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
  v_expected_position integer := 1;
  v_choice_count integer;
  v_correct_count integer;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if p_pass_pct <> 70 then
    raise exception 'pass_pct is published policy and must remain 70'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_questions) <> 'array'
    or jsonb_array_length(p_questions) <> 10
  then
    raise exception 'question bank must contain exactly 10 questions'
      using errcode = '22023';
  end if;

  select *
  into v_quiz
  from public.lms_module_quizzes quiz
  where quiz.module_id = p_module_id;
  if not found then
    raise exception 'question bank is unavailable' using errcode = '22023';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
      or coalesce((v_question ->> 'position')::integer, 0) <> v_expected_position
      or btrim(coalesce(v_question ->> 'prompt', '')) = ''
    then
      raise exception 'invalid question at position %', v_expected_position
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_question -> 'choices') <> 'array' then
      raise exception 'question % choices must be an array', v_expected_position
        using errcode = '22023';
    end if;
    v_choice_count := jsonb_array_length(v_question -> 'choices');
    if v_choice_count < 2 or v_choice_count > 12 then
      raise exception 'question % choices must contain between 2 and 12 items',
        v_expected_position using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_question -> 'choices') choice
      where jsonb_typeof(choice) <> 'object'
        or btrim(coalesce(choice ->> 'id', '')) = ''
        or btrim(coalesce(choice ->> 'text', '')) = ''
    ) then
      raise exception 'question % choices require non-empty id and text values',
        v_expected_position using errcode = '22023';
    end if;
    if (
      select count(*) <> count(distinct choice ->> 'id')
      from jsonb_array_elements(v_question -> 'choices') choice
    ) then
      raise exception 'question % choice ids must be unique', v_expected_position
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_question -> 'correct') <> 'array' then
      raise exception 'question % correct must be an array', v_expected_position
        using errcode = '22023';
    end if;
    v_correct_count := jsonb_array_length(v_question -> 'correct');
    if v_correct_count = 0 then
      raise exception 'question % correct must contain at least one choice id',
        v_expected_position using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_question -> 'correct') correct_id
      where jsonb_typeof(correct_id) <> 'string'
    ) then
      raise exception 'question % correct values must be choice ids',
        v_expected_position using errcode = '22023';
    end if;
    if (
      select count(*) <> count(distinct correct_id #>> '{}')
      from jsonb_array_elements(v_question -> 'correct') correct_id
    ) then
      raise exception 'question % correct choice ids must be unique',
        v_expected_position using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_question -> 'correct') correct_id
      where not exists (
        select 1
        from jsonb_array_elements(v_question -> 'choices') choice
        where choice ->> 'id' = correct_id #>> '{}'
      )
    ) then
      raise exception 'question % correct contains an unknown choice id',
        v_expected_position using errcode = '22023';
    end if;

    v_expected_position := v_expected_position + 1;
  end loop;

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

  update public.lms_module_quizzes
  set question_count = 10,
      pass_pct = 70
  where id = v_quiz.id;

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

-- A1-4: all structural deletions compact surviving siblings in the same
-- transaction, regardless of which service issued the delete.
create or replace function public.lms_renumber_modules_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lms_modules module
  set position = module.position + 1000000
  where module.course_id = old.course_id;

  with ordered as (
    select
      module.id,
      row_number() over (order by module.position, module.id)::integer as position
    from public.lms_modules module
    where module.course_id = old.course_id
  )
  update public.lms_modules module
  set position = ordered.position
  from ordered
  where module.id = ordered.id;
  return old;
end;
$$;

create or replace function public.lms_renumber_lessons_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lms_lessons lesson
  set position = lesson.position + 1000000
  where lesson.module_id = old.module_id;

  with ordered as (
    select
      lesson.id,
      row_number() over (order by lesson.position, lesson.id)::integer as position
    from public.lms_lessons lesson
    where lesson.module_id = old.module_id
  )
  update public.lms_lessons lesson
  set position = ordered.position
  from ordered
  where lesson.id = ordered.id;
  return old;
end;
$$;

drop trigger if exists lms_modules_renumber_after_delete
  on public.lms_modules;
create trigger lms_modules_renumber_after_delete
after delete on public.lms_modules
for each row execute function public.lms_renumber_modules_after_delete();

drop trigger if exists lms_lessons_renumber_after_delete
  on public.lms_lessons;
create trigger lms_lessons_renumber_after_delete
after delete on public.lms_lessons
for each row execute function public.lms_renumber_lessons_after_delete();

revoke all on function public.lms_renumber_modules_after_delete()
  from public, anon, authenticated;
revoke all on function public.lms_renumber_lessons_after_delete()
  from public, anon, authenticated;

-- A1-18: both write paths and the row trigger enforce the same choice shape.
create or replace function public.lms_validate_survey_question_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  choice jsonb;
  route record;
begin
  if not exists (
    select 1
    from public.lms_lessons lesson
    join public.lms_survey_sections section
      on section.lesson_id = lesson.id
    where lesson.id = new.lesson_id
      and lesson.kind = 'survey'
      and section.id = new.section_id
  ) then
    raise exception 'survey question section must match its survey lesson'
      using errcode = '23514';
  end if;

  if new.kind in ('single_choice', 'multi_choice') then
    if jsonb_typeof(new.choices) <> 'array'
      or jsonb_array_length(new.choices) < 2
    then
      raise exception 'survey choice questions require at least two choices'
        using errcode = '23514';
    end if;
    for choice in select value from jsonb_array_elements(new.choices) loop
      if jsonb_typeof(choice) <> 'object'
        or btrim(coalesce(choice ->> 'id', '')) = ''
        or btrim(coalesce(choice ->> 'text', '')) = ''
        or (
          choice ? 'allow_free_text'
          and jsonb_typeof(choice -> 'allow_free_text') <> 'boolean'
        )
      then
        raise exception 'survey choices require id, text, and optional boolean allow_free_text'
          using errcode = '23514';
      end if;
    end loop;
    if (
      select count(*) <> count(distinct value ->> 'id')
      from jsonb_array_elements(new.choices)
    ) then
      raise exception 'survey choice ids must be unique'
        using errcode = '23514';
    end if;
  elsif new.choices is not null then
    raise exception 'non-choice survey questions cannot define choices'
      using errcode = '23514';
  end if;

  if new.routes is not null then
    if new.kind <> 'single_choice' then
      raise exception 'survey routes are valid only on single_choice questions'
        using errcode = '23514';
    end if;
    if new.routes = '{}'::jsonb then
      raise exception 'survey routes must be null or contain at least one route'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.lms_survey_questions existing
      where existing.section_id = new.section_id
        and existing.id <> new.id
        and existing.routes is not null
    ) then
      raise exception 'a survey section may contain only one routing gate'
        using errcode = '23514';
    end if;
    for route in select key, value from jsonb_each_text(new.routes) loop
      if not exists (
        select 1
        from jsonb_array_elements(new.choices) choice_row
        where choice_row ->> 'id' = route.key
      ) then
        raise exception 'survey route choice is not defined on the gate question'
          using errcode = '23514';
      end if;
      if not exists (
        select 1
        from public.lms_survey_sections target
        where target.id = route.value::uuid
          and target.lesson_id = new.lesson_id
      ) then
        raise exception 'survey route target must belong to the same lesson'
          using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- A1-8 / A1-18: preserve supplied section/question IDs and require explicit
-- confirmation before deleting a section referenced by an immutable response.
drop function if exists public.lms_admin_replace_survey_flow(
  uuid, uuid, jsonb
);

create function public.lms_admin_replace_survey_flow(
  p_actor_auth_user_id uuid,
  p_lesson_id uuid,
  p_sections jsonb,
  p_confirm_orphan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section jsonb;
  v_question jsonb;
  v_expected_section_position integer := 1;
  v_expected_question_position integer;
  v_section_id uuid;
  v_question_id uuid;
  v_question_kind text;
  v_question_choices jsonb;
  v_affected_response_count integer := 0;
  v_outline text;
  v_section_rows jsonb;
  v_question_rows jsonb;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.lms_lessons lesson
    where lesson.id = p_lesson_id
      and lesson.kind = 'survey'
  ) then
    raise exception 'survey lesson unavailable' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sections) <> 'array'
    or jsonb_array_length(p_sections) = 0
  then
    raise exception 'sections must be a non-empty array'
      using errcode = '22023';
  end if;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    if not (v_section ? 'id')
      or nullif(btrim(v_section ->> 'id'), '') is null
    then
      raise exception 'survey section id is required'
        using errcode = '22023';
    end if;
    begin
      v_section_id := (v_section ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'survey section id is invalid'
        using errcode = '22023';
    end;
    if coalesce((v_section ->> 'position')::integer, 0)
        <> v_expected_section_position
      or jsonb_typeof(v_section -> 'questions') <> 'array'
    then
      raise exception 'invalid survey section at position %',
        v_expected_section_position using errcode = '22023';
    end if;
    if nullif(v_section ->> 'default_next_section_id', '') is not null then
      begin
        perform (v_section ->> 'default_next_section_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'survey default next section id is invalid'
          using errcode = '22023';
      end;
    end if;

    v_expected_question_position := 1;
    for v_question in
      select value from jsonb_array_elements(v_section -> 'questions')
    loop
      if not (v_question ? 'id')
        or nullif(btrim(v_question ->> 'id'), '') is null
      then
        raise exception 'survey question id is required'
          using errcode = '22023';
      end if;
      begin
        v_question_id := (v_question ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'survey question id is invalid'
          using errcode = '22023';
      end;
      v_question_kind := v_question ->> 'kind';
      v_question_choices := v_question -> 'choices';
      if coalesce((v_question ->> 'position')::integer, 0)
          <> v_expected_question_position
        or btrim(coalesce(v_question ->> 'prompt', '')) = ''
        or v_question_kind not in (
          'scale_1_5', 'text', 'single_choice', 'multi_choice'
        )
        or (
          v_question_kind in ('scale_1_5', 'text')
          and v_question_choices is not null
          and v_question_choices <> 'null'::jsonb
        )
        or (
          v_question_kind in ('single_choice', 'multi_choice')
          and (
            jsonb_typeof(v_question_choices) <> 'array'
            or jsonb_array_length(v_question_choices) < 2
          )
        )
      then
        raise exception 'invalid survey question at section %, position %',
          v_expected_section_position,
          v_expected_question_position using errcode = '22023';
      end if;
      if v_question_kind in ('single_choice', 'multi_choice')
        and exists (
          select 1
          from jsonb_array_elements(v_question_choices) choice
          where jsonb_typeof(choice) <> 'object'
            or btrim(coalesce(choice ->> 'id', '')) = ''
            or btrim(coalesce(choice ->> 'text', '')) = ''
            or (
              choice ? 'allow_free_text'
              and jsonb_typeof(choice -> 'allow_free_text') <> 'boolean'
            )
        )
      then
        raise exception 'invalid survey choices at section %, position %',
          v_expected_section_position,
          v_expected_question_position using errcode = '22023';
      end if;
      v_expected_question_position := v_expected_question_position + 1;
    end loop;
    v_expected_section_position := v_expected_section_position + 1;
  end loop;

  if (
    select count(*) <> count(distinct section ->> 'id')
    from jsonb_array_elements(p_sections) section
  ) then
    raise exception 'survey section ids must be unique'
      using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct question ->> 'id')
    from jsonb_array_elements(p_sections) section
    cross join lateral jsonb_array_elements(section -> 'questions') question
  ) then
    raise exception 'survey question ids must be unique'
      using errcode = '22023';
  end if;

  with incoming_sections as (
    select (section ->> 'id')::uuid as id
    from jsonb_array_elements(p_sections) section
  ), removed_sections as (
    select section.id
    from public.lms_survey_sections section
    where section.lesson_id = p_lesson_id
      and not exists (
        select 1
        from incoming_sections incoming
        where incoming.id = section.id
      )
  )
  select count(distinct response.id)::integer
  into v_affected_response_count
  from public.lms_survey_responses response
  join removed_sections removed
    on removed.id = any (response.path)
  where response.lesson_id = p_lesson_id;

  if v_affected_response_count > 0
    and not coalesce(p_confirm_orphan, false)
  then
    raise exception
      'SURVEY_ORPHAN_CONFIRMATION_REQUIRED: % affected response(s)',
      v_affected_response_count using errcode = '22023';
  end if;

  update public.lms_survey_sections
  set default_next_section_id = null,
      position = position + 1000000
  where lesson_id = p_lesson_id;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    v_section_id := (v_section ->> 'id')::uuid;
    insert into public.lms_survey_sections (
      id,
      lesson_id,
      position,
      title,
      default_next_section_id
    ) values (
      v_section_id,
      p_lesson_id,
      (v_section ->> 'position')::integer,
      nullif(btrim(coalesce(v_section ->> 'title', '')), ''),
      null
    )
    on conflict (id) do update
    set lesson_id = excluded.lesson_id,
        position = excluded.position,
        title = excluded.title,
        default_next_section_id = null;
  end loop;

  update public.lms_survey_questions
  set routes = null,
      position = position + 1000000
  where lesson_id = p_lesson_id;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    v_section_id := (v_section ->> 'id')::uuid;
    for v_question in
      select value from jsonb_array_elements(v_section -> 'questions')
    loop
      v_question_id := (v_question ->> 'id')::uuid;
      insert into public.lms_survey_questions (
        id,
        lesson_id,
        section_id,
        position,
        prompt,
        kind,
        choices,
        required,
        routes
      ) values (
        v_question_id,
        p_lesson_id,
        v_section_id,
        (v_question ->> 'position')::integer,
        btrim(v_question ->> 'prompt'),
        v_question ->> 'kind',
        case
          when v_question ->> 'kind' in ('single_choice', 'multi_choice')
            then v_question -> 'choices'
          else null
        end,
        coalesce((v_question ->> 'required')::boolean, true),
        case
          when v_question ? 'routes'
            and v_question -> 'routes' <> 'null'::jsonb
            then v_question -> 'routes'
          else null
        end
      )
      on conflict (id) do update
      set lesson_id = excluded.lesson_id,
          section_id = excluded.section_id,
          position = excluded.position,
          prompt = excluded.prompt,
          kind = excluded.kind,
          choices = excluded.choices,
          required = excluded.required,
          routes = excluded.routes;
    end loop;
  end loop;

  delete from public.lms_survey_questions question
  where question.lesson_id = p_lesson_id
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) section
      cross join lateral jsonb_array_elements(section -> 'questions') incoming
      where (incoming ->> 'id')::uuid = question.id
    );

  delete from public.lms_survey_sections section
  where section.lesson_id = p_lesson_id
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) incoming
      where (incoming ->> 'id')::uuid = section.id
    );

  for v_section in select value from jsonb_array_elements(p_sections) loop
    update public.lms_survey_sections
    set default_next_section_id =
      nullif(v_section ->> 'default_next_section_id', '')::uuid
    where id = (v_section ->> 'id')::uuid;
  end loop;

  v_outline := public.lms_assert_survey_flow(p_lesson_id);
  select jsonb_agg(to_jsonb(section_row) order by section_row.position)
  into v_section_rows
  from public.lms_survey_sections section_row
  where section_row.lesson_id = p_lesson_id;
  select jsonb_agg(
    to_jsonb(question_row)
    order by question_row.section_id, question_row.position
  )
  into v_question_rows
  from public.lms_survey_questions question_row
  where question_row.lesson_id = p_lesson_id;

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    'replace_survey_flow',
    jsonb_build_object(
      'lesson_id', p_lesson_id,
      'section_count', jsonb_array_length(p_sections),
      'affected_response_count', v_affected_response_count,
      'confirmed_orphan', coalesce(p_confirm_orphan, false),
      'outline', v_outline
    )
  );

  return jsonb_build_object(
    'outline', v_outline,
    'sections', coalesce(v_section_rows, '[]'::jsonb),
    'questions', coalesce(v_question_rows, '[]'::jsonb),
    'affected_response_count', v_affected_response_count,
    'confirmed_orphan', coalesce(p_confirm_orphan, false)
  );
end;
$$;

revoke all on function public.lms_admin_replace_survey_flow(
  uuid, uuid, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_replace_survey_flow(
  uuid, uuid, jsonb, boolean
) to service_role;

-- A1-13: carry completion provenance into preview/frozen rows and require an
-- explicit operator opt-in before a manual completion can enter a run.
drop function if exists public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean
);
drop function if exists public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean
);
drop function if exists public.lms_ce_report_candidates(
  uuid[], date, date, boolean
);

create function public.lms_ce_report_candidates(
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_include_already_reported boolean,
  p_include_manual boolean
)
returns table (
  completion_id uuid,
  completed_at timestamptz,
  person_email text,
  completion_trigger text,
  bucket text,
  excluded_reason text,
  already_reported boolean,
  selected_for_run boolean,
  row_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate_base as (
    select
      completion.id as completion_id,
      completion.completed_at,
      completion.trigger as completion_trigger,
      enrollment.person_email,
      course.id as course_id,
      course.cfp_program_id,
      profile.auth_user_id as profile_id,
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.credential_ids,
      exists (
        select 1
        from public.lms_ce_report_runs prior_run
        cross join lateral jsonb_array_elements(prior_run.rows) prior_row
        where prior_row ->> 'completion_id' = completion.id::text
      ) as already_reported
    from public.lms_completion_events completion
    join public.lms_enrollments enrollment
      on enrollment.id = completion.enrollment_id
    join public.lms_courses course
      on course.id = enrollment.course_id
    left join public.lms_learner_profiles profile
      on profile.auth_user_id = enrollment.auth_user_id
    where course.id = any (p_course_ids)
      and completion.completed_at >= (
        p_period_start::timestamp at time zone 'America/Phoenix'
      )
      and completion.completed_at < (
        (p_period_end + 1)::timestamp at time zone 'America/Phoenix'
      )
  ), classified as (
    select
      candidate_base.*,
      case
        when profile_id is null then 'no-profile'
        when nullif(btrim(cfp_program_id), '') is null then 'no-program-id'
        when credential_ids ? 'cfp'
          and jsonb_typeof(credential_ids -> 'cfp') <> 'string'
          then 'non-string-cfp'
        when nullif(btrim(first_name), '') is null
          or nullif(btrim(last_name), '') is null
          then 'blank-name'
        else null
      end as excluded_reason,
      case
        when jsonb_typeof(credential_ids -> 'cfp') = 'string'
          then btrim(credential_ids ->> 'cfp')
        else ''
      end as cfp_id
    from candidate_base
  ), bucketed as (
    select
      classified.*,
      case
        when excluded_reason is not null then 'excluded'
        when cfp_id = '' then 'missing_id'
        else 'reportable'
      end as bucket
    from classified
  )
  select
    bucketed.completion_id,
    bucketed.completed_at,
    bucketed.person_email,
    bucketed.completion_trigger,
    bucketed.bucket,
    bucketed.excluded_reason,
    bucketed.already_reported,
    bucketed.bucket = 'reportable'
      and (p_include_already_reported or not bucketed.already_reported)
      and (
        p_include_manual
        or bucketed.completion_trigger <> 'manual_admin'
      ) as selected_for_run,
    jsonb_build_object(
      'completion_id', bucketed.completion_id,
      'course_id', bucketed.course_id,
      'person_email', bucketed.person_email,
      'trigger', bucketed.completion_trigger,
      'cfp_program_id', coalesce(bucketed.cfp_program_id, ''),
      'date_individual_completed', to_char(
        bucketed.completed_at at time zone 'America/Phoenix',
        'YYYY-MM-DD'
      ),
      'attendee_cfp_board_id', bucketed.cfp_id,
      'attendee_last_name', coalesce(bucketed.last_name, ''),
      'attendee_first_name', coalesce(bucketed.first_name, ''),
      'attendee_middle_name', coalesce(bucketed.middle_name, '')
    ) as row_data
  from bucketed;
$$;

revoke all on function public.lms_ce_report_candidates(
  uuid[], date, date, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.lms_ce_report_candidates(
  uuid[], date, date, boolean, boolean
) to service_role;

create function public.lms_admin_preview_ce_report(
  p_actor_auth_user_id uuid,
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_include_already_reported boolean default false,
  p_include_manual boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reportable jsonb;
  v_manual jsonb;
  v_missing_id jsonb;
  v_already_reported jsonb;
  v_excluded jsonb;
  v_pending_program_courses jsonb;
  v_nudge_count integer;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_course_ids), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
  then
    raise exception 'invalid CE report scope' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_course_ids) supplied_course_id
    where not exists (
      select 1
      from public.lms_courses course
      where course.id = supplied_course_id
    )
  ) then
    raise exception 'invalid CE report course' using errcode = '22023';
  end if;

  select
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (where candidate.selected_for_run),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (
          where candidate.bucket = 'reportable'
            and candidate.completion_trigger = 'manual_admin'
            and not p_include_manual
            and not candidate.already_reported
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (
          where candidate.bucket = 'missing_id'
            and not candidate.already_reported
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (
          where candidate.already_reported
            and candidate.bucket <> 'excluded'
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        candidate.row_data
          || jsonb_build_object('reason', candidate.excluded_reason)
        order by candidate.completed_at, candidate.person_email
      ) filter (where candidate.bucket = 'excluded'),
      '[]'::jsonb
    )
  into
    v_reportable,
    v_manual,
    v_missing_id,
    v_already_reported,
    v_excluded
  from public.lms_ce_report_candidates(
    p_course_ids,
    p_period_start,
    p_period_end,
    p_include_already_reported,
    p_include_manual
  ) candidate;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', course.id, 'title', course.title)
      order by course.title
    ),
    '[]'::jsonb
  )
  into v_pending_program_courses
  from public.lms_courses course
  where course.id = any (p_course_ids)
    and nullif(btrim(course.cfp_program_id), '') is null;

  select count(*)::integer
  into v_nudge_count
  from public.lms_completion_events completion
  join public.lms_enrollments enrollment
    on enrollment.id = completion.enrollment_id
  join public.lms_courses course
    on course.id = enrollment.course_id
  where course.id = any (p_course_ids)
    and nullif(btrim(course.cfp_program_id), '') is not null
    and completion.completed_at <= now() - interval '10 days'
    and not exists (
      select 1
      from public.lms_ce_report_runs prior_run
      cross join lateral jsonb_array_elements(prior_run.rows) prior_row
      where prior_row ->> 'completion_id' = completion.id::text
    );

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'reportable', v_reportable,
    'manual', v_manual,
    'missing_id', v_missing_id,
    'already_reported', v_already_reported,
    'excluded', v_excluded,
    'pending_program_courses', v_pending_program_courses,
    'nudge_count', v_nudge_count
  );
end;
$$;

revoke all on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean, boolean
) to service_role;

create function public.lms_admin_create_ce_report_run(
  p_actor_auth_user_id uuid,
  p_course_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_completion_ids uuid[],
  p_include_already_reported boolean default false,
  p_include_manual boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live_ids uuid[];
  v_preview_ids uuid[];
  v_rows jsonb;
  v_filename text;
  v_run public.lms_ce_report_runs%rowtype;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_course_ids), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
  then
    raise exception 'invalid CE report scope' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_course_ids) supplied_course_id
    where not exists (
      select 1
      from public.lms_courses course
      where course.id = supplied_course_id
    )
  ) then
    raise exception 'invalid CE report course' using errcode = '22023';
  end if;

  select
    coalesce(
      array_agg(candidate.completion_id order by candidate.completion_id)
        filter (where candidate.selected_for_run),
      '{}'::uuid[]
    ),
    coalesce(
      jsonb_agg(candidate.row_data order by candidate.completed_at, candidate.person_email)
        filter (where candidate.selected_for_run),
      '[]'::jsonb
    )
  into v_live_ids, v_rows
  from public.lms_ce_report_candidates(
    p_course_ids,
    p_period_start,
    p_period_end,
    p_include_already_reported,
    p_include_manual
  ) candidate;

  if cardinality(v_live_ids) = 0 then
    raise exception 'no reportable completions' using errcode = '22023';
  end if;

  select coalesce(
    array_agg(distinct supplied_id order by supplied_id),
    '{}'::uuid[]
  )
  into v_preview_ids
  from unnest(coalesce(p_completion_ids, '{}'::uuid[])) supplied_id;

  if cardinality(v_preview_ids) <> coalesce(cardinality(p_completion_ids), 0)
    or v_preview_ids <> v_live_ids
  then
    raise exception 'CE report candidates changed; run preview again'
      using errcode = '22023';
  end if;

  v_filename := format(
    'cfp-ce-%s-through-%s.xlsx',
    to_char(p_period_start, 'YYYY-MM-DD'),
    to_char(p_period_end, 'YYYY-MM-DD')
  );

  insert into public.lms_ce_report_runs (
    actor_auth_user_id,
    course_ids,
    period_start,
    period_end,
    row_count,
    rows,
    filename
  ) values (
    p_actor_auth_user_id,
    p_course_ids,
    p_period_start,
    p_period_end,
    jsonb_array_length(v_rows),
    v_rows,
    v_filename
  )
  returning * into v_run;

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    'export_cfp_ce_report',
    jsonb_build_object(
      'run_id', v_run.id,
      'course_ids', to_jsonb(p_course_ids),
      'period_start', p_period_start,
      'period_end', p_period_end,
      'completion_ids', to_jsonb(v_preview_ids),
      'row_count', v_run.row_count,
      'include_already_reported', p_include_already_reported,
      'include_manual', p_include_manual
    )
  );

  return to_jsonb(v_run);
end;
$$;

revoke all on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean, boolean
) from public, anon, authenticated;
grant execute on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean, boolean
) to service_role;

comment on function public.lms_admin_import_question_bank(
  uuid, uuid, integer, jsonb
) is 'Imports a lossless dacfp-question-bank-v1 module question array.';
comment on function public.lms_admin_replace_survey_flow(
  uuid, uuid, jsonb, boolean
) is 'Updates a routed survey in place and requires confirmation before orphaning response paths.';
comment on function public.lms_admin_preview_ce_report(
  uuid, uuid[], date, date, boolean, boolean
) is 'Previews CE candidates with completion provenance and manual-completion opt-in.';
comment on function public.lms_admin_create_ce_report_run(
  uuid, uuid[], date, date, uuid[], boolean, boolean
) is 'Freezes the approved CE candidates, excluding manual completions unless opted in.';
