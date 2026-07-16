begin;

set local role service_role;

insert into public.lms_courses (
  id,
  slug,
  title,
  description,
  status,
  progression,
  prerequisite_course_id,
  ce_credits,
  requires_terms_acceptance,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'fpt-sandbox',
    'FPT Sandbox',
    'A four-module preview of the Financial Professional Track.',
    'published',
    'sequential',
    null,
    18,
    true,
    '2026-07-16T16:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'renewal-2026-sandbox',
    'Renewal 2026 Sandbox',
    'A one-module annual renewal course preview.',
    'published',
    'sequential',
    null,
    1,
    false,
    '2026-07-16T16:00:00Z'
  )
on conflict (id) do update
set slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    progression = excluded.progression,
    prerequisite_course_id = excluded.prerequisite_course_id,
    ce_credits = excluded.ce_credits,
    requires_terms_acceptance = excluded.requires_terms_acceptance;

insert into public.lms_courses (
  id,
  slug,
  title,
  description,
  status,
  progression,
  prerequisite_course_id,
  ce_credits,
  requires_terms_acceptance,
  created_at
)
values (
  '10000000-0000-4000-8000-000000000002',
  'bonus-sandbox',
  'Bonus Sandbox',
  'Open bonus learning unlocked after FPT completion.',
  'published',
  'open',
  '10000000-0000-4000-8000-000000000001',
  3,
  false,
  '2026-07-16T16:00:00Z'
)
on conflict (id) do update
set slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    progression = excluded.progression,
    prerequisite_course_id = excluded.prerequisite_course_id,
    ce_credits = excluded.ce_credits,
    requires_terms_acceptance = excluded.requires_terms_acceptance;

insert into public.lms_modules (id, course_id, position, title, ce_credits)
values
  (md5('fpt-sandbox:module:1')::uuid, '10000000-0000-4000-8000-000000000001', 1, 'Bitcoin Foundations', 4.5),
  (md5('fpt-sandbox:module:2')::uuid, '10000000-0000-4000-8000-000000000001', 2, 'Blockchain and DLT', 4.5),
  (md5('fpt-sandbox:module:3')::uuid, '10000000-0000-4000-8000-000000000001', 3, 'Digital Assets and Currencies', 4.5),
  (md5('fpt-sandbox:module:4')::uuid, '10000000-0000-4000-8000-000000000001', 4, 'Layer 2, Tokens, and DeFi', 4.5),
  (md5('bonus-sandbox:module:1')::uuid, '10000000-0000-4000-8000-000000000002', 1, 'Portfolio Case Study', 1),
  (md5('bonus-sandbox:module:2')::uuid, '10000000-0000-4000-8000-000000000002', 2, 'Advisor Conversation Lab', 1),
  (md5('bonus-sandbox:module:3')::uuid, '10000000-0000-4000-8000-000000000002', 3, 'Market Structure Briefing', 1),
  (md5('renewal-2026-sandbox:module:1')::uuid, '10000000-0000-4000-8000-000000000003', 1, '2026 Annual Update', 1)
on conflict (id) do update
set course_id = excluded.course_id,
    position = excluded.position,
    title = excluded.title,
    ce_credits = excluded.ce_credits;

insert into public.lms_lessons (
  id,
  module_id,
  position,
  title,
  kind,
  video_ref,
  duration_seconds,
  body_md,
  is_required
)
select
  md5('fpt-sandbox:lesson:' || m.position || ':' || lesson_position)::uuid,
  m.id,
  lesson_position,
  case lesson_position
    when 1 then m.title || ': Core lesson'
    when 2 then m.title || ': Applied lesson'
    else m.title || ': Optional reference'
  end,
  case
    when m.position = 1 and lesson_position = 2 then 'reading'
    else 'video'
  end,
  case
    when m.position = 1 and lesson_position = 2 then null
    else 'placeholder://fpt-m' || m.position || '-lesson-' || lesson_position
  end,
  case
    when m.position = 1 and lesson_position = 2 then null
    else 600
  end,
  case
    when m.position = 1 and lesson_position = 2
      then 'Synthetic reading content for the dark-build preview.'
    else null
  end,
  lesson_position <> 3
from public.lms_modules m
cross join generate_series(1, 3) lesson_position
where m.course_id = '10000000-0000-4000-8000-000000000001'
on conflict (id) do update
set module_id = excluded.module_id,
    position = excluded.position,
    title = excluded.title,
    kind = excluded.kind,
    video_ref = excluded.video_ref,
    duration_seconds = excluded.duration_seconds,
    body_md = excluded.body_md,
    is_required = excluded.is_required;

insert into public.lms_lessons (
  id,
  module_id,
  position,
  title,
  kind,
  video_ref,
  duration_seconds,
  body_md,
  is_required
)
select
  md5('bonus-sandbox:lesson:' || m.position || ':1')::uuid,
  m.id,
  1,
  m.title || ': Briefing',
  'reading',
  null,
  null,
  'Synthetic bonus-course reading content.',
  true
from public.lms_modules m
where m.course_id = '10000000-0000-4000-8000-000000000002'
on conflict (id) do update
set module_id = excluded.module_id,
    position = excluded.position,
    title = excluded.title,
    kind = excluded.kind,
    video_ref = excluded.video_ref,
    duration_seconds = excluded.duration_seconds,
    body_md = excluded.body_md,
    is_required = excluded.is_required;

insert into public.lms_lessons (
  id,
  module_id,
  position,
  title,
  kind,
  video_ref,
  duration_seconds,
  body_md,
  is_required
)
select
  md5('renewal-2026-sandbox:lesson:1:1')::uuid,
  m.id,
  1,
  '2026 Annual Update: Required video',
  'video',
  'placeholder://renewal-2026',
  3600,
  null,
  true
from public.lms_modules m
where m.course_id = '10000000-0000-4000-8000-000000000003'
on conflict (id) do update
set module_id = excluded.module_id,
    position = excluded.position,
    title = excluded.title,
    kind = excluded.kind,
    video_ref = excluded.video_ref,
    duration_seconds = excluded.duration_seconds,
    body_md = excluded.body_md,
    is_required = excluded.is_required;

delete from public.lms_lesson_resources
where lesson_id in (
  select l.id
  from public.lms_lessons l
  join public.lms_modules m on m.id = l.module_id
  where m.course_id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  )
);

insert into public.lms_lesson_resources (
  id,
  lesson_id,
  position,
  title,
  file_ref
)
values (
  md5('fpt-sandbox:resource:bitcoin-workbook')::uuid,
  md5('fpt-sandbox:lesson:1:2')::uuid,
  1,
  'Bitcoin foundations workbook (placeholder)',
  '/mock-resources/bitcoin-foundations-workbook.txt'
);

insert into public.lms_module_quizzes (
  id,
  module_id,
  question_count,
  pass_pct
)
select
  md5('fpt-sandbox:quiz:' || m.position)::uuid,
  m.id,
  10,
  70
from public.lms_modules m
where m.course_id = '10000000-0000-4000-8000-000000000001'
union all
select
  md5('renewal-2026-sandbox:quiz:1')::uuid,
  m.id,
  10,
  70
from public.lms_modules m
where m.course_id = '10000000-0000-4000-8000-000000000003'
on conflict (id) do update
set module_id = excluded.module_id,
    question_count = excluded.question_count,
    pass_pct = excluded.pass_pct;

delete from public.lms_quiz_questions
where quiz_id in (
  select q.id
  from public.lms_module_quizzes q
  join public.lms_modules m on m.id = q.module_id
  where m.course_id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003'
  )
);

insert into public.lms_quiz_questions (
  id,
  quiz_id,
  position,
  prompt,
  choices,
  correct,
  points
)
select
  md5(q.id::text || ':question:' || question_position)::uuid,
  q.id,
  question_position,
  'Synthetic question ' || question_position || ' for ' || m.title || '?',
  jsonb_build_array(
    jsonb_build_object('id', 'a', 'text', 'Synthetic choice A'),
    jsonb_build_object('id', 'b', 'text', 'Synthetic choice B'),
    jsonb_build_object('id', 'c', 'text', 'Synthetic choice C'),
    jsonb_build_object('id', 'd', 'text', 'Synthetic choice D')
  ),
  '["a"]'::jsonb,
  1
from public.lms_module_quizzes q
join public.lms_modules m on m.id = q.module_id
cross join generate_series(1, 10) question_position
where m.course_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
);

do $$
declare
  learner_email text;
begin
  foreach learner_email in array array[
    'fresh@example.test',
    'midmodule@example.test',
    'failedquiz@example.test',
    'almostdone@example.test',
    'fptcomplete@example.test',
    'complete@example.test'
  ]
  loop
    perform public.lms_grant_enrollment(
      learner_email,
      'fpt-sandbox',
      'synthetic',
      '2027-07-16T23:59:59Z'::timestamptz,
      null
    );
  end loop;

  perform public.lms_grant_enrollment(
    'fptcomplete@example.test',
    'renewal-2026-sandbox',
    'synthetic',
    '2027-07-16T23:59:59Z'::timestamptz,
    null
  );

  perform public.lms_grant_enrollment(
    'complete@example.test',
    'renewal-2026-sandbox',
    'synthetic',
    '2027-07-16T23:59:59Z'::timestamptz,
    null
  );
end;
$$;

update public.lms_enrollments
set source = 'synthetic',
    status = 'active',
    expires_at = '2027-07-16T23:59:59Z',
    terms_accepted_at = case
      when person_email = 'fresh@example.test'
        and course_id = '10000000-0000-4000-8000-000000000001'
      then null
      else '2026-07-16T16:05:00Z'::timestamptz
    end
where person_email in (
  'fresh@example.test',
  'midmodule@example.test',
  'failedquiz@example.test',
  'almostdone@example.test',
  'fptcomplete@example.test',
  'complete@example.test'
);

update public.lms_learner_profiles profile
set display_name = learner.display_name,
    credential_ids = learner.credential_ids,
    updated_at = '2026-07-16T16:05:00Z'
from (
  values
    ('fresh@example.test', 'Fresh learner', '{}'::jsonb),
    ('midmodule@example.test', 'Mid-module 2', '{}'::jsonb),
    ('failedquiz@example.test', 'Quiz failed on 3', '{}'::jsonb),
    ('almostdone@example.test', 'One quiz from done', '{}'::jsonb),
    ('fptcomplete@example.test', 'FPT completed', '{}'::jsonb),
    (
      'complete@example.test',
      'Fully complete',
      '{"cfp":"SYNTH-CFP-1042","iwi":"SYNTH-IWI-2084","cfa":"SYNTH-CFA-4096"}'::jsonb
    )
) learner(email, display_name, credential_ids)
join public.lms_enrollments enrollment
  on enrollment.person_email = learner.email
 and enrollment.course_id = '10000000-0000-4000-8000-000000000001'
where profile.auth_user_id = enrollment.auth_user_id;

delete from public.lms_completion_events
where enrollment_id in (
  select id
  from public.lms_enrollments
  where person_email in (
    'fresh@example.test',
    'midmodule@example.test',
    'failedquiz@example.test',
    'almostdone@example.test',
    'fptcomplete@example.test',
    'complete@example.test'
  )
);

delete from public.lms_quiz_attempts
where enrollment_id in (
  select id
  from public.lms_enrollments
  where person_email in (
    'fresh@example.test',
    'midmodule@example.test',
    'failedquiz@example.test',
    'almostdone@example.test',
    'fptcomplete@example.test',
    'complete@example.test'
  )
);

delete from public.lms_lesson_progress
where enrollment_id in (
  select id
  from public.lms_enrollments
  where person_email in (
    'fresh@example.test',
    'midmodule@example.test',
    'failedquiz@example.test',
    'almostdone@example.test',
    'fptcomplete@example.test',
    'complete@example.test'
  )
);

insert into public.lms_lesson_progress (
  id,
  enrollment_id,
  lesson_id,
  started_at,
  completed_at,
  last_position_seconds,
  max_watched_seconds,
  updated_at
)
select
  md5(plan.email || ':progress:' || lesson.id::text)::uuid,
  enrollment.id,
  lesson.id,
  '2026-07-16T16:10:00Z',
  '2026-07-16T16:30:00Z',
  coalesce(lesson.duration_seconds, 0),
  coalesce(lesson.duration_seconds, 0),
  '2026-07-16T16:30:00Z'
from (
  values
    ('midmodule@example.test', 'fpt-sandbox', 1),
    ('failedquiz@example.test', 'fpt-sandbox', 3),
    ('almostdone@example.test', 'fpt-sandbox', 4),
    ('fptcomplete@example.test', 'fpt-sandbox', 4),
    ('complete@example.test', 'fpt-sandbox', 4),
    ('complete@example.test', 'bonus-sandbox', 3),
    ('complete@example.test', 'renewal-2026-sandbox', 1)
) plan(email, course_slug, through_module)
join public.lms_courses course on course.slug = plan.course_slug
join public.lms_enrollments enrollment
  on enrollment.person_email = plan.email
 and enrollment.course_id = course.id
join public.lms_modules module
  on module.course_id = course.id
 and module.position <= plan.through_module
join public.lms_lessons lesson
  on lesson.module_id = module.id
 and lesson.is_required;

insert into public.lms_lesson_progress (
  id,
  enrollment_id,
  lesson_id,
  started_at,
  completed_at,
  last_position_seconds,
  max_watched_seconds,
  updated_at
)
select
  md5('midmodule@example.test:progress:' || lesson.id::text)::uuid,
  enrollment.id,
  lesson.id,
  '2026-07-16T16:45:00Z',
  null,
  240,
  240,
  '2026-07-16T16:49:00Z'
from public.lms_courses course
join public.lms_enrollments enrollment
  on enrollment.person_email = 'midmodule@example.test'
 and enrollment.course_id = course.id
join public.lms_modules module
  on module.course_id = course.id
 and module.position = 2
join public.lms_lessons lesson
  on lesson.module_id = module.id
 and lesson.position = 1
where course.slug = 'fpt-sandbox';

insert into public.lms_quiz_attempts (
  id,
  enrollment_id,
  quiz_id,
  attempt_number,
  started_at,
  submitted_at,
  answers,
  score,
  passed
)
select
  md5(plan.email || ':attempt:' || quiz.id::text || ':1')::uuid,
  enrollment.id,
  quiz.id,
  1,
  '2026-07-16T16:35:00Z',
  '2026-07-16T16:40:00Z',
  '{}'::jsonb,
  plan.score,
  plan.passed
from (
  values
    ('midmodule@example.test', 'fpt-sandbox', 1, 8, true),
    ('failedquiz@example.test', 'fpt-sandbox', 1, 8, true),
    ('failedquiz@example.test', 'fpt-sandbox', 2, 7, true),
    ('failedquiz@example.test', 'fpt-sandbox', 3, 6, false),
    ('almostdone@example.test', 'fpt-sandbox', 1, 8, true),
    ('almostdone@example.test', 'fpt-sandbox', 2, 8, true),
    ('almostdone@example.test', 'fpt-sandbox', 3, 8, true),
    ('fptcomplete@example.test', 'fpt-sandbox', 1, 9, true),
    ('fptcomplete@example.test', 'fpt-sandbox', 2, 9, true),
    ('fptcomplete@example.test', 'fpt-sandbox', 3, 9, true),
    ('fptcomplete@example.test', 'fpt-sandbox', 4, 9, true),
    ('complete@example.test', 'fpt-sandbox', 1, 10, true),
    ('complete@example.test', 'fpt-sandbox', 2, 10, true),
    ('complete@example.test', 'fpt-sandbox', 3, 10, true),
    ('complete@example.test', 'fpt-sandbox', 4, 10, true),
    ('complete@example.test', 'renewal-2026-sandbox', 1, 8, true)
) plan(email, course_slug, module_position, score, passed)
join public.lms_courses course on course.slug = plan.course_slug
join public.lms_enrollments enrollment
  on enrollment.person_email = plan.email
 and enrollment.course_id = course.id
join public.lms_modules module
  on module.course_id = course.id
 and module.position = plan.module_position
join public.lms_module_quizzes quiz on quiz.module_id = module.id;

insert into public.lms_completion_events (
  id,
  enrollment_id,
  completed_at,
  trigger,
  processed_at,
  designation_issued
)
select
  md5(plan.email || ':completion:' || course.id::text)::uuid,
  enrollment.id,
  '2026-07-16T17:00:00Z',
  'all_requirements_met',
  null,
  false
from (
  values
    ('fptcomplete@example.test', 'fpt-sandbox'),
    ('complete@example.test', 'fpt-sandbox'),
    ('complete@example.test', 'bonus-sandbox'),
    ('complete@example.test', 'renewal-2026-sandbox')
) plan(email, course_slug)
join public.lms_courses course on course.slug = plan.course_slug
join public.lms_enrollments enrollment
  on enrollment.person_email = plan.email
 and enrollment.course_id = course.id;

commit;
