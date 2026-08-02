-- M2 Amendment 1: named, read-only definition-mutation population used to
-- disclose when current definitions postdate stored attempt/response data.

create view public.v_lms_m2_definition_mutation_population
with (security_invoker = on)
as
select
  action_row.id as audit_action_id,
  action_row.action as mutation_action,
  action_row.created_at as changed_at,
  nullif(action_row.target ->> 'module_id', '') as module_id,
  nullif(action_row.target ->> 'quiz_id', '') as quiz_id,
  nullif(action_row.target ->> 'lesson_id', '') as survey_id
from public.lms_admin_actions action_row
where action_row.action in ('import_question_bank', 'replace_survey_flow');

comment on view public.v_lms_m2_definition_mutation_population is
  'M2 Amendment 1 current-definitions audit population. A matching mutation later than displayed stored data requires an operator disclosure.';

alter view public.v_lms_m2_definition_mutation_population
  set (security_invoker = on);

revoke all on table public.v_lms_m2_definition_mutation_population
  from public, anon, authenticated, service_role;

grant select on table public.v_lms_m2_definition_mutation_population
  to service_role;
