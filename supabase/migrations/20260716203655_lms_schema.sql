create table public.lms_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  progression text not null default 'sequential'
    check (progression in ('sequential', 'open')),
  prerequisite_course_id uuid null references public.lms_courses (id),
  ce_credits numeric null,
  requires_terms_acceptance boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.lms_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  position integer not null,
  title text not null,
  ce_credits numeric null,
  unique (course_id, position)
);

create table public.lms_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.lms_modules (id) on delete cascade,
  position integer not null,
  title text not null,
  kind text not null check (kind in ('video', 'reading')),
  video_ref text null,
  duration_seconds integer null,
  body_md text null,
  is_required boolean not null default true,
  unique (module_id, position)
);

create table public.lms_lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  position integer not null,
  title text not null,
  file_ref text not null
);

create table public.lms_module_quizzes (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.lms_modules (id) on delete cascade,
  question_count integer not null default 10,
  pass_pct integer not null default 70
);

create table public.lms_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.lms_module_quizzes (id) on delete cascade,
  position integer not null,
  prompt text not null,
  choices jsonb not null,
  correct jsonb not null,
  points integer not null default 1
);

create table public.lms_enrollments (
  id uuid primary key default gen_random_uuid(),
  person_email text not null,
  auth_user_id uuid null references auth.users (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  source text not null check (
    source in (
      'fpt_purchase',
      'renewal',
      'enterprise_seat',
      'manual',
      'absorb_migrated',
      'synthetic'
    )
  ),
  enrolled_at timestamptz not null,
  expires_at timestamptz null,
  status text not null check (status in ('active', 'expired', 'revoked')),
  terms_accepted_at timestamptz null,
  order_id uuid null,
  unique (person_email, course_id)
);

create table public.lms_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.lms_enrollments (id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  started_at timestamptz null,
  completed_at timestamptz null,
  last_position_seconds integer not null,
  max_watched_seconds integer not null,
  updated_at timestamptz not null,
  unique (enrollment_id, lesson_id)
);

create table public.lms_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.lms_enrollments (id) on delete cascade,
  quiz_id uuid not null references public.lms_module_quizzes (id) on delete cascade,
  attempt_number integer not null,
  started_at timestamptz not null,
  submitted_at timestamptz null,
  answers jsonb not null,
  score integer null,
  passed boolean null,
  unique (enrollment_id, quiz_id, attempt_number)
);

create table public.lms_completion_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique
    references public.lms_enrollments (id) on delete cascade,
  completed_at timestamptz not null,
  trigger text not null
    check (trigger in ('all_requirements_met', 'manual_admin')),
  processed_at timestamptz null,
  designation_issued boolean not null default false
);

alter table public.lms_courses enable row level security;
alter table public.lms_courses force row level security;
alter table public.lms_modules enable row level security;
alter table public.lms_modules force row level security;
alter table public.lms_lessons enable row level security;
alter table public.lms_lessons force row level security;
alter table public.lms_lesson_resources enable row level security;
alter table public.lms_lesson_resources force row level security;
alter table public.lms_module_quizzes enable row level security;
alter table public.lms_module_quizzes force row level security;
alter table public.lms_quiz_questions enable row level security;
alter table public.lms_quiz_questions force row level security;
alter table public.lms_enrollments enable row level security;
alter table public.lms_enrollments force row level security;
alter table public.lms_lesson_progress enable row level security;
alter table public.lms_lesson_progress force row level security;
alter table public.lms_quiz_attempts enable row level security;
alter table public.lms_quiz_attempts force row level security;
alter table public.lms_completion_events enable row level security;
alter table public.lms_completion_events force row level security;

revoke all on table public.lms_courses from anon, authenticated;
revoke all on table public.lms_modules from anon, authenticated;
revoke all on table public.lms_lessons from anon, authenticated;
revoke all on table public.lms_lesson_resources from anon, authenticated;
revoke all on table public.lms_module_quizzes from anon, authenticated;
revoke all on table public.lms_quiz_questions from anon, authenticated;
revoke all on table public.lms_enrollments from anon, authenticated;
revoke all on table public.lms_lesson_progress from anon, authenticated;
revoke all on table public.lms_quiz_attempts from anon, authenticated;
revoke all on table public.lms_completion_events from anon, authenticated;
revoke select on table public.lms_learner_profiles from anon;

grant all on table public.lms_courses to service_role;
grant all on table public.lms_modules to service_role;
grant all on table public.lms_lessons to service_role;
grant all on table public.lms_lesson_resources to service_role;
grant all on table public.lms_module_quizzes to service_role;
grant all on table public.lms_quiz_questions to service_role;
grant all on table public.lms_enrollments to service_role;
grant all on table public.lms_lesson_progress to service_role;
grant all on table public.lms_quiz_attempts to service_role;
grant all on table public.lms_completion_events to service_role;

grant select on table public.lms_courses to authenticated;
grant select on table public.lms_modules to authenticated;
grant select on table public.lms_lessons to authenticated;
grant select on table public.lms_lesson_resources to authenticated;
grant select on table public.lms_module_quizzes to authenticated;
grant select, update (terms_accepted_at)
  on table public.lms_enrollments to authenticated;
grant select, insert, update
  on table public.lms_lesson_progress to authenticated;
grant select, insert, update
  on table public.lms_quiz_attempts to authenticated;
grant select on table public.lms_completion_events to authenticated;

create function public.lms_has_course_access(
  p_course_id uuid,
  p_require_terms boolean,
  p_require_prerequisite boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lms_enrollments e
    join public.lms_courses c on c.id = e.course_id
    where e.course_id = p_course_id
      and e.auth_user_id = auth.uid()
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
      and (
        not p_require_terms
        or not c.requires_terms_acceptance
        or e.terms_accepted_at is not null
      )
      and (
        not p_require_prerequisite
        or c.prerequisite_course_id is null
        or exists (
          select 1
          from public.lms_completion_events ce
          join public.lms_enrollments prerequisite_enrollment
            on prerequisite_enrollment.id = ce.enrollment_id
          where prerequisite_enrollment.auth_user_id = auth.uid()
            and prerequisite_enrollment.course_id = c.prerequisite_course_id
        )
      )
  );
$$;

revoke all on function public.lms_has_course_access(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.lms_has_course_access(uuid, boolean, boolean)
  to authenticated, service_role;

create policy lms_courses_select_enrolled
on public.lms_courses
for select
to authenticated
using (
  status = 'published'
  and public.lms_has_course_access(id, false, false)
);

create policy lms_modules_select_accessible
on public.lms_modules
for select
to authenticated
using (public.lms_has_course_access(course_id, true, true));

create policy lms_lessons_select_accessible
on public.lms_lessons
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_modules m
    where m.id = module_id
      and public.lms_has_course_access(m.course_id, true, true)
  )
);

create policy lms_lesson_resources_select_accessible
on public.lms_lesson_resources
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_lessons l
    join public.lms_modules m on m.id = l.module_id
    where l.id = lesson_id
      and public.lms_has_course_access(m.course_id, true, true)
  )
);

create policy lms_module_quizzes_select_accessible
on public.lms_module_quizzes
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_modules m
    where m.id = module_id
      and public.lms_has_course_access(m.course_id, true, true)
  )
);

create policy lms_enrollments_select_own
on public.lms_enrollments
for select
to authenticated
using (auth_user_id = auth.uid());

create policy lms_enrollments_update_own
on public.lms_enrollments
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create policy lms_lesson_progress_select_own
on public.lms_lesson_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
  )
);

create policy lms_lesson_progress_insert_own
on public.lms_lesson_progress
for insert
to authenticated
with check (
  exists (
    select 1
    from public.lms_enrollments e
    join public.lms_lessons l on l.id = lesson_id
    join public.lms_modules m on m.id = l.module_id
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
      and e.course_id = m.course_id
  )
);

create policy lms_lesson_progress_update_own
on public.lms_lesson_progress
for update
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.lms_enrollments e
    join public.lms_lessons l on l.id = lesson_id
    join public.lms_modules m on m.id = l.module_id
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
      and e.course_id = m.course_id
  )
);

create policy lms_quiz_attempts_select_own
on public.lms_quiz_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
  )
);

create policy lms_quiz_attempts_insert_own
on public.lms_quiz_attempts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.lms_enrollments e
    join public.lms_module_quizzes q on q.id = quiz_id
    join public.lms_modules m on m.id = q.module_id
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
      and e.course_id = m.course_id
  )
);

create policy lms_quiz_attempts_update_own
on public.lms_quiz_attempts
for update
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.lms_enrollments e
    join public.lms_module_quizzes q on q.id = quiz_id
    join public.lms_modules m on m.id = q.module_id
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
      and e.course_id = m.course_id
  )
);

create policy lms_completion_events_select_own
on public.lms_completion_events
for select
to authenticated
using (
  exists (
    select 1
    from public.lms_enrollments e
    where e.id = enrollment_id
      and e.auth_user_id = auth.uid()
  )
);

create function public.lms_grant_enrollment(
  p_email text,
  p_course_slug text,
  p_source text,
  p_expires_at timestamptz,
  p_order_id uuid
)
returns table (
  auth_user_id uuid,
  primary_enrollment_id uuid,
  bonus_enrollment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
  v_course public.lms_courses%rowtype;
  v_bonus_course_id uuid;
  v_primary_enrollment_id uuid;
  v_bonus_enrollment_id uuid;
begin
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid email is required';
  end if;

  if p_source not in (
    'fpt_purchase',
    'renewal',
    'enterprise_seat',
    'manual',
    'absorb_migrated',
    'synthetic'
  ) then
    raise exception 'Invalid enrollment source';
  end if;

  select *
  into v_course
  from public.lms_courses
  where slug = p_course_slug;

  if not found then
    raise exception 'Unknown course slug';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email) = v_email
  order by created_at
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      null,
      null,
      '',
      '',
      '',
      '',
      '{}'::jsonb,
      jsonb_build_object('display_name', split_part(v_email, '@', 1)),
      false,
      now(),
      now()
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      email
    )
    values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', false
      ),
      'email',
      null,
      now(),
      now(),
      v_email
    )
    on conflict (provider_id, provider) do nothing;
  end if;

  insert into public.lms_learner_profiles (auth_user_id, display_name)
  values (v_user_id, split_part(v_email, '@', 1))
  on conflict (auth_user_id) do nothing;

  insert into public.lms_enrollments (
    person_email,
    auth_user_id,
    course_id,
    source,
    enrolled_at,
    expires_at,
    status,
    terms_accepted_at,
    order_id
  )
  values (
    v_email,
    v_user_id,
    v_course.id,
    p_source,
    now(),
    p_expires_at,
    'active',
    null,
    p_order_id
  )
  on conflict (person_email, course_id) do update
  set auth_user_id = excluded.auth_user_id,
      source = excluded.source,
      expires_at = excluded.expires_at,
      status = 'active',
      order_id = coalesce(excluded.order_id, public.lms_enrollments.order_id)
  returning id into v_primary_enrollment_id;

  if v_course.slug = 'fpt-sandbox' then
    select id
    into v_bonus_course_id
    from public.lms_courses
    where slug = 'bonus-sandbox'
      and prerequisite_course_id = v_course.id;

    if v_bonus_course_id is null then
      raise exception 'FPT bonus course is not configured';
    end if;

    insert into public.lms_enrollments (
      person_email,
      auth_user_id,
      course_id,
      source,
      enrolled_at,
      expires_at,
      status,
      terms_accepted_at,
      order_id
    )
    values (
      v_email,
      v_user_id,
      v_bonus_course_id,
      p_source,
      now(),
      p_expires_at,
      'active',
      null,
      p_order_id
    )
    on conflict (person_email, course_id) do update
    set auth_user_id = excluded.auth_user_id,
        source = excluded.source,
        expires_at = excluded.expires_at,
        status = 'active',
        order_id = coalesce(excluded.order_id, public.lms_enrollments.order_id)
    returning id into v_bonus_enrollment_id;
  end if;

  return query
  select v_user_id, v_primary_enrollment_id, v_bonus_enrollment_id;
end;
$$;

revoke all on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) from public, anon, authenticated;
grant execute on function public.lms_grant_enrollment(
  text,
  text,
  text,
  timestamptz,
  uuid
) to service_role;

create view public.v_lms_person_progress
with (security_invoker = on)
as
select
  e.person_email,
  e.auth_user_id,
  e.course_id,
  c.slug as course_slug,
  c.title as course_title,
  case
    when completion.completed_at is not null then 'completed'
    when e.status <> 'active' then e.status
    when activity.activity_count > 0 then 'in_progress'
    else 'not_started'
  end as status,
  case
    when requirements.requirement_count = 0 then 0::numeric
    else round(
      100::numeric * activity.completed_requirement_count
        / requirements.requirement_count,
      2
    )
  end as percent_complete,
  greatest(
    e.enrolled_at,
    coalesce(activity.last_progress_at, e.enrolled_at),
    coalesce(activity.last_attempt_at, e.enrolled_at),
    coalesce(completion.completed_at, e.enrolled_at)
  ) as last_activity,
  c.ce_credits,
  coalesce(profile.credential_ids, '{}'::jsonb) as credential_ids
from public.lms_enrollments e
join public.lms_courses c on c.id = e.course_id
left join public.lms_learner_profiles profile
  on profile.auth_user_id = e.auth_user_id
cross join lateral (
  select
    (
      select count(*)
      from public.lms_lessons l
      join public.lms_modules m on m.id = l.module_id
      where m.course_id = e.course_id
        and l.is_required
    ) + (
      select count(*)
      from public.lms_module_quizzes q
      join public.lms_modules m on m.id = q.module_id
      where m.course_id = e.course_id
    ) as requirement_count
) requirements
cross join lateral (
  select
    (
      select count(*)
      from public.lms_lesson_progress lp
      join public.lms_lessons l on l.id = lp.lesson_id
      join public.lms_modules m on m.id = l.module_id
      where lp.enrollment_id = e.id
        and m.course_id = e.course_id
        and l.is_required
        and lp.completed_at is not null
    ) + (
      select count(distinct qa.quiz_id)
      from public.lms_quiz_attempts qa
      join public.lms_module_quizzes q on q.id = qa.quiz_id
      join public.lms_modules m on m.id = q.module_id
      where qa.enrollment_id = e.id
        and m.course_id = e.course_id
        and qa.passed = true
    ) as completed_requirement_count,
    (
      select count(*)
      from public.lms_lesson_progress lp
      where lp.enrollment_id = e.id
    ) + (
      select count(*)
      from public.lms_quiz_attempts qa
      where qa.enrollment_id = e.id
    ) as activity_count,
    (
      select max(lp.updated_at)
      from public.lms_lesson_progress lp
      where lp.enrollment_id = e.id
    ) as last_progress_at,
    (
      select max(coalesce(qa.submitted_at, qa.started_at))
      from public.lms_quiz_attempts qa
      where qa.enrollment_id = e.id
    ) as last_attempt_at
) activity
left join lateral (
  select ce.completed_at
  from public.lms_completion_events ce
  where ce.enrollment_id = e.id
) completion on true;

revoke all on table public.v_lms_person_progress from anon, authenticated;
grant select on table public.v_lms_person_progress to authenticated, service_role;
