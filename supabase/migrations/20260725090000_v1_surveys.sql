alter table public.lms_lessons
  drop constraint if exists lms_lessons_kind_check;

alter table public.lms_lessons
  add constraint lms_lessons_kind_check
  check (kind in ('video', 'reading', 'survey'));

create table public.lms_survey_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null
    references public.lms_lessons (id) on delete cascade,
  position integer not null check (position >= 1),
  prompt text not null check (btrim(prompt) <> ''),
  kind text not null check (
    kind in ('scale_1_5', 'text', 'single_choice', 'multi_choice')
  ),
  choices jsonb null,
  required boolean not null default true,
  unique (lesson_id, position),
  constraint lms_survey_questions_choices_shape check (
    (kind in ('scale_1_5', 'text') and choices is null)
    or (
      kind in ('single_choice', 'multi_choice')
      and jsonb_typeof(choices) = 'array'
      and jsonb_array_length(choices) >= 2
    )
  )
);

create table public.lms_survey_responses (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
    references public.lms_enrollments (id) on delete cascade,
  lesson_id uuid not null
    references public.lms_lessons (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  unique (enrollment_id, lesson_id)
);

create index lms_survey_questions_lesson_id_idx
  on public.lms_survey_questions (lesson_id);
create index lms_survey_responses_enrollment_id_idx
  on public.lms_survey_responses (enrollment_id);
create index lms_survey_responses_lesson_id_idx
  on public.lms_survey_responses (lesson_id);

create function public.lms_validate_survey_question_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.lms_lessons lesson
    where lesson.id = new.lesson_id
      and lesson.kind = 'survey'
  ) then
    raise exception 'survey questions require a survey lesson'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lms_survey_questions_require_survey_lesson
before insert or update on public.lms_survey_questions
for each row execute function public.lms_validate_survey_question_lesson();

create function public.lms_validate_survey_response_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.lms_enrollments enrollment
    join public.lms_modules module
      on module.course_id = enrollment.course_id
    join public.lms_lessons lesson
      on lesson.module_id = module.id
    where enrollment.id = new.enrollment_id
      and lesson.id = new.lesson_id
      and lesson.kind = 'survey'
  ) then
    raise exception 'survey response does not match its enrollment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lms_survey_responses_require_matching_lesson
before insert or update on public.lms_survey_responses
for each row execute function public.lms_validate_survey_response_lesson();

alter table public.lms_survey_questions enable row level security;
alter table public.lms_survey_questions force row level security;
alter table public.lms_survey_responses enable row level security;
alter table public.lms_survey_responses force row level security;

revoke all on table public.lms_survey_questions from public, anon, authenticated;
revoke all on table public.lms_survey_responses from public, anon, authenticated;
grant all on table public.lms_survey_questions to service_role;
grant all on table public.lms_survey_responses to service_role;
grant select on table public.lms_survey_questions to authenticated;
grant select, insert on table public.lms_survey_responses to authenticated;

create policy lms_survey_questions_select_accessible
on public.lms_survey_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_lessons lesson
    join public.lms_modules module on module.id = lesson.module_id
    where lesson.id = lesson_id
      and lesson.kind = 'survey'
      and lms_private.lms_has_course_access(module.course_id, true, true)
  )
);

create policy lms_survey_responses_select_own
on public.lms_survey_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments enrollment
    where enrollment.id = enrollment_id
      and enrollment.auth_user_id = (select auth.uid())
  )
);

create policy lms_survey_responses_insert_own
on public.lms_survey_responses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.lms_enrollments enrollment
    join public.lms_lessons lesson on lesson.id = lesson_id
    join public.lms_modules module on module.id = lesson.module_id
    where enrollment.id = enrollment_id
      and enrollment.auth_user_id = (select auth.uid())
      and enrollment.course_id = module.course_id
      and enrollment.status = 'active'
      and (enrollment.expires_at is null or enrollment.expires_at > now())
      and lesson.kind = 'survey'
      and lms_private.lms_has_course_access(module.course_id, true, true)
  )
);

create function public.lms_admin_replace_survey_questions(
  p_actor_auth_user_id uuid,
  p_lesson_id uuid,
  p_questions jsonb
)
returns setof public.lms_survey_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  question jsonb;
  expected_position integer := 1;
  question_kind text;
  question_choices jsonb;
begin
  if not public.lms_admin_actor_is_operator(p_actor_auth_user_id) then
    raise exception 'admin unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lms_lessons lesson
    where lesson.id = p_lesson_id and lesson.kind = 'survey'
  ) then
    raise exception 'survey lesson unavailable' using errcode = '22023';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'questions must be an array' using errcode = '22023';
  end if;

  for question in select value from jsonb_array_elements(p_questions) loop
    question_kind := question ->> 'kind';
    question_choices := question -> 'choices';
    if coalesce((question ->> 'position')::integer, 0) <> expected_position
      or btrim(coalesce(question ->> 'prompt', '')) = ''
      or question_kind not in (
        'scale_1_5',
        'text',
        'single_choice',
        'multi_choice'
      )
      or (
        question_kind in ('scale_1_5', 'text')
        and question_choices is not null
        and question_choices <> 'null'::jsonb
      )
      or (
        question_kind in ('single_choice', 'multi_choice')
        and (
          jsonb_typeof(question_choices) <> 'array'
          or jsonb_array_length(question_choices) < 2
        )
      )
    then
      raise exception 'invalid survey question at position %', expected_position
        using errcode = '22023';
    end if;
    expected_position := expected_position + 1;
  end loop;

  delete from public.lms_survey_questions
  where lesson_id = p_lesson_id;

  insert into public.lms_survey_questions (
    id,
    lesson_id,
    position,
    prompt,
    kind,
    choices,
    required
  )
  select
    coalesce(nullif(value ->> 'id', '')::uuid, gen_random_uuid()),
    p_lesson_id,
    (value ->> 'position')::integer,
    btrim(value ->> 'prompt'),
    value ->> 'kind',
    case
      when value ->> 'kind' in ('single_choice', 'multi_choice')
        then value -> 'choices'
      else null
    end,
    coalesce((value ->> 'required')::boolean, true)
  from jsonb_array_elements(p_questions);

  insert into public.lms_admin_actions (
    actor_auth_user_id,
    action,
    target
  ) values (
    p_actor_auth_user_id,
    'replace_survey_questions',
    jsonb_build_object(
      'lesson_id', p_lesson_id,
      'question_count', jsonb_array_length(p_questions)
    )
  );

  return query
  select question_row.*
  from public.lms_survey_questions question_row
  where question_row.lesson_id = p_lesson_id
  order by question_row.position;
end;
$$;

revoke all on function public.lms_admin_replace_survey_questions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_admin_replace_survey_questions(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.lms_validate_survey_question_lesson()
  from public, anon, authenticated;
revoke all on function public.lms_validate_survey_response_lesson()
  from public, anon, authenticated;
grant execute on function public.lms_validate_survey_question_lesson()
  to service_role;
grant execute on function public.lms_validate_survey_response_lesson()
  to service_role;

comment on table public.lms_survey_questions is
  'Survey question definitions attached only to survey lessons.';
comment on table public.lms_survey_responses is
  'Immutable one-submit learner survey responses scoped by enrollment.';
