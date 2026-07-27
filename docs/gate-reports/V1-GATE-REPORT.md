# Session V1 — Surveys Gate Report

`[SUPABASE: xfvaohvismisfdggfdfj | calls: 31]`

V1 gate reached. Branch pushed; no merge performed.

## 1. Migration

- `v1_surveys` applied successfully and appears in the sandbox migration ledger.
- The first attempt failed atomically because the existing helper is hardened under `lms_private`; the tracked SQL was corrected and reapplied with no partial schema left behind.
- Source: [`supabase/migrations/20260725090000_v1_surveys.sql`](supabase/migrations/20260725090000_v1_surveys.sql)

<details>
<summary>Migration SQL in full</summary>

```sql
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
  unique(enrollment_id, lesson_id)
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
```

</details>

## 2. Engine and identity discipline

- Survey response presence completes survey lessons.
- Surveys are excluded from quiz gating.
- Required surveys remain included in course completion.
- `moduleUnlocked` uses the course's lowest position.
- Position-0 and position-1 first-module cases are tested.
- Source and all six function copies of both `progression.ts` and `progression-types.ts` compare byte-identical.
- Source: [`src/engine/progression.ts`](src/engine/progression.ts), [`src/engine/progression.test.ts`](src/engine/progression.test.ts)

<details>
<summary>Engine diff</summary>

```diff
 export interface LmsLesson {
-  kind: 'video' | 'reading';
+  kind: 'video' | 'reading' | 'survey';
 }

+export interface LmsSurveyResponse {
+  enrollment_id: string;
+  lesson_id: string;
+}

 export interface ProgressionContext {
   progress: LmsLessonProgress[];
+  surveyResponses: LmsSurveyResponse[];
   attempts: LmsQuizAttempt[];
 }

 export function lessonComplete(
   lesson: LmsLesson,
   progress: LmsLessonProgress[],
+  surveyResponses: LmsSurveyResponse[] = [],
 ): boolean {
+  if (lesson.kind === 'survey') {
+    return surveyResponses.some((response) => response.lesson_id === lesson.id);
+  }
   ...
 }

 export function moduleUnlocked(context: ProgressionContext): boolean {
-  if (course.progression === 'open' || module.position === 1) return true;
+  const courseModules = modules.filter(
+    (candidate) => candidate.course_id === course.id,
+  );
+  const lowestPosition = Math.min(
+    ...courseModules.map((candidate) => candidate.position),
+  );
+  if (
+    course.progression === 'open' ||
+    module.position === lowestPosition
+  ) return true;
   ...
+  return moduleRequirementsComplete(
+    previousModule,
+    lessons,
+    progress,
+    surveyResponses,
+  );
 }

 export function quizAttemptable(context: ProgressionContext): boolean {
+  const quizRequirements = context.lessons.filter(
+    (lesson) => lesson.kind !== 'survey',
+  );
   return (
     moduleUnlocked(context) &&
-    moduleRequirementsComplete(context.module, context.lessons, context.progress)
+    moduleRequirementsComplete(
+      context.module,
+      quizRequirements,
+      context.progress,
+      context.surveyResponses,
+    )
   );
 }

 export function courseComplete(
   ...
+  surveyResponses: LmsSurveyResponse[] = [],
 ): boolean {
   return (
-    requiredLessons.every((lesson) => lessonComplete(lesson, progress)) &&
+    requiredLessons.every((lesson) =>
+      lessonComplete(lesson, progress, surveyResponses)
+    ) &&
     courseQuizzes.every((quiz) => hasPassedAttempt(quiz.id, attempts))
   );
 }
```

</details>

## 3. RLS proof

Live authenticated synthetic learner:

```text
authenticated_questions_visible: 8
own_responses_visible: 2
other_learner_responses_visible: 0
anon_questions_select_privilege: false
anon_responses_select_privilege: false
authenticated_response_update_privilege: false
authenticated_response_delete_privilege: false
```

A direct authenticated response update failed as required:

```text
ERROR 42501: permission denied for table lms_survey_responses
```

## 4. Wet progression run

The live-schema run used `fresh@example.test` and rolled all temporary progress back:

```text
intro_survey_submitted: true
module_1_unlocked: true
module_1_quiz_attemptable_without_post_survey: true
post_module_survey_absent_at_quiz_gate: true
course_complete_before_remaining_surveys: false
course_complete_after_required_surveys: true
fresh_state_rolled_back: true
```

## 5. Admin editor round trip

```text
lesson: Pre-course survey
edited prompt visible: true
original questions restored byte-equal: true
replace_survey_questions audit rows added: 2
```

## 6. Results and bulk export

The live sandbox has three synthetic post-course responses, exceeding the required two:

```text
responses: 3 / enrolled: 8
completion rate: 37.5%
scale average: 4.33
distribution: 1=0, 2=0, 3=0, 4=2, 5=1
choice counts: Foundations=3, Portfolio construction=0, Practice application=0
text responses: 3
```

Both actions appear in `lms_admin_actions`:

```text
view_survey_results
export_survey_responses
```

Evidence distinction: no browser-authenticated operator session was available, so the live aggregation/export and audit exercise used the authorized sandbox database connection. The deployed `lms-admin` handler is ACTIVE and the results UI/API contract is covered by the test suite; this is not represented as a browser-authenticated endpoint invocation.

CSV pasted in full:

```csv
"email","submitted_at","survey","Post-course survey — How confident are you after the course?","Post-course survey — What was the most valuable topic?","Post-course survey — What should we improve?"
"almostdone@example.test","2026-07-16 16:32:00+00","Post-course survey","4","foundations","Synthetic placeholder response from almostdone@example.test"
"complete@example.test","2026-07-16 16:32:00+00","Post-course survey","5","foundations","Synthetic placeholder response from complete@example.test"
"fptcomplete@example.test","2026-07-16 16:32:00+00","Post-course survey","4","foundations","Synthetic placeholder response from fptcomplete@example.test"
```

Spreadsheet verification: imported as 4 rows × 6 columns, all values intact, zero parse/formula errors, and visually inspected with readable headers and fields.

## 7. Suite and changed-file summary

```text
lint:  passed (tsc -b --pretty false)
tests: 21 files passed; 173 tests passed
build: passed; 2,151 modules transformed
note:  existing >500 kB bundle warning remains
```

Justified test changes:

- Dashboard expectations changed from `1/4` and `4/4` to `2/5` and `5/5` because the required Introduction is now position 0 and naturally participates in module completion math.
- The resource-upload fixture targets `fpt-intro-video`, now the first lesson.
- That existing admin upload test received a 10-second allowance because the course editor now renders survey editor/results panels.

Branch delta: 44 files.

- 2 contract/spec files.
- 21 application, engine, learner/admin UI, and test files.
- 19 Edge Function files across seven scoped functions.
- 1 tracked migration and 1 synthetic seed update.
- Unrelated untracked `R1-SPEC.md` was preserved and excluded.

## 8. Deployment and Git gate

ACTIVE with `verify_jwt=true`:

```text
lms-get-quiz v4
lms-grade-attempt v3
lms-progress v4
lms-playback-token v3
lms-resource-token v3
lms-admin v4
lms-submit-survey v1
```

No new V1 survey-table advisor findings. Remaining notices predate this pass: existing no-policy tables, the intentional terms RPC, leaked-password protection configuration, and unused older indexes.

References: [RLS-policy lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [security-definer lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [unused-index lint](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

```text
branch: codex/v1-surveys
first commit: a3bfb68 Authorize lowest-position module unlock
implementation: 3f98f56 Add V1 surveys and reporting
full pushed hash: 3f98f56262a60b8eaf7fc5d9c6b8bc94f1076aa0
remote tracking hash: identical
merge: not performed
```

Stopped at the V1 gate. This report is not independent verification.
