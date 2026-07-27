# Session V1b Gate Report — routed survey sections

Status: **V1b gate reached; stopped before merge.**

Branch: `codex/v1b-branching`

Sandbox: `xfvaohvismisfdggfdfj` only. Supabase calls through final remote snapshot: 29.

## 1. Ordered preflight

- Remote: `git@github-dacfp:DACFP/dacfp-lms.git`.
- Starting branch/worktree: clean `main`, tracking `origin/main`.
- V1 merge present: `c4cb54c Merge Session V1 surveys`.
- `V1B-SPEC.md` and `docs/cbda-survey-question-structure.md` were committed at `17bec70`.
- `grep -c PRODUCTION-REF-REDACTED SPEC.md` printed `0`.
- `SPEC.md` header is v3.2.
- MCP configuration exposed only `xfvaohvismisfdggfdfj`. No production project call was made.

## 2. Migration and V1 backfill

Applied through Supabase MCP `apply_migration`:

1. `20260727151608 v1b_survey_branching`
2. `20260727152200 v1b_survey_branching_fk_indexes`

Post-migration schema proof:

- `lms_survey_sections` exists with RLS enabled.
- All 3 pre-existing flat survey lessons were backfilled to one section.
- Question rows with null `section_id`: 0.
- Response rows with null `path`: 0.
- `lms_assert_survey_flow(uuid)` and `lms_admin_replace_survey_flow(uuid,uuid,jsonb)` exist.
- The two flat V1 fixtures remain valid:
  - Module 1 survey: 1 section, 2 questions, 6 responses, 0 invalid paths, 0 missing traversed required answers.
  - Post-course survey: 1 section, 3 questions, 3 responses, 0 invalid paths, 0 missing traversed required answers.

The full applied SQL is reproduced in Appendices A and B.

## 3. Wet routed-flow run

The live sandbox fixture is model-only placeholder content:

```text
§1 Starting questions → gate Q2: Owner path→§2, Non-owner path→§4, Other path→§5; default→§6
§2 Owner path → gate Q1: Platform detail path→§3; default→§6
§3 Owner platform path → §6
§4 Non-owner path → §6
§5 Other path → §6
§6 Shared closing questions → submit
```

Two synthetic enrollments cover distinct paths:

- `near-expiry@example.test`: spine → owner → owner-platform → shared tail; 5 answers.
- `midmodule@example.test`: spine → other → shared tail; 3 answers plus nested option-level free text.

Wet assertions:

- Recorded responses: 2.
- Missing required answers in traversed sections: 0.
- Answers retained from untraversed sections: 0.
- Stale owner answers after rerouting to Other: discarded.
- Ordered response path: recorded on both rows.
- Selected Other detail: recorded under the selected option.

## 4. Admin outline, branch-aware results, and path distribution

The live validator produced the outline in section 3.

Per-question denominators from the two live paths:

- Spine question: 2.
- Owner gate: 1.
- Owner-platform detail: 1.
- Non-owner detail: 0.
- Shared-tail question: 2.

Path distribution:

- Starting questions → Other path → Shared closing questions: 1.
- Starting questions → Owner path → Owner platform path → Shared closing questions: 1.

The admin UI now supports expandable section editing, section reorder/default edges, choice-level route overrides, option-level free text, the validator outline, per-question path denominators, free text under its option, and route distribution.

## 5. CSV gate

Live DB-backed CSV preview:

```csv
"email","survey","path","familiarity","primary gate","owner gate","owner detail","non-owner reason","shared tail"
"midmodule@example.test","Pre-course survey","§1 Starting questions > §5 Other path > §6 Shared closing questions","3","Other path: Synthetic other route detail","","","","Synthetic shared-tail answer"
"near-expiry@example.test","Pre-course survey","§1 Starting questions > §2 Owner path > §3 Owner platform path > §6 Shared closing questions","4","Owner path","Platform detail path","Synthetic owner platform detail","","Synthetic shared-tail answer"
```

Assertions:

- `path` column present.
- Owner row leaves the untraversed non-owner field blank.
- Other row leaves all owner and non-owner fields blank.
- Other free text is rendered under the selected option.

## 6. Negative cycle test

A savepoint-only mutation pointed the shared tail back to the spine.

- Rejected: true.
- Error: `survey flow contains a cycle`.
- Mutation rolled back: tail restored to submit/end.
- Original flow remained valid.

## 7. Engine and Edge Function evidence

- `src/engine/progression.ts`: no implementation diff.
- Existing progression copy remains byte-identical to the submit Edge Function copy.
- New `src/survey/routing.ts` is byte-identical to `supabase/functions/lms-submit-survey/routing.ts`.
- Identity tests passed.
- `lms-admin` deployed ACTIVE as version 5 with JWT verification enabled.
- `lms-submit-survey` deployed ACTIVE as version 2 with JWT verification enabled.

Exact Edge Function patches are in [V1B-FUNCTION-DIFF.patch](./V1B-FUNCTION-DIFF.patch).

## 8. Automated verification

Baseline before V1b: 21 files, 173 tests.

V1b result:

```text
Test Files  23 passed (23)
Tests       181 passed (181)
Duration    18.02s
```

Also passed:

- `npm run lint`
- `npm run build`
- `git diff --check`
- progression copy `cmp`
- routing copy `cmp`
- repository production-ref search: no matches

The Vite build emitted only its existing chunk-size advisory. The admin integration test timeout was raised to 20 seconds because that single test now exercises the full routed editor save, validator outline, branch denominator, and path-distribution UI.

Complete command output is in [V1B-TEST-OUTPUT.txt](./V1B-TEST-OUTPUT.txt).

## 9. Advisor evidence

Security advisor: no new V1b finding. Existing notices remain for two intentionally non-readable RLS tables, the pre-existing terms RPC, and leaked-password protection configuration.

Performance advisor initially identified both new composite foreign keys as unindexed. Appendix B added the covering indexes; a second advisor run confirmed those findings were removed. The resulting indexes are reported as unused because they were newly created; older unused-index notices also remain.

## 10. Delivery boundary

The implementation is complete at the V1b gate. Commit and push evidence is reported with the final handoff after the gate-report commit is created. No merge was attempted; merge remains gated on Jack's exact `merge approved`.

## Appendix A — full migration SQL: `20260727080000_v1b_survey_branching.sql`

```sql
create table public.lms_survey_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null
    references public.lms_lessons (id) on delete cascade,
  position integer not null check (position >= 1),
  title text null,
  default_next_section_id uuid null,
  unique (lesson_id, position),
  unique (id, lesson_id)
);

alter table public.lms_survey_sections
  add constraint lms_survey_sections_default_next_same_lesson_fk
  foreign key (default_next_section_id, lesson_id)
  references public.lms_survey_sections (id, lesson_id);

create index lms_survey_sections_lesson_id_idx
  on public.lms_survey_sections (lesson_id);

insert into public.lms_survey_sections (lesson_id, position, title)
select lesson.id, 1, 'Default'
from public.lms_lessons lesson
where lesson.kind = 'survey';

alter table public.lms_survey_questions
  add column section_id uuid null,
  add column routes jsonb null;

update public.lms_survey_questions question
set section_id = section.id
from public.lms_survey_sections section
where section.lesson_id = question.lesson_id
  and section.position = 1;

alter table public.lms_survey_questions
  alter column section_id set not null,
  add constraint lms_survey_questions_section_same_lesson_fk
    foreign key (section_id, lesson_id)
    references public.lms_survey_sections (id, lesson_id)
    on delete cascade,
  add constraint lms_survey_questions_routes_shape check (
    routes is null or jsonb_typeof(routes) = 'object'
  );

alter table public.lms_survey_questions
  drop constraint lms_survey_questions_lesson_id_position_key;

alter table public.lms_survey_questions
  add constraint lms_survey_questions_section_id_position_key
  unique (section_id, position);

create index lms_survey_questions_section_id_idx
  on public.lms_survey_questions (section_id);

alter table public.lms_survey_responses
  add column choice_free_text jsonb not null default '{}'::jsonb
    check (jsonb_typeof(choice_free_text) = 'object'),
  add column path uuid[] null;

update public.lms_survey_responses response
set path = array[section.id]
from public.lms_survey_sections section
where section.lesson_id = response.lesson_id
  and section.position = 1;

alter table public.lms_survey_responses
  alter column path set not null,
  add constraint lms_survey_responses_path_not_empty
    check (cardinality(path) > 0);

create function public.lms_validate_survey_section_lesson()
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
    raise exception 'survey sections require a survey lesson'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lms_survey_sections_require_survey_lesson
before insert or update on public.lms_survey_sections
for each row execute function public.lms_validate_survey_section_lesson();

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

create or replace function public.lms_validate_survey_response_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  first_section_id uuid;
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

  select section.id into first_section_id
  from public.lms_survey_sections section
  where section.lesson_id = new.lesson_id
  order by section.position
  limit 1;
  if first_section_id is null or new.path[1] <> first_section_id then
    raise exception 'survey response path must start at the first section'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from unnest(new.path) path_section_id
    left join public.lms_survey_sections section
      on section.id = path_section_id
      and section.lesson_id = new.lesson_id
    where section.id is null
  ) then
    raise exception 'survey response path must stay within the survey lesson'
      using errcode = '23514';
  end if;
  if cardinality(new.path) <> (
    select count(distinct path_section_id) from unnest(new.path) path_section_id
  ) then
    raise exception 'survey response path cannot repeat a section'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.lms_assert_survey_flow(p_lesson_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  section_count integer;
  min_position integer;
  max_position integer;
  has_cycle boolean;
  unreachable_required boolean;
  reachable_ids uuid[];
  section_row record;
  gate_row record;
  route_outline text;
  line text;
  outline text := '';
begin
  select count(*), min(position), max(position)
  into section_count, min_position, max_position
  from public.lms_survey_sections
  where lesson_id = p_lesson_id;
  if section_count = 0 then
    raise exception 'survey flow requires at least one section'
      using errcode = '23514';
  end if;
  if min_position <> 1 or max_position <> section_count then
    raise exception 'survey section positions must be sequential from 1'
      using errcode = '23514';
  end if;

  with recursive edges as (
    select section.id as source_id, section.default_next_section_id as target_id
    from public.lms_survey_sections section
    where section.lesson_id = p_lesson_id
      and section.default_next_section_id is not null
    union
    select question.section_id, route.value::uuid
    from public.lms_survey_questions question
    cross join lateral jsonb_each_text(question.routes) route
    where question.lesson_id = p_lesson_id
      and question.routes is not null
  ), walk as (
    select section.id as section_id, array[section.id] as walked, false as cycle
    from public.lms_survey_sections section
    where section.lesson_id = p_lesson_id
    union all
    select edge.target_id, walk.walked || edge.target_id,
      edge.target_id = any(walk.walked)
    from walk
    join edges edge on edge.source_id = walk.section_id
    where not walk.cycle
  )
  select coalesce(bool_or(cycle), false)
  into has_cycle
  from walk;
  if has_cycle then
    raise exception 'survey flow contains a cycle'
      using errcode = '23514';
  end if;

  with recursive edges as (
    select section.id as source_id, section.default_next_section_id as target_id
    from public.lms_survey_sections section
    where section.lesson_id = p_lesson_id
      and section.default_next_section_id is not null
    union
    select question.section_id, route.value::uuid
    from public.lms_survey_questions question
    cross join lateral jsonb_each_text(question.routes) route
    where question.lesson_id = p_lesson_id
      and question.routes is not null
  ), reachable as (
    select section.id as section_id
    from public.lms_survey_sections section
    where section.lesson_id = p_lesson_id
      and section.position = 1
    union
    select edge.target_id
    from reachable
    join edges edge on edge.source_id = reachable.section_id
  )
  select array_agg(section_id) into reachable_ids from reachable;

  select exists (
    select 1
    from public.lms_survey_sections section
    join public.lms_survey_questions question
      on question.section_id = section.id
      and question.required
    where section.lesson_id = p_lesson_id
      and not section.id = any(coalesce(reachable_ids, '{}'::uuid[]))
  ) into unreachable_required;
  if unreachable_required then
    raise exception 'survey flow contains an unreachable required section'
      using errcode = '23514';
  end if;

  for section_row in
    select section.id, section.position, section.title,
      section.default_next_section_id, next_section.position as default_position
    from public.lms_survey_sections section
    left join public.lms_survey_sections next_section
      on next_section.id = section.default_next_section_id
    where section.lesson_id = p_lesson_id
    order by section.position
  loop
    line := format(
      '§%s%s',
      section_row.position,
      case when section_row.title is null then '' else ' ' || section_row.title end
    );
    select question.id, question.position, question.prompt, question.choices,
      question.routes
    into gate_row
    from public.lms_survey_questions question
    where question.section_id = section_row.id
      and question.routes is not null
    limit 1;
    if found then
      select string_agg(
        format('%s→§%s', choice.value ->> 'text', target.position),
        ', ' order by choice.ordinality
      )
      into route_outline
      from jsonb_array_elements(gate_row.choices) with ordinality choice(value, ordinality)
      join lateral (
        select gate_row.routes ->> (choice.value ->> 'id') as target_id
      ) route on route.target_id is not null
      join public.lms_survey_sections target
        on target.id = route.target_id::uuid;
      line := line || format(' → gate Q%s: %s', gate_row.position, route_outline);
      if section_row.default_position is not null then
        line := line || format('; default→§%s', section_row.default_position);
      end if;
    elsif section_row.default_position is not null then
      line := line || format(' → §%s', section_row.default_position);
    else
      line := line || ' → submit';
    end if;
    outline := outline || case when outline = '' then '' else E'\n' end || line;
  end loop;
  return outline;
end;
$$;

create function public.lms_validate_survey_flow_deferred()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_lesson_id uuid;
begin
  target_lesson_id := case
    when tg_op = 'DELETE' then old.lesson_id
    else new.lesson_id
  end;
  if exists (
    select 1
    from public.lms_survey_sections section
    where section.lesson_id = target_lesson_id
  ) then
    perform public.lms_assert_survey_flow(target_lesson_id);
  end if;
  return null;
end;
$$;

create constraint trigger lms_survey_sections_flow_valid
after insert or update or delete on public.lms_survey_sections
deferrable initially deferred
for each row execute function public.lms_validate_survey_flow_deferred();

create constraint trigger lms_survey_questions_flow_valid
after insert or update or delete on public.lms_survey_questions
deferrable initially deferred
for each row execute function public.lms_validate_survey_flow_deferred();

alter table public.lms_survey_sections enable row level security;
alter table public.lms_survey_sections force row level security;
revoke all on table public.lms_survey_sections from public, anon, authenticated;
grant all on table public.lms_survey_sections to service_role;
grant select on table public.lms_survey_sections to authenticated;

create policy lms_survey_sections_select_accessible
on public.lms_survey_sections
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

create function public.lms_admin_replace_survey_flow(
  p_actor_auth_user_id uuid,
  p_lesson_id uuid,
  p_sections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  section jsonb;
  question jsonb;
  expected_section_position integer := 1;
  expected_question_position integer;
  section_id uuid;
  question_id uuid;
  outline text;
  section_rows jsonb;
  question_rows jsonb;
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
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'sections must be a non-empty array' using errcode = '22023';
  end if;

  for section in select value from jsonb_array_elements(p_sections) loop
    if coalesce((section ->> 'position')::integer, 0) <> expected_section_position
      or jsonb_typeof(section -> 'questions') <> 'array'
    then
      raise exception 'invalid survey section at position %', expected_section_position
        using errcode = '22023';
    end if;
    perform (section ->> 'id')::uuid;
    if nullif(section ->> 'default_next_section_id', '') is not null then
      perform (section ->> 'default_next_section_id')::uuid;
    end if;
    expected_question_position := 1;
    for question in select value from jsonb_array_elements(section -> 'questions') loop
      if coalesce((question ->> 'position')::integer, 0) <> expected_question_position
        or btrim(coalesce(question ->> 'prompt', '')) = ''
        or question ->> 'kind' not in (
          'scale_1_5', 'text', 'single_choice', 'multi_choice'
        )
      then
        raise exception 'invalid survey question at section %, position %',
          expected_section_position, expected_question_position
          using errcode = '22023';
      end if;
      perform (question ->> 'id')::uuid;
      expected_question_position := expected_question_position + 1;
    end loop;
    expected_section_position := expected_section_position + 1;
  end loop;

  delete from public.lms_survey_sections where lesson_id = p_lesson_id;

  for section in select value from jsonb_array_elements(p_sections) loop
    section_id := (section ->> 'id')::uuid;
    insert into public.lms_survey_sections (
      id, lesson_id, position, title, default_next_section_id
    ) values (
      section_id,
      p_lesson_id,
      (section ->> 'position')::integer,
      nullif(btrim(coalesce(section ->> 'title', '')), ''),
      null
    );
  end loop;

  for section in select value from jsonb_array_elements(p_sections) loop
    section_id := (section ->> 'id')::uuid;
    update public.lms_survey_sections
    set default_next_section_id = nullif(section ->> 'default_next_section_id', '')::uuid
    where id = section_id;

    for question in select value from jsonb_array_elements(section -> 'questions') loop
      question_id := (question ->> 'id')::uuid;
      insert into public.lms_survey_questions (
        id, lesson_id, section_id, position, prompt, kind, choices, required, routes
      ) values (
        question_id,
        p_lesson_id,
        section_id,
        (question ->> 'position')::integer,
        btrim(question ->> 'prompt'),
        question ->> 'kind',
        case
          when question ->> 'kind' in ('single_choice', 'multi_choice')
            then question -> 'choices'
          else null
        end,
        coalesce((question ->> 'required')::boolean, true),
        case
          when question ? 'routes' and question -> 'routes' <> 'null'::jsonb
            then question -> 'routes'
          else null
        end
      );
    end loop;
  end loop;

  outline := public.lms_assert_survey_flow(p_lesson_id);
  select jsonb_agg(to_jsonb(section_row) order by section_row.position)
  into section_rows
  from public.lms_survey_sections section_row
  where section_row.lesson_id = p_lesson_id;
  select jsonb_agg(to_jsonb(question_row) order by question_row.section_id, question_row.position)
  into question_rows
  from public.lms_survey_questions question_row
  where question_row.lesson_id = p_lesson_id;

  insert into public.lms_admin_actions (
    actor_auth_user_id, action, target
  ) values (
    p_actor_auth_user_id,
    'replace_survey_flow',
    jsonb_build_object(
      'lesson_id', p_lesson_id,
      'section_count', jsonb_array_length(p_sections),
      'outline', outline
    )
  );

  return jsonb_build_object(
    'outline', outline,
    'sections', coalesce(section_rows, '[]'::jsonb),
    'questions', coalesce(question_rows, '[]'::jsonb)
  );
end;
$$;

create or replace function public.lms_admin_replace_survey_questions(
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
  target_section_id uuid;
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
  if (select count(*) from public.lms_survey_sections where lesson_id = p_lesson_id) <> 1 then
    raise exception 'routed surveys must be edited with the survey flow editor'
      using errcode = '22023';
  end if;
  select id into target_section_id
  from public.lms_survey_sections
  where lesson_id = p_lesson_id;

  for question in select value from jsonb_array_elements(p_questions) loop
    question_kind := question ->> 'kind';
    question_choices := question -> 'choices';
    if coalesce((question ->> 'position')::integer, 0) <> expected_position
      or btrim(coalesce(question ->> 'prompt', '')) = ''
      or question_kind not in (
        'scale_1_5', 'text', 'single_choice', 'multi_choice'
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
    id, lesson_id, section_id, position, prompt, kind, choices, required, routes
  )
  select
    coalesce(nullif(value ->> 'id', '')::uuid, gen_random_uuid()),
    p_lesson_id,
    target_section_id,
    (value ->> 'position')::integer,
    btrim(value ->> 'prompt'),
    value ->> 'kind',
    case
      when value ->> 'kind' in ('single_choice', 'multi_choice')
        then value -> 'choices'
      else null
    end,
    coalesce((value ->> 'required')::boolean, true),
    null
  from jsonb_array_elements(p_questions);

  insert into public.lms_admin_actions (
    actor_auth_user_id, action, target
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

revoke all on function public.lms_admin_replace_survey_flow(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_admin_replace_survey_flow(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.lms_assert_survey_flow(uuid)
  from public, anon, authenticated;
grant execute on function public.lms_assert_survey_flow(uuid)
  to service_role;
revoke all on function public.lms_validate_survey_section_lesson()
  from public, anon, authenticated;
revoke all on function public.lms_validate_survey_flow_deferred()
  from public, anon, authenticated;
grant execute on function public.lms_validate_survey_section_lesson()
  to service_role;
grant execute on function public.lms_validate_survey_flow_deferred()
  to service_role;

comment on table public.lms_survey_sections is
  'Ordered routed sections for one survey lesson; position 1 is the entry section.';
comment on column public.lms_survey_questions.routes is
  'Choice id to same-lesson section id overrides for a single-choice gate.';
comment on column public.lms_survey_responses.choice_free_text is
  'Nested question-id and choice-id map for selected allow_free_text options.';
comment on column public.lms_survey_responses.path is
  'Authoritative ordered section ids traversed for this immutable response.';
```

## Appendix B — full migration SQL: `20260727081000_v1b_survey_branching_fk_indexes.sql`

```sql
create index lms_survey_questions_section_same_lesson_idx
  on public.lms_survey_questions (section_id, lesson_id);

create index lms_survey_sections_default_next_same_lesson_idx
  on public.lms_survey_sections (default_next_section_id, lesson_id);
```
