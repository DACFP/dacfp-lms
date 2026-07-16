create or replace function public.lms_grant_enrollment(
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
      updated_at
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
      now()
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
